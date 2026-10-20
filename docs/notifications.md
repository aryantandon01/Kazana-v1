# Notifications

## Purpose

Defines the multi-channel notification architecture for Job Discovery: channel preferences, recipient registration, eligibility, delivery, retries, and observability.

**Status: Implemented** — push (Expo `expo-server-sdk`) and **WhatsApp** (Meta WhatsApp Cloud API) behind one provider abstraction. Delivered by `npm run notify`, `POST /api/devices`, Vercel cron `/api/cron/notify`, and the matching worker. WhatsApp stays **dormant** until its env vars are provisioned.

---

## Notification types

| Type | Channel | Trigger |
|------|---------|---------|
| Job match alert | Push + WhatsApp | New high-score match from [matching.md](./matching.md) |
| Digest (future) | Email / push | Daily summary |
| Product (future) | Push / email / WhatsApp | Onboarding, re-engagement |

---

## Architecture

```
┌──────────────┐
│ Mobile app   │  register device token on login
│ (Expo)       │
└──────┬───────┘
       │ POST /api/devices
       ▼
┌──────────────┐
│ API          │  store device_tokens
└──────┬───────┘
       │
       ▼
┌──────────────┐     ┌──────────────┐
│ Matching     │────►│ notification │
│ worker       │     │ _queue       │
└──────────────┘     └──────┬───────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Notification │
                     │ worker       │
                     └──────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
       ┌──────────────┐            ┌──────────────┐
       │ push         │            │ whatsapp     │
       │ (Expo / FCM) │            │ (Meta Cloud) │
       └──────────────┘            └──────────────┘
         device token              opt-in + valid E.164
                                   (deferred if unconfigured)
```

**Fan-out:** the notification worker resolves **one provider per channel** through `providers/index.js`, so it never branches on vendor. A channel with no available provider (WhatsApp before credentials exist) leaves its rows `pending` instead of failing them, so provisioning later drains the backlog.

---

## Provider choice

| Provider | Pros | Cons |
|----------|------|------|
| **FCM** (Firebase Cloud Messaging) | Free, native Android/iOS via Expo | Google dependency, setup overhead |
| **OneSignal** | Dashboard, segmentation, easier ops | Cost at scale, vendor lock-in |
| **WhatsApp Cloud API** (Meta Graph API) | Highest open rate, no app install, meets candidates where they already are | Needs a Meta Business account + pre-approved template; per-message cost; phone number is PII |

**Recommendation:** **FCM via Expo Notifications** for push (cost + Expo integration) and **WhatsApp Cloud API** for the opt-in re-engagement channel. Evaluate OneSignal if marketing segmentation becomes critical.

**Rejected:** Custom APNS/FCM direct without abstraction — harder to test and swap.

---

## Channel abstraction

Every channel implements one contract (`lib/notifications/providers/provider.js`):

```js
send({ to, notification }) -> Promise<{ messageId }>   // throws on failure
```

| Channel | Provider module | `to` | Configured by |
|---------|-----------------|------|---------------|
| `push` | `providers/push.js` (Expo) | Expo push tokens | always available |
| `whatsapp` | `providers/whatsapp.js` (Meta Graph API) | E.164 number | env vars (dormant when unset) |

Adding a channel means adding **one registry entry** in `providers/index.js`. The worker, enqueuer and APIs never branch on a vendor.

---

## WhatsApp channel

Opt-in and **off by default**.

| Preference | Default | Notes |
|------------|---------|-------|
| `whatsapp_enabled` | `false` | user must explicitly enable |
| `whatsapp_phone` | `null` | E.164; normalised server-side from free text |
| `whatsapp_min_match_score` | `0.70` | stricter than push (`0.50`) |
| `whatsapp_daily_limit` | `3` | per rolling 24h |

Business-initiated WhatsApp messages must use an **approved template**. The job-match template takes three body variables:

```
{{1}} job title  ·  {{2}} company  ·  {{3}} match score %
```

