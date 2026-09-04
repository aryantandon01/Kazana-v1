# AI Credits & Entitlements

Kazana's universal AI-currency and usage-control layer. Users see **AI Credits**, never tokens, model prices, or API requests.

```
Kazana feature → AI operation → credit cost → AI provider/model → usage tracking
```

## Concepts (three separate layers)

| Layer | Tables | Responsibility |
|-------|--------|----------------|
| Subscription / plan | `plans`, `subscriptions` | Free vs Premium; billing periods |
| Entitlements | `plan_entitlements` | Feature access per plan |
| Credit ledger | `credit_transactions`, `credit_operations`, `user_credits` | Every credit movement, auditable |
| AI catalog + cost | `ai_operations`, `ai_usage` | Configurable credit costs; actual AI cost |

Never collapse these into one field. A user's plan is not their balance; a feature flag is not a grant.

## The ledger

`credit_transactions` is **append-only** and authoritative. `user_credits` is a derived cache (`available_credits` ≥ 0, `reserved_credits` ≥ 0) recomputable from the ledger via `credit_reconcile_user(user_id)`.

- `amount > 0` = granted / purchased / refunded
- `amount < 0` = consumed (usage) / expired
- Every row carries `transaction_type`, `feature`, `operation_slug`, `reference_id`, `idempotency_key`, `metadata`, `created_by`.

Transaction types: `grant`, `subscription_grant`, `promotional_bonus`, `referral_bonus`, `usage`, `purchase`, `refund`, `expiration`, `adjustment`, `admin_adjustment`.

## Consumption lifecycle (the gate)

Every billable AI operation runs through `lib/credits/gate.js` → `runWithCredits(...)`:

```
resolve operation (ai_operations.credit_cost)
  → entitlement check (min_plan_slug, if any)
  → reserve credits (atomic, ledger debited, user row locked)
  → call AI provider
  → record ai_usage (provider/model/tokens, linked to the operation)
  → finalize (consumed)
  → on ANY failure: release (compensating +refund row)
```

- **Reserve-before-run** is deliberate: it prevents free-running AI on crash and guarantees the balance was available atomically.
- Free operations (`credit_cost = 0`, e.g. `resume_analysis`) skip reservation but still record `ai_usage`.
- If the provider has no API key configured (`model: 'none'`), a paid reservation is released — users are never charged for AI that didn't run.

## Concurrency & safety

- `credit_reserve` locks the user's `user_credits` row `FOR UPDATE` inside a single SECURITY DEFINER transaction, then re-reads the ledger sum. Concurrent requests serialize; the second one sees the reduced balance.

## Idempotency

- AI ops: unique `(user_id, idempotency_key)` on `credit_operations` + the ledger. The UI passes a `uuid` per action; a retry with the same key returns the existing operation and never double-charges.
- Grants: unique `(user_id, transaction_type, reference_id)` for `grant`/`subscription_grant`. A webhook retry cannot double-grant.

## Refunds

Append-only: a failed op produces `-5 usage` then `+5 refund`. The original row is never edited or deleted. `release_stale_reservations(minutes)` (cron) refunds reservations that were never finalized after a crash.

## Expiration

- Positive grants carry `expires_at` (subscription credits expire at `current_period_end`; purchases would get a longer window).
- `credit_expire()` materializes expired credits as `expiration` rows (auditable; nothing is deleted). Expired credits are excluded from the available balance and cannot be consumed.
- Priority rule (documented): expiring promotional → expiring subscription → purchased (soonest first) → non-expiring. The pool is fungible; expiration consumes soonest-expiring lots from what remains. Full lot-level FIFO is a future refinement.

## Monthly grants

`process_monthly_grants()` grants each active/trialing subscription its `plans.monthly_credit_grant` for the current period, idempotently keyed by `subscription:{id}:{period_start}`. Runs on the credits cron (hourly) and will also be triggered by the future payment provider's "subscription became active" event.

## New users

- A trigger on `auth.users` (`handle_new_user`) creates the `user_credits` row and grants the Free plan's `welcome_credit_grant`.
- The migration backfills existing users the same way — no one loses access to existing free functionality.

## AI cost telemetry

`ai_usage` records `provider`, `model`, token counts, and optional `estimated_cost` per call, linked to the credit operation/transaction. This is the unit-economics layer — independent of user-visible credits — and the basis for future Premium pricing.

- The no-negative invariant is enforced by the RPC guard **and** `CHECK (available_credits >= 0)`.
- All credit mutations happen in SECURITY DEFINER functions granted **only to `service_role`**. Browser clients cannot call them, and the ledger tables have no insert/update/delete RLS policies — only owner-read.

## API surface

| Endpoint | Purpose |
|----------|---------|
| `GET /api/credits` | Balance, plan, this-month usage, recent activity |
| `GET /api/credits/transactions` | Paginated ledger |
| `GET /api/entitlements` | Plan + feature access + operations catalog (UI bootstrap) |
| `POST /api/cron/credits` | Reconciliation (expiry, stale reservations, monthly grants) |

Internal services: `lib/credits/{gate,ledger,catalog,entitlements,usage,reconcile,format,errors}.js`.

## What stays free

Jobs browsing/searching, matching, job alerts, resume upload/storage/viewing/deleting, and interview-experience reporting are **not** charged. Only operations in `ai_operations` with `credit_cost > 0` consume credits.

## Payment-provider abstraction

`lib/billing/provider.js` defines the internal interface (`createCustomer`, `createSubscription`, `cancelSubscription`, `verifyWebhook`, `handlePayment`). The default is a no-op provider. Kazana only ever observes business events — never provider payloads — so Stripe/Razorpay/anything is replaceable.

### Enabling real payments (steps, when ready)

1. Implement a provider adapter + webhook endpoint that verifies signatures.
2. Translate provider events → internal events ("subscription became active").
3. On activation: upsert `subscriptions` (active, period dates) → `process_monthly_grants()` (idempotent) or call `grant_monthly_credits(subscription_id, period_start)`.
4. Set real `plans.price/currency/billing_interval` and `monthly_credit_grant`.
5. Add credit packs → `purchase` transactions with `external_transaction_id`.
6. Populate `ai_usage.estimated_cost` from a model-pricing config.

## Testing

- Unit (`npm run test:unit`): catalog resolution, gate orchestration (mock ledger), entitlements derivation.
- Integration (`npm run test:integration`, requires a dedicated test Supabase project — see `.env.example` `TEST_*` vars): welcome grant, exact deduction, insufficient rejection, no-negative, **concurrent double-spend**, failed-AI refund, idempotent replay, monthly-grant-once, webhook-retry, expired credits, RLS isolation, free analysis, and gate consumption.

