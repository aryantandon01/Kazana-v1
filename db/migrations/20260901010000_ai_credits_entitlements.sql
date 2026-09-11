-- AI Credits & Entitlements (ADR-018)
-- ============================================================================
-- Universal Kazana AI credit currency:
--   * plans / plan_entitlements  — Free & Premium entitlements (separate layer)
--   * credit_transactions        — append-only ledger (source of truth)
--   * user_credits               — cached balance (atomicity + fast reads)
--   * credit_operations          — AI operation lifecycle + idempotency
--   * ai_operations              — configurable credit costs per AI operation
--   * ai_usage                   — actual AI cost telemetry (tokens, model)
--   * subscriptions              — user -> plan (provider-agnostic)
--
-- Safety rules enforced here:
--   * balance can never go negative (CHECK + SECURITY DEFINER RPC guards)
--   * every credit movement is an append-only ledger row (never edited/deleted)
--   * client roles can never mutate the ledger (no INSERT/UPDATE/DELETE policies)
--   * credit RPCs are executable by service_role ONLY
--
-- Apply in Supabase SQL Editor (after all prior migrations).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. plans — subscription/plan catalog (configurable, no hardcoded pricing)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'inr',
  billing_interval TEXT NOT NULL DEFAULT 'month',
  welcome_credit_grant INTEGER NOT NULL DEFAULT 0 CHECK (welcome_credit_grant >= 0),
  monthly_credit_grant INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credit_grant >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plans IS
  'Subscription/plan catalog. Credit grants and entitlements are configured here — never hardcoded in application code.';

-- ---------------------------------------------------------------------------
-- 2. plan_entitlements — feature access per plan (separate from credit ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_entitlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  max_limit INTEGER CHECK (max_limit IS NULL OR max_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plan_id, feature_key)
);

COMMENT ON TABLE plan_entitlements IS
  'Feature access matrix per plan. max_limit NULL = unlimited. Jobs/matching/alerts remain unlimited for every plan.';

-- ---------------------------------------------------------------------------
-- 3. subscriptions — user -> plan (provider-agnostic internal model)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired', 'paused')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_active
  ON subscriptions (user_id) WHERE status IN ('active', 'trialing');

COMMENT ON TABLE subscriptions IS
  'Internal subscription state. Never coupled to a payment provider; the system only ever sees "subscription became active".';

-- ---------------------------------------------------------------------------
-- 4. credit_transactions — append-only credit ledger (the source of truth)
--    amount > 0 = granted/purchased/refunded; amount < 0 = consumed/expired
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN (
      'grant', 'subscription_grant', 'promotional_bonus', 'referral_bonus',
      'usage', 'purchase', 'refund', 'expiration', 'adjustment', 'admin_adjustment'
    )),
  feature TEXT,
  operation_slug TEXT,
  reference_id TEXT,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  provider TEXT,
  external_transaction_id TEXT,
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_tx_reference ON credit_transactions (user_id, reference_id);
CREATE INDEX IF NOT EXISTS idx_credit_tx_expiring ON credit_transactions (expires_at) WHERE amount > 0;

-- Idempotency: one AI operation / one grant per (user, key)
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_idempotency
  ON credit_transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
-- Monthly / welcome grants: unique per (user, type, reference) — webhook retries cannot double-grant
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_tx_grant_reference
  ON credit_transactions (user_id, transaction_type, reference_id)
  WHERE transaction_type IN ('grant', 'subscription_grant') AND reference_id IS NOT NULL;

COMMENT ON TABLE credit_transactions IS
  'Append-only credit ledger. Positive = granted/purchased/refunded, negative = consumed/expired. Never edited or deleted.';

-- ---------------------------------------------------------------------------
-- 5. user_credits — cached balance (atomicity + fast reads; ledger stays authoritative)
--    available_credits already reflects reserved holds (see credit_reserve).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  available_credits INTEGER NOT NULL DEFAULT 0 CHECK (available_credits >= 0),
  reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_credits IS
  'Derived credit balance cache. credit_transactions is the source of truth; credit_reconcile_user() can recompute from the ledger at any time.';

