# Matching

## Purpose

Defines how Kazana matches normalized jobs to users based on resumes, preferences, and profile data to drive relevant Job Discovery notifications.

**Status: Implemented** — modular explainable scoring in `lib/matching/`, worker `npm run match`, personalized `GET /api/matches` + Matches UI.

---

## Matching objectives

| Objective | Metric (target) |
|-----------|-----------------|
| Relevance | User opens notification → views job |
| Precision over recall | Better few great matches than many weak ones |
| Freshness | New jobs matched within SLA (e.g. 1 hour of ingestion) |
| Explainability | Store match reasons for debugging and UI |

---

## Inputs and outputs

```
INPUTS                          OUTPUTS
──────                          ───────
• jobs (normalized)             • matches (user_id, job_id, score, reasons)
• resumes (metadata)            • notification_queue entries
• user_profiles / preferences
• device_tokens (for push)
```

---

## Matching pipeline

```
New/updated job
      │
      ▼
┌─────────────────┐
│ Candidate       │  Filter users by coarse criteria
│ generation      │  (location, job_family, active tokens)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Score           │  Weighted feature scoring
└────────┬────────┘
         ▼
┌─────────────────┐
│ Threshold +     │  score >= per-channel threshold
│ dedupe          │  unique (user_id, job_id, channel)
└────────┬────────┘
         ▼
┌─────────────────┐
│ Persist matches │  upsert — existing rows are not re-notified
│ enqueue notify  │  new matches only, one row per channel
└─────────────────┘
```

---

## Candidate window and freshness

Two time axes are intentionally kept separate:

| Axis | Used for | Rule |
|------|----------|------|
| `jobs.discovered_at` | Which jobs the worker scores | Jobs discovered in the last **48h** (hourly run), capped at **2,000** per run |
| `jobs.posted_at` | Whether a match may notify | Posted within **7 days**. If unknown, `discovered_at` within **48h** |

- **Never select candidates by `posted_at`.** Many ATS feeds omit it or report an old employer date, so newly ingested jobs would never be scored.
- **Existing match rows are always re-scored**, even outside the window, so matches the live engine no longer accepts are deleted.
- The global cap is a cost bound, not a freshness rule. One-off backfills score the full active backlog:
  `npm run match -- --all-active --limit-jobs 21000 --no-notify`
- `job_family` is title-first (see `scripts/ingestion/classification/catalog.js`). After rule changes run
  `npm run db:backfill-families` (dry run) then `-- --allow-null --apply`.

### Worker CLI (`npm run match -- …`)

| Flag | Effect |
|------|--------|
| `--job <id>` | Score one job |
| `--user <id>` | Score one user (wider 90-day window, 800-job family-biased set) |
| `--since-hours <n>` | Override the default `discovered_at` lookback |
| `--limit-jobs <n>` | Override the candidate cap (paginates past PostgREST's 1,000-row limit) |
| `--all-active` | No practical discovery window (use with `--limit-jobs` for backfills) |
| `--no-notify` | Score and persist without enqueueing notifications (always use for backfills) |

---

## Scoring model (v2 — modular, explainable)

Weights live in `lib/matching/weights.js` (tune without code changes):

| Signal | Weight |
|--------|--------|
| Experience (dominant; gated) | 36% |
| Skills | 24% |
| Career Areas | 12% |
| Location (city 100% / country 80% / continent 25%) | 12% |
| Semantic similarity (token cosine; swap for embeddings later) | 8% |
| Job family proximity (58-family cluster taxonomy) | 8% |

Each recommendation exposes: score, tier, confidence, strengths, missing skills, breakdown, and recommendation reasons.

Ranking also boosts freshness and preferred companies (`RANKING_BOOSTS`).

**WHY modular signals:** Independently testable, explainable in UI, easy to add salary/visa/hiring-velocity later.

**Rejected for v1:** Deep learning ranker — needs labeled data and MLOps; revisit at scale.

---

## `matches` table (target)

| Column | Purpose |
|--------|---------|
| `user_id` | |
| `job_id` | |
| `score` | 0.0–1.0 |
| `reasons` | jsonb array e.g. `["job_family", "company"]` |
| `created_at` | |
| `notified_at` | null until a notification is sent (any channel) |

**Unique:** `(user_id, job_id)`

---

## Communication with other subsystems

| Subsystem | Role |
|-----------|------|
| [ingestion.md](./ingestion.md) | Triggers matching on new jobs |
| [notifications.md](./notifications.md) | Consumes high-score matches |
| [database.md](./database.md) | Stores matches |
| [api.md](./api.md) | `GET /api/matches` for in-app feed |
| [frontend.md](./frontend.md) | Mobile primary surface for alerts |

---

## Design principles

1. **Batch processing** — match in workers, not per HTTP request
2. **User controls** — mute categories, frequency caps (max N pushes/day)
3. **Cold start** — use resume metadata if preferences empty
4. **Audit trail** — log why user did/didn't match for support

---

## Assumptions

- Users have ≥1 resume or explicit preferences for quality matches
- Matching runs in same region as DB to minimize latency

---

## Future expansion

- Learned re-ranking from click-through data
- Resume PDF text extraction (embeddings) for skill matching
- "Similar to resumes you viewed" collaborative signals
- A/B test scoring weights

---

## Known limitations

- Rule-based model misses nuanced fit (culture, niche skills)
- Multi-resume users need aggregation strategy (best resume per job vs any match)

---

## Common mistakes

| Mistake | Consequence |
|---------|-------------|
| Matching on every page load | O(users × jobs) disaster |
| No notification cap | Push fatigue, uninstalls — mitigated by per-channel daily limits in [notifications.md](./notifications.md) |
| Ignoring timezone | 3am notifications — quiet hours exist but are currently evaluated in **UTC** |

---

## Related documents

- [notifications.md](./notifications.md)
- [product.md](./product.md)