| Env var | Purpose |
|---------|---------|
| `WHATSAPP_ACCESS_TOKEN` | Graph API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | Sender phone-number id |
| `WHATSAPP_API_BASE_URL` | Defaults to `https://graph.facebook.com/v21.0` |
| `WHATSAPP_JOB_MATCH_TEMPLATE` | Template name (default `job_match_alert`) |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Template locale (default `en`) |
| `WHATSAPP_ENABLED_BY_DEFAULT` | Platform default for new users (`0`) |
| `WHATSAPP_MIN_MATCH_SCORE` / `WHATSAPP_DAILY_LIMIT` | Platform thresholds |
| `ENABLE_NOTIFICATION_TEST` | Dev-only probe endpoint (keep `false` in production) |

When the token or phone-number id is missing, WhatsApp rows are **deferred** (`last_error = whatsapp_not_configured`) rather than failed — provisioning the channel later drains the backlog.

### Manual bridge (before the Cloud API is provisioned)

The sending number does not have to be wired to Meta on day one. `npm run notify:manual` turns pending WhatsApp rows into `wa.me` deep links; an operator sends them from the **official** WhatsApp app/desktop and then marks them sent. Delivery is real and ToS-safe (a human taps send), and the queue is reused, so opt-in, match threshold and daily limits still apply.

| Command | Effect |
|---------|--------|
| `npm run notify:manual` | Print pending WhatsApp links (max 50) |
| `npm run notify:manual -- --limit 100` | Wider listing |
| `npm run notify:manual -- --include-stale` | Also list rows older than 7 days (skipped by default) |
| `npm run notify:manual -- --confirm-sent --id <uuid> [--id …]` | Mark those rows sent (`provider_message_id = manual:<timestamp>`) |