-- ---------------------------------------------------------------------------
-- 6. credit_operations — AI operation lifecycle + idempotency
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_operations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_slug TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  reference_id TEXT,
  credit_amount INTEGER NOT NULL CHECK (credit_amount > 0),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'refunded', 'failed')),
  credit_transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
  refund_transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
  ai_usage_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ops_user ON credit_operations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ops_stale ON credit_operations (created_at) WHERE status = 'reserved';

COMMENT ON TABLE credit_operations IS
  'Lifecycle of one billable AI operation: reserved -> consumed | refunded. idempotency_key prevents double-charging retries.';


-- ---------------------------------------------------------------------------
-- 7. ai_operations — centralized catalog of billable AI operations
--    Credit costs are configured here — NEVER hardcoded in API routes.
--    Provider/model are optional overrides; defaults come from env.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_operations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  feature TEXT NOT NULL,
  credit_cost INTEGER NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  min_plan_slug TEXT,
  provider TEXT,
  model TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_operations IS
  'Central catalog of AI operations and their configurable credit costs. Pricing changes never require code changes.';

-- ---------------------------------------------------------------------------
-- 8. ai_usage — actual AI cost telemetry (separate from user-visible credits)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_slug TEXT,
  feature TEXT,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  estimated_cost NUMERIC(12,6),
  credit_operation_id UUID REFERENCES credit_operations(id) ON DELETE SET NULL,
  credit_transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage (feature, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage (provider, model, created_at);

COMMENT ON TABLE ai_usage IS
  'Actual AI consumption (provider, model, tokens) linked to the credit operation/transaction that paid for it. Enables unit-economics analysis independent of user-visible credits.';


-- ---------------------------------------------------------------------------
-- 9. RLS — users can read their own data; catalogs are public read;
--    nothing is client-writable. Service role (RPCs) performs all mutations.
-- ---------------------------------------------------------------------------
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Public read for config/catalogs (same convention as confidence_rules / lookup tables)
DROP POLICY IF EXISTS "public read plans" ON plans;
CREATE POLICY "public read plans" ON plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read plan entitlements" ON plan_entitlements;
CREATE POLICY "public read plan entitlements" ON plan_entitlements FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read ai operations" ON ai_operations;
CREATE POLICY "public read ai operations" ON ai_operations FOR SELECT USING (true);

-- Owner read only. NO insert/update/delete policies: clients can never fabricate
-- or mutate credits, subscriptions, or usage.
DROP POLICY IF EXISTS "owner read subscriptions" ON subscriptions;
CREATE POLICY "owner read subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner read credit transactions" ON credit_transactions;
CREATE POLICY "owner read credit transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner read user credits" ON user_credits;
CREATE POLICY "owner read user credits" ON user_credits FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner read credit operations" ON credit_operations;
CREATE POLICY "owner read credit operations" ON credit_operations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "owner read ai usage" ON ai_usage;
CREATE POLICY "owner read ai usage" ON ai_usage FOR SELECT USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 10. updated_at triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS credit_operations_updated_at ON credit_operations;
CREATE TRIGGER credit_operations_updated_at
  BEFORE UPDATE ON credit_operations FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 11. Seeds — default plans, entitlements, and AI operation catalog
--     (configurable later without code changes)
-- ---------------------------------------------------------------------------
INSERT INTO plans (slug, name, price, currency, billing_interval, welcome_credit_grant, monthly_credit_grant, active, metadata)
VALUES
  ('free',    'Free',    0,   'inr', 'month', 25,  0,   true, '{}'),
  ('premium', 'Premium', 0,   'inr', 'month', 25, 100, true, '{}')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plan_entitlements (plan_id, feature_key, enabled, max_limit)
SELECT p.id, e.feature_key, e.enabled, e.max_limit
FROM plans p
CROSS JOIN (VALUES
  ('jobs',                true, NULL::integer),
  ('matching',            true, NULL),
  ('job_alerts',          true, NULL),
  ('resume_storage',      true, NULL),
  ('resume_optimization', true, NULL),
  ('resume_export',       true, NULL),
  ('advanced_resume_ai',  false, NULL)
) AS e(feature_key, enabled, max_limit)
ON CONFLICT (plan_id, feature_key) DO NOTHING;

UPDATE plan_entitlements SET enabled = true
WHERE feature_key = 'advanced_resume_ai'
  AND plan_id = (SELECT id FROM plans WHERE slug = 'premium');

INSERT INTO ai_operations (slug, display_name, feature, credit_cost, enabled, min_plan_slug, description)
VALUES
  ('resume_analysis',     'Resume Analysis',     'resume_optimization', 0, true, NULL, 'Initial structured parse + deterministic quality analysis of a resume.'),
  ('resume_optimization', 'Resume Optimization', 'resume_optimization', 5, true, NULL, 'General / ATS-focused resume improvement suggestions.'),
  ('resume_tailoring',    'Resume Tailoring',    'resume_optimization', 8, true, NULL, 'Resume optimization against a specific target job.'),
  ('resume_rewrite',      'Resume Rewrite',      'resume_optimization', 3, true, NULL, 'Targeted rewrite of bullets or summary sections.')
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. SECURITY DEFINER functions — the ONLY way to mutate the credit system.
--     All balance checks + ledger inserts + cache updates happen inside a
--     single function invocation (one transaction) under a row lock, so
--     concurrent requests can never double-spend or go negative.
--     Executable by service_role only (see revokes at the bottom).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- credit_grant_internal — shared by trigger, RPC, and monthly-grant cron.
-- Idempotent: same (user, idempotency_key) or (user, type, reference_id)
-- returns NULL instead of granting twice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_grant_internal(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'grant',
  p_feature TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_amount_must_be_positive' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    -- Ensure cache row exists, then serialize concurrent mutations for this user.
    INSERT INTO user_credits (user_id, available_credits, reserved_credits)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    PERFORM 1 FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

    INSERT INTO credit_transactions
      (user_id, amount, transaction_type, feature, reference_id, idempotency_key, expires_at, metadata, created_by)
    VALUES
      (p_user_id, p_amount, p_type, p_feature, p_reference_id, p_idempotency_key, p_expires_at,
       COALESCE(p_metadata, '{}'::jsonb), p_created_by)
    RETURNING id INTO v_tx;

    UPDATE user_credits SET available_credits = available_credits + p_amount
    WHERE user_id = p_user_id;

    RETURN v_tx;
  EXCEPTION
    WHEN unique_violation THEN
      -- Idempotent replay (same idempotency key or same grant reference).
      RETURN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- credit_grant — public RPC wrapper (service/admin only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_grant(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'grant',
  p_feature TEXT DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_created_by TEXT DEFAULT 'system'
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.credit_grant_internal(p_user_id, p_amount, p_type, p_feature, p_reference_id, p_idempotency_key, p_expires_at, p_metadata, p_created_by);
$$;

-- ---------------------------------------------------------------------------
-- get_credit_balance — current cached balance + active plan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_credit_balance(p_user_id UUID)
RETURNS TABLE (
  available_credits INTEGER,
  reserved_credits INTEGER,
  plan_slug TEXT,
  plan_name TEXT,
  plan_price NUMERIC,
  plan_currency TEXT,
  monthly_credit_grant INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available INTEGER;
  v_reserved INTEGER;
  v_plan_slug TEXT;
  v_plan_name TEXT;
  v_plan_price NUMERIC;
  v_plan_currency TEXT;
  v_monthly INTEGER;
BEGIN
  INSERT INTO user_credits (user_id, available_credits, reserved_credits)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(available_credits, 0), COALESCE(reserved_credits, 0)
  INTO v_available, v_reserved
  FROM user_credits
  WHERE user_id = p_user_id;

  SELECT COALESCE(p.slug, 'free'), COALESCE(p.name, 'Free'), COALESCE(p.price, 0),
         COALESCE(p.currency, 'inr'), COALESCE(p.monthly_credit_grant, 0)
  INTO v_plan_slug, v_plan_name, v_plan_price, v_plan_currency, v_monthly
  FROM subscriptions s
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE s.user_id = p_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_plan_slug IS NULL THEN
    v_plan_slug := 'free';
    v_plan_name := 'Free';
    v_plan_price := 0;
    v_plan_currency := 'inr';
    v_monthly := COALESCE((SELECT monthly_credit_grant FROM plans WHERE slug = 'free' LIMIT 1), 0);
  END IF;

  RETURN QUERY SELECT v_available, v_reserved, v_plan_slug, v_plan_name, v_plan_price, v_plan_currency, v_monthly;
END;
$$;

DROP TRIGGER IF EXISTS user_credits_updated_at ON user_credits;
CREATE TRIGGER user_credits_updated_at
  BEFORE UPDATE ON user_credits FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- credit_reserve — atomically reserve credits for an AI operation.
--   * Locks the user's balance row (serializes concurrent requests).
--   * Replays an existing idempotency key instead of double-charging.
--   * Debits the ledger immediately (negative 'usage' row) so the balance
--     already reflects the hold; finalize/release never double-count.
-- Returns jsonb: { is_new, status, operation }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_reserve(
  p_user_id UUID,
  p_operation_slug TEXT,
  p_amount INTEGER,
  p_idempotency_key TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_feature TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op credit_operations%ROWTYPE;
  v_sum INTEGER;
  v_tx UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_amount_must_be_positive' USING ERRCODE = 'P0001';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent replay: a retry of the same operation returns the existing record.
  SELECT * INTO v_op FROM credit_operations
  WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('is_new', false, 'status', v_op.status, 'operation', to_jsonb(v_op));
  END IF;

  -- Ensure cache row, then take the row lock: concurrent reserves for the same
  -- user serialize here, and the ledger sum is re-read AFTER acquiring the lock.
  INSERT INTO user_credits (user_id, available_credits, reserved_credits)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1 FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM credit_transactions WHERE user_id = p_user_id;

  IF v_sum < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object('required', p_amount, 'available', v_sum)::text;
  END IF;

  -- Debit the ledger (the reservation hold).
  INSERT INTO credit_transactions
    (user_id, amount, transaction_type, feature, operation_slug, reference_id, idempotency_key, metadata, created_by)
  VALUES
    (p_user_id, -p_amount, 'usage', p_feature, p_operation_slug, p_reference_id, p_idempotency_key,
     jsonb_build_object('status', 'reserved'), 'system')
  RETURNING id INTO v_tx;

  INSERT INTO credit_operations
    (user_id, operation_slug, idempotency_key, reference_id, credit_amount, status, credit_transaction_id)
  VALUES
    (p_user_id, p_operation_slug, p_idempotency_key, p_reference_id, p_amount, 'reserved', v_tx)
  RETURNING * INTO v_op;

  UPDATE user_credits
  SET available_credits = v_sum - p_amount,
      reserved_credits = COALESCE(reserved_credits, 0) + p_amount
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('is_new', true, 'status', v_op.status, 'operation', to_jsonb(v_op));
END;
$$;


-- ---------------------------------------------------------------------------
-- credit_finalize — mark a reservation consumed after the AI call succeeded.
-- Ledger already reflects the debit; only state + reserved counter change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_finalize(p_operation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op credit_operations%ROWTYPE;
BEGIN
  UPDATE credit_operations SET status = 'consumed'
  WHERE id = p_operation_id AND status = 'reserved'
  RETURNING * INTO v_op;

  IF NOT FOUND THEN
    SELECT * INTO v_op FROM credit_operations WHERE id = p_operation_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'operation_not_found' USING ERRCODE = 'P0001';
    END IF;
    RETURN to_jsonb(v_op); -- already consumed/refunded — idempotent
  END IF;

  UPDATE user_credits SET reserved_credits = GREATEST(0, reserved_credits - v_op.credit_amount)
  WHERE user_id = v_op.user_id;

  UPDATE credit_transactions
  SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{status}', '"finalized"')
  WHERE id = v_op.credit_transaction_id;

  RETURN to_jsonb(v_op);
END;
$$;

-- ---------------------------------------------------------------------------
-- credit_release — refund a reservation after the AI call failed.
-- Creates a compensating positive 'refund' ledger row (append-only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_release(
  p_operation_id UUID,
  p_reason TEXT DEFAULT 'ai_failure',
  p_created_by TEXT DEFAULT 'system'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op credit_operations%ROWTYPE;
  v_refund_tx UUID;
BEGIN
  SELECT * INTO v_op FROM credit_operations WHERE id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operation_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_op.status = 'refunded' THEN
    RETURN to_jsonb(v_op); -- idempotent
  END IF;

  IF v_op.status <> 'reserved' THEN
    RAISE EXCEPTION 'operation_not_releasable' USING ERRCODE = 'P0001', DETAIL = v_op.status;
  END IF;

  UPDATE credit_operations SET status = 'failed' WHERE id = v_op.id AND status = 'reserved';
  IF NOT FOUND THEN
    RETURN to_jsonb(v_op);
  END IF;

  INSERT INTO credit_transactions
    (user_id, amount, transaction_type, feature, operation_slug, reference_id, idempotency_key, metadata, created_by)
  VALUES
    (v_op.user_id, v_op.credit_amount, 'refund', NULL, v_op.operation_slug, v_op.reference_id,
     'refund:' || v_op.id, jsonb_build_object('operation_id', v_op.id, 'reason', p_reason), p_created_by)
  RETURNING id INTO v_refund_tx;

  UPDATE credit_operations SET status = 'refunded', refund_transaction_id = v_refund_tx WHERE id = v_op.id;

  UPDATE user_credits
  SET available_credits = available_credits + v_op.credit_amount,
      reserved_credits = GREATEST(0, reserved_credits - v_op.credit_amount)
  WHERE user_id = v_op.user_id;

  RETURN to_jsonb(v_op);
END;
$$;


-- ---------------------------------------------------------------------------
-- credit_expire — materialize expired credits as auditable 'expiration' rows.
-- Consumption priority: expiring-soonest first, capped at current balance.
-- The pool is fungible; the ledger remains append-only (nothing is deleted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_expire(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx RECORD;
  v_sum INTEGER;
  v_expire INTEGER;
  v_count INTEGER := 0;
BEGIN
  FOR tx IN
    SELECT * FROM credit_transactions
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
      AND amount > 0
      AND expires_at IS NOT NULL
      AND expires_at <= now()
      AND COALESCE(metadata->>'expired', 'false') = 'false'
    ORDER BY expires_at ASC
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM credit_transactions WHERE user_id = tx.user_id;

    IF v_sum <= 0 THEN
      -- Nothing left to expire (already consumed); just mark to avoid reprocessing.
      UPDATE credit_transactions SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{expired}', 'true')
      WHERE id = tx.id;
      CONTINUE;
    END IF;

    v_expire := LEAST(tx.amount, v_sum);
    IF v_expire <= 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO credit_transactions
      (user_id, amount, transaction_type, feature, reference_id, idempotency_key, metadata, created_by)
    VALUES
      (tx.user_id, -v_expire, 'expiration', tx.feature, tx.id::text, 'expire:' || tx.id,
       jsonb_build_object('source_tx', tx.id, 'expired', true), 'system');

    UPDATE credit_transactions SET metadata = jsonb_set(COALESCE(metadata, '{}'), '{expired}', 'true')
    WHERE id = tx.id;

    UPDATE user_credits SET available_credits = GREATEST(0, available_credits - v_expire)
    WHERE user_id = tx.user_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- credit_adjust — administrative adjustment (admin-only; service role).
-- Signed amount: positive = credit, negative = clawback (never below zero).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_adjust(
  p_user_id UUID,
  p_amount INTEGER,
  p_reference_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum INTEGER;
  v_tx UUID;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'amount_must_be_nonzero' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO user_credits (user_id, available_credits, reserved_credits)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM 1 FROM user_credits WHERE user_id = p_user_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM credit_transactions WHERE user_id = p_user_id;

  IF p_amount < 0 AND v_sum + p_amount < 0 THEN
    RAISE EXCEPTION 'insufficient_credits'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object('required', -p_amount, 'available', v_sum)::text;
  END IF;

  INSERT INTO credit_transactions
    (user_id, amount, transaction_type, reference_id, metadata, created_by)
  VALUES
    (p_user_id, p_amount, 'admin_adjustment', p_reference_id,
     jsonb_build_object('reason', p_reason, 'adjusted_by', p_created_by), p_created_by)
  RETURNING id INTO v_tx;

  UPDATE user_credits SET available_credits = GREATEST(0, available_credits + p_amount)
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'transaction_id', v_tx,
    'available', (SELECT available_credits FROM user_credits WHERE user_id = p_user_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- credit_reconcile_user — recompute the cached balance from the ledger.
-- NOTE: resets reserved_credits to 0. Safe when no reservations are in flight
-- (e.g. migration backfill, tests, post-incident reconciliation).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_reconcile_user(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum INTEGER;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_sum FROM credit_transactions WHERE user_id = p_user_id;
  IF v_sum < 0 THEN v_sum := 0; END IF;

  INSERT INTO user_credits (user_id, available_credits, reserved_credits)
  VALUES (p_user_id, v_sum, 0)
  ON CONFLICT (user_id) DO UPDATE
    SET available_credits = v_sum, reserved_credits = 0, updated_at = now();

  RETURN v_sum;
END;
$$;


-- ---------------------------------------------------------------------------
-- process_monthly_grants — grant each active subscription's monthly credit
-- allocation for its current period. Idempotent via the unique
-- (user, type, reference) index — repeated webhooks/cron runs cannot
-- double-grant. Credits expire at the end of the billing period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_monthly_grants()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  v_granted INTEGER := 0;
  v_grant UUID;
BEGIN
  FOR s IN
    SELECT s.id AS subscription_id, s.user_id, p.monthly_credit_grant, s.current_period_start, s.current_period_end
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.status IN ('active', 'trialing')
      AND s.current_period_start IS NOT NULL
      AND p.monthly_credit_grant > 0
  LOOP
    v_grant := public.credit_grant_internal(
      s.user_id,
      s.monthly_credit_grant,
      'subscription_grant',
      NULL,
      'subscription:' || s.subscription_id || ':' || s.current_period_start::text,
      'subgrant:' || s.subscription_id || ':' || s.current_period_start::text,
      s.current_period_end,
      jsonb_build_object('subscription_id', s.subscription_id, 'period_start', s.current_period_start),
      'system'
    );
    IF v_grant IS NOT NULL THEN
      v_granted := v_granted + 1;
    END IF;
  END LOOP;

  RETURN v_granted;
END;
$$;

-- ---------------------------------------------------------------------------
-- release_stale_reservations — refund reservations that were never finalized
-- (server crash / timeout after the reserve step). Runs on a schedule.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_stale_reservations(p_max_age_minutes INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  op RECORD;
  v_released INTEGER := 0;
  v_refund_tx UUID;
BEGIN
  FOR op IN
    SELECT * FROM credit_operations
    WHERE status = 'reserved'
      AND created_at < now() - make_interval(mins => GREATEST(p_max_age_minutes, 1))
    ORDER BY created_at ASC
    LIMIT 500
  LOOP
    BEGIN
      UPDATE credit_operations SET status = 'failed' WHERE id = op.id AND status = 'reserved';
      IF NOT FOUND THEN
        CONTINUE;
      END IF;

      INSERT INTO credit_transactions
        (user_id, amount, transaction_type, feature, operation_slug, reference_id, idempotency_key, metadata, created_by)
      VALUES
        (op.user_id, op.credit_amount, 'refund', NULL, op.operation_slug, op.reference_id, 'refund:' || op.id,
         jsonb_build_object('operation_id', op.id, 'reason', 'stale_reservation'), 'system')
      RETURNING id INTO v_refund_tx;

      UPDATE credit_operations SET status = 'refunded', refund_transaction_id = v_refund_tx WHERE id = op.id;

      UPDATE user_credits
      SET available_credits = available_credits + op.credit_amount,
          reserved_credits = GREATEST(0, reserved_credits - op.credit_amount)
      WHERE user_id = op.user_id;

      v_released := v_released + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE; -- keep sweeping; do not fail the whole run
    END;
  END LOOP;

  RETURN v_released;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. New-user welcome grant (trigger on auth.users) + backfill for existing
--     users. Every existing user starts on the Free plan with the configured
--     welcome grant — no one loses access to existing free functionality.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_welcome INTEGER;
BEGIN
  INSERT INTO user_credits (user_id, available_credits, reserved_credits)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT COALESCE(welcome_credit_grant, 0) INTO v_welcome
  FROM plans WHERE slug = 'free' AND active LIMIT 1;

  IF v_welcome IS NULL THEN v_welcome := 0; END IF;

  IF v_welcome > 0 THEN
    PERFORM public.credit_grant_internal(
      NEW.id, v_welcome, 'grant', NULL,
      'welcome:' || NEW.id, 'welcome:' || NEW.id,
      NULL, jsonb_build_object('reason', 'welcome_grant'), 'system'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: cached balance rows + welcome grants for users created before this migration.
INSERT INTO user_credits (user_id, available_credits, reserved_credits)
SELECT id, 0, 0 FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO credit_transactions
  (user_id, amount, transaction_type, reference_id, idempotency_key, metadata, created_by)
SELECT
  u.id,
  COALESCE(p.welcome_credit_grant, 0),
  'grant',
  'welcome:' || u.id,
  'welcome:' || u.id,
  jsonb_build_object('reason', 'welcome_grant'),
  'system'
FROM auth.users u
LEFT JOIN plans p ON p.slug = 'free'
WHERE COALESCE(p.welcome_credit_grant, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct
    WHERE ct.user_id = u.id AND ct.reference_id = 'welcome:' || u.id
  );

-- Recompute cached balances from the ledger (no reservations exist at this point).
UPDATE user_credits uc
SET available_credits = (
  SELECT COALESCE(SUM(ct.amount), 0)
  FROM credit_transactions ct
  WHERE ct.user_id = uc.user_id
)
WHERE EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.user_id = uc.user_id);

-- ---------------------------------------------------------------------------
-- 14. Security: credit functions are executable ONLY by service_role.
--     The browser (anon/authenticated) cannot call them, and the ledger
--     tables have no client write policies. Server code uses the service
--     role client to invoke these.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.credit_grant_internal(uuid, integer, text, text, text, text, timestamptz, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_grant_internal(uuid, integer, text, text, text, text, timestamptz, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.credit_grant(uuid, integer, text, text, text, text, timestamptz, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_grant(uuid, integer, text, text, text, text, timestamptz, jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_credit_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_balance(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.credit_reserve(uuid, text, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reserve(uuid, text, integer, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.credit_finalize(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_finalize(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.credit_release(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_release(uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.credit_expire(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_expire(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.credit_adjust(uuid, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_adjust(uuid, integer, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.credit_reconcile_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_reconcile_user(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.process_monthly_grants() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_monthly_grants() TO service_role;

REVOKE ALL ON FUNCTION public.release_stale_reservations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_reservations(integer) TO service_role;

