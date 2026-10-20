-- WhatsApp (multi-channel) notifications
--
-- Extends the EXISTING matching + notification pipeline (see
-- 20260706120000_discovery_matching_notifications.sql). It does not introduce a
-- parallel system: `notification_queue` doubles as the notification event log,
-- gaining a channel discriminator and provider/idempotency fields.
--
-- Run via: npm run db:migrate  (or paste into the Supabase SQL Editor) AFTER all
-- prior migrations.

-- ---------------------------------------------------------------------------
-- notification_preferences: WhatsApp channel config
-- ---------------------------------------------------------------------------
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS whatsapp_min_match_score numeric(3,2) NOT NULL DEFAULT 0.70
    CHECK (whatsapp_min_match_score >= 0 AND whatsapp_min_match_score <= 1),
  ADD COLUMN IF NOT EXISTS whatsapp_daily_limit integer NOT NULL DEFAULT 3
    CHECK (whatsapp_daily_limit >= 0);

COMMENT ON COLUMN notification_preferences.whatsapp_phone IS
  'E.164 phone number for WhatsApp alerts. NULL = not enrolled.';
COMMENT ON COLUMN notification_preferences.whatsapp_min_match_score IS
  'Per-user WhatsApp match threshold. Platform default (0.70) lives in lib/notifications/config.js.';
COMMENT ON COLUMN notification_preferences.whatsapp_daily_limit IS
  'Per-user WhatsApp sends per 24h. Platform default (3) lives in lib/notifications/config.js.';

-- ---------------------------------------------------------------------------
-- notification_queue: channel, event + provider fields
-- ---------------------------------------------------------------------------
ALTER TABLE notification_queue
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'push',
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'job_match',
  ADD COLUMN IF NOT EXISTS match_score numeric(4,3),
  ADD COLUMN IF NOT EXISTS resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Status now models the worker lifecycle: pending -> processing -> sent/failed/skipped.
ALTER TABLE notification_queue DROP CONSTRAINT IF EXISTS notification_queue_status_check;
ALTER TABLE notification_queue
  ADD CONSTRAINT notification_queue_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));

ALTER TABLE notification_queue DROP CONSTRAINT IF EXISTS notification_queue_channel_check;
ALTER TABLE notification_queue
  ADD CONSTRAINT notification_queue_channel_check
  CHECK (channel IN ('push', 'whatsapp', 'email'));

-- ---------------------------------------------------------------------------
-- Idempotency: one notification per (user, job, channel) — forever.
-- Dedupe any pre-existing rows first so the unique index can be created.
-- ---------------------------------------------------------------------------
DELETE FROM notification_queue a
  USING notification_queue b
  WHERE a.ctid < b.ctid
    AND a.user_id = b.user_id
    AND a.job_id = b.job_id
    AND a.channel = b.channel;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_queue_user_job_channel
  ON notification_queue (user_id, job_id, channel);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user_channel_created
  ON notification_queue (user_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_queue_status_channel_sched
  ON notification_queue (status, channel, scheduled_for);

-- ---------------------------------------------------------------------------
-- updated_at trigger (needed to reclaim rows stuck in 'processing')
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS notification_queue_updated_at ON notification_queue;
CREATE TRIGGER notification_queue_updated_at
  BEFORE UPDATE ON notification_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: users may read their own notification events (workers use service role).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users read own notifications" ON notification_queue;
CREATE POLICY "Users read own notifications"
  ON notification_queue FOR SELECT USING (auth.uid() = user_id);
