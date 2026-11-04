# Deployment

## Purpose

Defines environments, hosting, CI/CD, secrets, and operational runbooks for Kazana.

---

## Environments

| Environment | Purpose | Supabase | Web hosting |
|-------------|---------|----------|-------------|
| **Local** | Development | Dev project or local | `npm run dev` (Next) |
| **Staging** | Pre-prod QA | Staging project | Vercel preview |
| **Production** | Live users | Prod project | Vercel production |

**Rule:** Production credentials MUST NOT exist on developer laptops except via scoped CLI tokens.

---

## Deployment topology (target)

```
┌─────────────────────────────────────────────────────────┐
│ GitHub                                                  │
│   main branch ──► CI ──► Vercel (Next.js web + API)     │
│   tags ─────────► EAS Build (mobile)                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────────────────────────────┐
│ Supabase Prod   │     │ Vercel project (same deployment)     │
│ • Postgres      │     │ • Next.js web + API (functions)      │
│ • Auth          │     │ • daemon pulse: match→notify / 5 min │
│ • Storage       │     │ • daemon ingest: continuous sweep    │
│ • Edge Fn       │     │ • cron /api/cron/credits (hourly)    │
└─────────────────┘     └──────────────────────────────────────┘
```

---

## Current deployment

| Component | How |
|-----------|-----|
| Web + API | Next.js on Vercel (`npm run build` → `next start`) |
| Worker — pulse | Vercel Daemon `pulse` (`vercel.json` → `daemons.pulse`) — match every user, then drain the queue every 5 minutes |
| Worker — ingest | Vercel Daemon `ingest` (`vercel.json` → `daemons.ingest`) — continuous source sweeps |
| DB | Supabase hosted. `npm run db:migrate` with `DATABASE_URL` (direct connection) applies pending files and records them in `public.schema_migrations` |
| Mobile | EAS Build (Expo) |

`vercel.json` schedules only `/api/cron/credits` (hourly, `:15`) — the one job the
daemons do not own. The old `/api/cron/match` and `/api/cron/notify` crons were
removed because the `pulse` daemon now runs that loop every five minutes; keeping
both schedulers would only contend for the same `worker_locks` lease. Every loop
stays idempotent (matching upserts + atomic queue claims), so a retried or
overlapping tick can never send a row twice.

### Workers (Vercel Daemons)

Both loops run as **Vercel Daemons** in the same project as the web tier. The
`daemons` key in `vercel.json` builds each loop from the repo-root `Dockerfile`
and keeps one instance running per region (the config pins `iad1`):

| Daemon | Start command | Role |
|--------|---------------|------|
| `ingest` | `node scripts/worker/ingest.js` | continuous, incremental job-source sweep |
| `pulse` | `node scripts/worker/pulse.js` | match -> notify every 5 minutes |

Vercel builds `Dockerfile` once per daemon, runs the image on Fluid compute, and
restarts any instance that exits or crashes. Daemons run **only in production**
and only for a git/`vercel deploy` production deployment — preview deployments
never start them. Each instance's `stdout`/`stderr` appears under the daemon in
the Vercel dashboard.

> **Plan requirement.** Daemons are a **Public Beta** and work on all plans, but
> the Hobby quota — **5 Active CPU-hours + 420 GB-hours Provisioned Memory per
> month** — cannot sustain two 24/7 instances (one 2 GiB instance alone exhausts
> 420 GB-hours in ~9 days, and time spent idle still counts toward Provisioned
> Memory). Use **Pro** for always-on workers; Hobby stops the daemons when the
> quota is hit and restarts them on the first of the following month (UTC).

The daemons read the same env as the container image — set
`SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`
on the Vercel project, plus the optional `WORKER_*`, `DEEPSEEK_*` and
`WHATSAPP_*` vars. On deploy/redeploy Vercel sends `SIGTERM` and the loop
finishes its current unit of work; `terminationGracePeriodSeconds` in
`vercel.json` bounds how long Vercel waits before force-stopping it.

