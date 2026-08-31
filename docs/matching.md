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
│ Threshold +     │  score >= user_min_threshold
│ dedupe          │  skip if already notified for job
└────────┬────────┘
         ▼
┌─────────────────┐
│ Persist matches │
│ enqueue notify  │
└─────────────────┘
```

---

## Scoring model (v2 — modular, explainable)

Weights live in `lib/matching/weights.js` (tune without code changes):

| Signal | Weight |
|--------|--------|
| Skills | 30% |
| Career Areas | 20% |
| Experience | 15% |
| Semantic similarity (token cosine; swap for embeddings later) | 15% |
| Location | 10% |
| Company preference | 5% |
| Work arrangement | 5% |

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
| `notified_at` | null until push sent |

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
| No notification cap | Push fatigue, uninstalls |
| Ignoring timezone | 3am notifications |

---

## Related documents

- [notifications.md](./notifications.md)
- [product.md](./product.md)
