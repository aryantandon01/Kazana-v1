# Notifications

## Purpose

Defines push notification architecture for Job Discovery: device registration, preferences, delivery, and observability.

**Status: Implemented** — Expo push via `expo-server-sdk`, `npm run notify`, `POST /api/devices`, Vercel cron `/api/cron/notify`.

---

## Notification types

| Type | Channel | Trigger |
|------|---------|---------|
| Job match alert | Push (primary) | High-score match from [matching.md](./matching.md) |
| Digest (future) | Email / push | Daily summary |
| Product (future) | Push / email | Onboarding, re-engagement |

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
       │ FCM          │            │ OneSignal    │
       │ (primary)    │     OR     │ (alternative)│
       └──────────────┘            └──────────────┘
```

---

## Provider choice

| Provider | Pros | Cons |
|----------|------|------|
| **FCM** (Firebase Cloud Messaging) | Free, native Android/iOS via Expo | Google dependency, setup overhead |
| **OneSignal** | Dashboard, segmentation, easier ops | Cost at scale, vendor lock-in |

**Recommendation:** Start with **FCM via Expo Notifications** for cost and Expo integration. Evaluate OneSignal if marketing segmentation becomes critical.

**Rejected:** Custom APNS/FCM direct without abstraction — harder to test and swap.

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

## User preferences (target)

| Setting | Default |
|---------|---------|
| Push enabled | true |
| Max pushes per day | 5 |
| Quiet hours | 22:00–08:00 user local |
| Job families | All from primary resume |

Stored in `notification_preferences` linked to `user_id`.

---

## Communication with other subsystems

| Subsystem | Interaction |
|-----------|-------------|
| [matching.md](./matching.md) | Enqueues notifications |
| [backend.md](./backend.md) | Workers send batches |
| [api.md](./api.md) | Token registration, preference CRUD |
| [frontend.md](./frontend.md) | Expo permission prompts |
| [security.md](./security.md) | No PII in push body beyond job title |

---

## Design principles

1. **Queue before send** — retry failures, rate limit provider API
2. **Collapse duplicate job alerts** per user per day
3. **Respect opt-out** — legal and trust requirement
4. **Idempotent sends** — `notification_queue.id` prevents double push

---

## Assumptions

- Mobile app is primary notification surface
- Users grant notification permission (optional; degraded experience if denied)

---

## Future expansion

- Email via Resend/SendGrid for digests
- In-app notification inbox (synced from `notifications` table)
- Rich push with images (company logo)

---

## Known limitations

- Web push lower priority in v1
- Timezone detection relies on client or profile country

---

## Common mistakes

| Mistake | Consequence |
|---------|-------------|
| Send push without quiet hours | Poor UX, uninstalls |
| Include full job description in payload | Size limits, privacy |
| No invalid token cleanup | Provider errors, wasted quota |

---

## Related documents

- [matching.md](./matching.md)
- [api.md](./api.md)
- [roadmap.md](./roadmap.md)