Rows are only marked `sent` from `pending`, so a real provider send (or a concurrent worker claim) can never be overwritten. Marking also sets `matches.notified_at`, exactly like the worker. The listing ignores `scheduled_for` (the worker's retry backoff), because the operator is explicitly choosing to send now.

Do **not** automate the consumer app with unofficial libraries (Baileys, whatsapp-web.js): that violates WhatsApp's Terms and can permanently ban the sender number. The Cloud API — or this manual bridge — are the only supported paths.

---

## Device token lifecycle

| Event | Action |
|-------|--------|
| Login | Upsert `device_tokens` (user_id, token, platform) |
| Logout | Mark token inactive (do not delete immediately) |
| Token refresh | Update row on app foreground |
| Invalid token from provider | Delete or deactivate; log metric |

---

## Payload contract (example)

```json
{
  "title": "New role at Stripe",
  "body": "L4 Software Engineer — matches your backend resume",
  "data": {
    "type": "job_match",
    "job_id": "uuid",
    "match_id": "uuid"
  }
}
```

Deep link: `kazana://jobs/{job_id}` (mobile) / `https://kazana.app/jobs/{job_id}` (web)

---

## User preferences

| Setting | Default |
|---------|---------|
| Push enabled | true |
| Max pushes per day | 5 |
| WhatsApp enabled | false (opt-in) |
| WhatsApp number | empty |
| WhatsApp min match score | 0.70 |
| WhatsApp max messages per day | 3 |
| Quiet hours | 22:00–08:00 UTC |
| Job families | All from primary resume |

Stored in `notification_preferences` linked to `user_id`. **Platform defaults live in `lib/notifications/config.js`** (env-overridable); user rows only store overrides.

Managed through `GET/PATCH /api/preferences` (Settings UI). `whatsapp_phone` is normalised to E.164 before validation and `null` clears the enrolment.

---

## Eligibility, idempotency and rate limits

Decided in `lib/notifications/eligibility.js` and enforced *before* a row is queued:

1. channel opt-in
2. WhatsApp number present and valid (E.164)
3. duplicate — one notification per `(user_id, job_id, channel)`, guaranteed by a DB unique index
4. match score ≥ that channel's per-user threshold
5. daily limit (per channel, rolling 24h)

The unique index is the concurrency-safe final guard: if two workers race, only one row per `(user, job, channel)` can exist. `notification_queue` therefore doubles as the notification **event log** (read by `GET /api/notifications`).

Delivery (`lib/notifications/dispatch.js`) re-checks opt-in and quiet hours at send time, so a preference change is honoured immediately. Rows move `pending → processing → sent | failed | skipped`; a row stuck in `processing` for more than `NOTIFICATION_PROCESSING_TIMEOUT_SECONDS` is reclaimed. Transient provider errors are retried with exponential backoff (`NOTIFICATION_RETRY_BASE_SECONDS` → `NOTIFICATION_RETRY_MAX_SECONDS`, capped at `NOTIFICATION_MAX_ATTEMPTS`); 4xx provider errors fail permanently.

---

## Communication with other subsystems

| Subsystem | Interaction |
|-----------|-------------|
| [matching.md](./matching.md) | Enqueues notifications |
| [backend.md](./backend.md) | Workers send batches |
| [api.md](./api.md) | `POST /api/devices`, `GET/PATCH /api/preferences`, `GET /api/notifications`, dev-only `POST /api/notifications/test` |
| [frontend.md](./frontend.md) | Expo permission prompts |
| [security.md](./security.md) | No PII in push body beyond job title |

---

## Design principles

1. **Queue before send** — retry failures with exponential backoff, rate limit the provider API
2. **One notification per (user, job, channel)** — DB unique index + `provider_message_id` for audit
3. **Respect opt-out** — legal and trust requirement; re-checked at send time
4. **Claim before send** — `pending → processing → sent | failed | skipped`, so parallel workers never double-send
5. **Fail fast, defer wisely** — 4xx provider errors fail permanently; a missing platform config defers instead of burning retries
6. **No PII in logs** — recipients are logged masked (`e164:+14***23`)

---

## Assumptions

- Mobile app is primary notification surface
- Users grant notification permission (optional; degraded experience if denied)

---

## Future expansion

- Email via Resend/SendGrid for digests
- WhatsApp quick-reply buttons (“Save job” / “Not interested”) to capture feedback signal
- In-app notification inbox (read from `notification_queue` via `GET /api/notifications`)
- Rich push with images (company logo)

---

## Testing & migrations

Unit tests (`npm run test:unit`):

| File | Covers |
|------|--------|
| `tests/unit/notifications-eligibility.test.js` | opt-in, thresholds, duplicates, daily limits, E.164 strictness |
| `tests/unit/notifications-config.test.js` | platform defaults, env overrides, exponential backoff |
| `tests/unit/notifications-enqueue.test.js` | per-channel enqueue, idempotency options, daily limit, threshold |
| `tests/unit/whatsapp-provider.test.js` | template payload, error surfacing, unconfigured behaviour |
| `tests/unit/notifications-dispatch.test.js` | claim → send → state transitions, backoff, permanent failures, channel routing |

Apply `db/migrations/20261110090000_whatsapp_notifications.sql` (`npm run db:migrate`, or paste it into the Supabase SQL Editor) **before** deploying the code.

**Not covered by automated tests:** the DB-level guarantees themselves (`UNIQUE (user_id, job_id, channel)` dedup under concurrency, the extended `status` CHECK, and the `updated_at` reclaim of stuck rows). This repo has no harness for a live Postgres, so verify these manually after migrating.

---

## Known limitations

- Web push lower priority in v1
- Timezone detection relies on client or profile country; quiet hours are evaluated in UTC
- WhatsApp delivery needs external provisioning (Meta Business account, approved template, phone-number id, access token). Until then the channel is implemented and tested but **dormant** — rows are deferred, never failed
- Daily limits are enforced at enqueue time; a large backlog could in theory exceed them if many runs race (the unique index still prevents duplicate *jobs*)

---

## Common mistakes

| Mistake | Consequence |
|---------|-------------|
| Send push without quiet hours | Poor UX, uninstalls |
| Include full job description in payload | Size limits, privacy |
| No invalid token cleanup | Provider errors, wasted quota |
| Re-notify on every re-score | Hourly duplicate spam (matches are re-scored by upsert) |
| Store/log raw phone numbers | Unnecessary PII exposure |
| Send WhatsApp messages outside an approved template | Meta rejects the message (4xx)

---

## Related documents

- [matching.md](./matching.md)
- [api.md](./api.md)
- [roadmap.md](./roadmap.md)
