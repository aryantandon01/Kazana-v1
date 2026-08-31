-- Phase 3: user profiles, notification preferences, matches, device tokens, notification queue
-- Run via: npm run db:migrate

-- ---------------------------------------------------------------------------
-- schema_migrations (migration runner tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  target_job_families text[] NOT NULL DEFAULT '{}',
  target_companies text[] NOT NULL DEFAULT '{}',
  location text,
  remote_only boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  min_match_score numeric(3,2) NOT NULL DEFAULT 0.60 CHECK (min_match_score >= 0 AND min_match_score <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  max_pushes_per_day integer NOT NULL DEFAULT 5 CHECK (max_pushes_per_day >= 0),
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score numeric(4,3) NOT NULL CHECK (score >= 0 AND score <= 1),
  reasons jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_user_created ON matches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_job_id ON matches (job_id);
CREATE INDEX IF NOT EXISTS idx_matches_unnotified ON matches (notified_at) WHERE notified_at IS NULL;

-- ---------------------------------------------------------------------------
-- device_tokens (Expo push tokens)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active ON device_tokens (user_id) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- notification_queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_pending ON notification_queue (status, scheduled_for)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS device_tokens_updated_at ON device_tokens;
CREATE TRIGGER device_tokens_updated_at
  BEFORE UPDATE ON device_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON user_profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users read own notification prefs" ON notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own notification prefs" ON notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own notification prefs" ON notification_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users read own matches" ON matches FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own device tokens" ON device_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own device tokens" ON device_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own device tokens" ON device_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own device tokens" ON device_tokens FOR DELETE USING (auth.uid() = user_id);

-- notification_queue: no client policies (service role / workers only)