Both loops are guarded by the leased lock in `public.worker_locks` (migration
`20261111000000_worker_locks.sql`): a second replica skips instead of
overlapping, a heartbeat extends the lease while a run is alive, and a crashed
run expires automatically (ingest lease 15 min, pulse lease 5 min). Until the
migration is applied the lock fails open (logs a warning and runs unguarded).

The ingest is incremental (`jobs` are fetched only since the last
`last_fetched_at` per source), so a warm pass takes minutes; only a cold
backfill (`--full`, or a source that has never been fetched) is slow.

**Scaling / stopping.** Change `instances` in `vercel.json` (one entry per
region) or override counts from the dashboard without redeploying. Scaling a
daemon to `0` turns it off; a new production deployment restarts the configured
count.

**Local fallback (optional).** `docker-compose.yml` still runs both loops on a
container host (`docker compose up`), and the launchd plists in `deploy/launchd/`
remain for running them on a Mac you log into. Both are opt-in and not required
for production. On macOS, keep any checkout outside `~/Documents`, `~/Desktop`
or `~/Downloads`: a launchd agent cannot read those (TCC blocks the ESM
`package.json` lookup and the worker hangs with empty logs).

**Retire the Mac agents.** Once the Vercel daemons are verified (see [Verify the
pipeline end to end](#verify-the-pipeline-end-to-end)), stop and remove the local
launchd agents so nothing runs twice:

```bash
launchctl bootout gui/$(id -u) com.kazana.ingest 2>/dev/null || true
launchctl bootout gui/$(id -u) com.kazana.pulse 2>/dev/null || true
rm -f ~/Library/LaunchAgents/com.kazana.ingest.plist \
      ~/Library/LaunchAgents/com.kazana.pulse.plist
launchctl list | grep kazana || echo 'kazana agents removed'
```

While both paths are briefly running, the `worker_locks` leases make the overlap
harmless — only one path should remain the source of truth.

Before the first run: apply the migration (`DATABASE_URL=... npm run db:migrate`
or paste it into the Supabase SQL Editor).

**Env vars (client):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key only)

**Env vars (server only):** `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and the notification credentials below. Full reference: [.env.example](../.env.example).

---

## Why the workers run as daemons (not Vercel Functions)

The web tier is a request/response app; both loops are long-running jobs.

- Ingestion sweeps **every active `job_sources` row** — currently **114 sources**.
  Measured from `ingestion_runs` (129 runs over the last 36 h): **median ~96 s per
  source, p90 ~12 min, max ~1.8 h** (large boards such as `gh-spacex`, and
  Workday sources that paginate slowly). A single source can outlast a
  serverless function's per-invocation ceiling, so the loop owns a long-lived
  process instead of being chunked into function calls.
- Matching is CPU-bound and grows with `users × jobs`; keeping it off the web
  tier protects request latency.
- The ingest CLI also writes `logs/ingest-metrics/*.json`, but daemon disks are
  ephemeral: treat those files as best-effort and read `ingestion_runs` in
  Postgres as the durable record.

The **5-minute requirement belongs to the pulse**, not to a full ingest pass:

```
ingest sweep (continuous, bounded concurrency)
      │  jobs.discovered_at
      ▼
pulse every 5 min → runMatching(all users) → notification_queue
      │
      ▼
runNotifications → Expo push / WhatsApp Cloud API → sent_at
```

A newly ingested job is scored, enqueued and dispatched within one pulse
(≤ 5 min). **Source freshness is a different budget** and cannot be 5 minutes
for all 114 sources from one process:
`pass_minutes ≈ Σ per-source seconds ÷ concurrency`. Steady-state (warm) passes
are incremental and take minutes because `last_fetched_at` narrows each source
to its new jobs; the multi-hour figure in older notes was a cold, months-long
backfill, not a warm pass. Each source is refreshed roughly once per pass;
alert latency is still ≤ 5 min *after* that refresh.

To push freshness closer to the pulse cadence (not implemented yet):

- Raise `WORKER_INGEST_CONCURRENCY` (16 is the hard cap in `runIngestion`).
- Run more `ingest` instances, one region per shard, each sweeping a disjoint
  slice of `job_sources` (the leased `ingest` lock allows one active sweep today,
  so sharding needs per-shard lock names).
- Timebox pathological sources (`wd-*`, multi-thousand-job `gh-*` boards): a
  single long run currently holds one slot for the whole pass.

---

## Deploy the web tier (Vercel)

1. Apply migrations against the production Supabase project:
   `DATABASE_URL=... npm run db:migrate && npm run db:status`.
2. Import the repository into Vercel. Framework preset **Next.js**, root
   directory `./`, build command `npm run build`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `SENTRY_DSN` (optional).
4. Deploy, then verify `/api/jobs` returns 200 and Google sign-in completes.
5. Cron plan limits: the only cron left is `/api/cron/credits`, which reconciles
   stale reservations and monthly grants. Hobby cron jobs may run **once per day**
   and sub-daily expressions **fail the deployment**, so on Hobby change its
   schedule to daily (`15 3 * * *`) or remove it. On Pro the hourly schedule
   works; Vercel invokes crons with `GET` and sends `CRON_SECRET` as a bearer
   token (the routes export both `POST` and `GET`).

---

## Deploy the worker tier (Vercel Daemons)

The `daemons` block in `vercel.json` deploys both loops with the web tier in the
same production deployment — there is no separate worker host. Each daemon builds
the repo-root `Dockerfile` and runs one instance:

```json
"daemons": {
  "ingest": {
    "root": ".",
    "entrypoint": "Dockerfile",
    "command": ["node", "scripts/worker/ingest.js"],
    "instances": { "iad1": 1 },
    "terminationGracePeriodSeconds": 300
  },
  "pulse": {
    "root": ".",
    "entrypoint": "Dockerfile",
    "command": ["node", "scripts/worker/pulse.js"],
    "instances": { "iad1": 1 },
    "terminationGracePeriodSeconds": 120
  }
}
```

Deploy with a normal production deployment (`git push` to `main` with the repo
imported, or `vercel deploy --prod`). Daemons start only for **production**
deployments. To change a command, image or env var, ship a new deployment; to
change the instance count you can also use the dashboard.

Worker env (server only) — set on the Vercel project, sharing values with the web
tier where they overlap:

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) | yes | same project as the web tier |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | never expose to the browser |
| `DEEPSEEK_API_KEY` | for LLM extraction | falls back to rule-based extraction when unset |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | see below |
| `WHATSAPP_JOB_MATCH_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` | optional | default `job_match_alert` / `en` |
| `WORKER_PULSE_MINUTES` | optional | default `5` |
| `WORKER_MATCH_LOOKBACK_HOURS` | optional | default `2` — covers a missed pulse; keep the window × hourly job volume under the 2,000-candidate cap |
| `WORKER_NOTIFY_LIMIT` | optional | default `200` rows per pulse |
| `WORKER_INGEST_CONCURRENCY` | optional | default `8`, capped at `16`; raise for fresher per-source data |
| `WORKER_INGEST_COOLDOWN_MINUTES` | optional | default `5` pause between passes |

Both loops run **sequentially** — a slow pass delays the next one but never
overlaps it. Because of that each daemon is pinned to **one instance**; two ingest
instances would poll the same boards twice. Each loop catches its own errors and
keeps running, so a Supabase or provider outage shows up as failed pulses in the
daemon logs, not as a dead process.

`--once` still works (`node scripts/worker/ingest.js --once` /
`node scripts/worker/pulse.js --once`) for a one-shot run from a shell or an
external scheduler.

**Alternative container host.** The same image also runs on Railway, Fly.io,
Render, ECS or a VPS: `docker build -t kazana-worker .`, then run
`node scripts/worker/pulse.js` and `node scripts/worker/ingest.js` as two
services, one replica each (see `docker-compose.yml`). Use this only when Vercel
Daemons are not an option.

---

## Activate WhatsApp (Meta Cloud API)

Automated WhatsApp delivery needs a Meta-side setup that cannot be done from
this repo:

1. **Business portfolio + verification** in Meta Business Manager. Cloud API
   requires a business account; verification can take days.
2. **App + WhatsApp product**: create a Business-type app, add WhatsApp, and
   attach a WhatsApp Business Account (WABA).
3. **Phone number**: add a number that is not active in the consumer WhatsApp
   app (delete/migrate it first). Copy its **Phone number ID**.
4. **Template** named `job_match_alert` (or set `WHATSAPP_JOB_MATCH_TEMPLATE`),
   language `en`, category **Utility** (Meta may reclassify it as **Marketing** —
   pricing and opt-in rules follow the approved category), with three body
   variables in this order:
   `New job match: {{1}} at {{2}} — {{3}}% match`
   (`{{1}}` job title, `{{2}}` company, `{{3}}` rounded match score).
   Wait for status **Approved**.
5. **Permanent token**: create a System User with `whatsapp_business_messaging`
   and `whatsapp_business_management`, then generate a token that does not
   expire. Temporary 24 h tokens will break the worker overnight.
6. Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` on the **pulse**
   service and restart it.

Delivery then requires a user opt-in: `notification_preferences.whatsapp_enabled = true`
and a valid E.164 `whatsapp_phone`. Defaults: minimum match score `0.7`
(`WHATSAPP_MIN_MATCH_SCORE`), 3 messages/day (`WHATSAPP_DAILY_LIMIT`), and quiet
hours are respected.

Until the credentials are set, WhatsApp queue rows stay `pending` and are
deferred with `last_error = whatsapp_not_configured`; they drain automatically
once the env vars are present. `npm run notify:manual` lists those same rows as
`wa.me` links for hand-sending from the WhatsApp Business app in the meantime.

---

## Verify the pipeline end to end

1. **Daemons alive**: the Vercel daemon logs show `[worker] pulse starting`
   and a `[worker] match` / `[worker] notify` pair every 5 minutes.
2. **Ingestion**: `ingestion_runs` has recent `success` rows; the ingest log
   reports `jobs_upserted > 0` when boards change.
3. **Matching**: `matches` gains rows for the new jobs. `runMatching` returns
   `{ matched, enqueued, jobs, users }` in the pulse log.
4. **Queue**: a `notification_queue` row moves `pending → processing → sent`
   with `provider_message_id` starting `wamid.` and `sent_at` set;
   `matches.notified_at` is stamped for that match.
5. **Template failures** land in `last_error` (4xx errors are permanent and are
   not retried). Common causes: template not approved, wrong language, empty
   parameter (we send fallbacks), number not in E.164, or recipient opted out.

---

## Operating notes

- **One replica per loop.** `claim()` protects against double-sends, but a
  second ingest replica doubles provider traffic.
- **Backlogs** drain at `WORKER_NOTIFY_LIMIT` rows per pulse; the pulse log
  reports `deferred` separately from `failed`.
- **Candidate cap**: `runMatching` scores at most 2,000 jobs per global run,
  newest `discovered_at` first. The 2-hour pulse window stays below that at the
  observed ~530 new jobs/hour; a 24-hour lookback would silently skip jobs.
- **Quiet hours** currently mark a row `skipped` rather than rescheduling it, so
  alerts enqueued inside a user's quiet window are dropped. Fixing this means
  deferring to the window end (follow-up).
- **Inbound replies / STOP** are not handled yet — there is no WhatsApp webhook.
  Until it exists, honour opt-out requests manually by setting
  `whatsapp_enabled = false`.
- **Secrets**: the worker needs `SUPABASE_SERVICE_ROLE_KEY` and the WhatsApp
  token; only the web tier needs the public Supabase keys. Never put either in
  the client bundle.

---

## CI/CD pipeline (target)

| Stage | Checks |
|-------|--------|
| PR | Lint + build (`.github/workflows/ci.yml`). Unit tests are **not** run in CI yet — run `npm run test:unit` locally |
| Merge to `main` | Deploy staging; build and push the worker image |
| Release tag | Deploy production + EAS mobile |
| DB migration | Manual approval or automated on staging first |

---

## Secrets management

| Secret | Where | MUST NOT |
|--------|-------|----------|
| Supabase anon key | Client env (Vercel) | N/A — public by design |
| Supabase service role | Server/workers only | Client bundle |
| Google OAuth client secret | Supabase Auth config | Repo |
| Stripe webhook secret | Edge function env | Client |
| FCM server key (via Expo) | Worker env | Client |
| WhatsApp Cloud API access token + phone-number id | Server env only | Client bundle / repo |
| `WHATSAPP_JOB_MATCH_TEMPLATE` | Server env — MUST match an approved Meta template name | Client |

---

## Notification channels

| Channel | Provider | Activation |
|---------|----------|------------|
| `push` | Expo Push Service (FCM/APNs underneath) | Always on; requires a registered `device_tokens` row |
| `whatsapp` | Meta WhatsApp Cloud API | **Dormant until configured** — set `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` and an approved `job_match_alert` template |

When WhatsApp credentials are absent the channel does **not** fail: its queue rows
stay `pending`, so setting the env vars later drains the backlog with no migration
or backfill. Inspect a user's delivery log — `status`, `failure_reason`,
`provider_message_id` — via `GET /api/notifications`.

Mechanics: [notifications.md](./notifications.md) · decision: [ADR-020](./decisions.md#adr-020-multi-channel-notifications-behind-a-provider-registry).

---

## Supabase Auth URLs (local dev)

For Google OAuth on localhost:

| Setting | Value |
|---------|-------|
| Site URL | `http://localhost:5173` (or Next port) |
| Redirect URLs | `http://localhost:5173/**` |

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for common OAuth issues.

---

## Monitoring (target)

| Signal | Tool |
|--------|------|
| API errors / latency | Vercel Analytics / Sentry |
| DB performance | Supabase dashboard |
| Ingestion success | Custom metrics table + alert |
| Daemon health | Vercel daemon status + alert on `[worker] *_failed` log lines |
| Push delivery | Expo dashboards |
| Notification delivery | `GET /api/notifications` per-user log; Meta WhatsApp Manager for template status |

---

## Rollback strategy

| Layer | Rollback |
|-------|----------|
| Web/API | Vercel instant rollback to previous deployment |
| Workers | Roll back to the previous production deployment (daemons restart from the prior image); both loops are idempotent (upserts + atomic queue claims) |
| DB | Forward-only migrations; write down migration for emergencies |
| Mobile | Previous app version in stores; API backward compatible |

---

## Communication with other subsystems

All subsystems deploy independently but share **schema version** — coordinate DB migrations before API changes that depend on new columns.

---

## Assumptions

- Vercel for Next.js is acceptable vendor lock-in for web tier
- One daemon instance per loop (pulse, ingest), pinned to one region in `vercel.json`
- Single Supabase region initially (e.g. US East)

---

## Future expansion

- Blue/green for workers
- Multi-region Supabase
- CDN in front of storage bucket for PDFs

---

## Known limitations

- No formal staging environment documented in prototype repo
- Manual SQL migrations today

---

## Common mistakes

| Mistake | Consequence |
|---------|-------------|
| Deploy prod without running RLS policies | Empty app / security hole |
| Same Supabase project for dev and prod | Data corruption |
| Commit `.env` | Credential leak |

---

## Related documents

- [security.md](./security.md)
- [database.md](./database.md)
- [contributing.md](./contributing.md)
