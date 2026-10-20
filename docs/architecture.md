# Architecture

## Purpose

Technical topology for Kazana as a **learning hiring-intelligence system**. Subsystem docs ([backend.md](./backend.md), [database.md](./database.md), [ingestion.md](./ingestion.md), [matching.md](./matching.md)) implement this shape.

Product strategy: [vision.md](./vision.md) · [product.md](./product.md) · [roadmap.md](./roadmap.md).

---

## Architectural north star

```
Raw world (jobs, resumes, interviews, outcomes)
        ↓
Structured extraction & canonical schemas
        ↓
Assessment engine (practice, rubrics, scores, confidence)
        ↓
Learning / calibration loops
        ↓
Better assessments → candidate value + enterprise products
```

**Invariant:** User-facing matching, filtering, and assessment MUST consume **structured** fields—not re-parse raw job descriptions or free text at request time. Raw text is for display and reprocessing only.

---

## High-level topology

```
                         ┌─────────────────────────────────────┐
                         │           CLIENT TIER               │
                         ├─────────────────┬───────────────────┤
                         │  Next.js Web    │  Expo Mobile      │
                         └────────┬────────┴─────────┬─────────┘
                                  │                  │
                                  ▼                  ▼
                         ┌─────────────────────────────────────┐
                         │         API TIER                    │
                         │  Next.js API Routes                 │
                         │  (auth, validation, rate limits)    │
                         └────────┬────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
 ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
 │ Supabase        │    │ Assessment &    │    │ Background      │
 │ PostgreSQL      │    │ Learning APIs   │    │ Workers / Cron  │
 │ Auth + Storage  │    │ (future)        │    │ ingest, extract,│
 │                 │    │                 │    │ match, notify,  │
 │                 │    │                 │    │ calibrate       │
 └─────────────────┘    └─────────────────┘    └─────────────────┘
                                  │
                                  ▼
                         ┌─────────────────────────────────────┐
                         │  AI providers (model-agnostic)      │
                         │  DeepSeek / others via adapters     │
                         └─────────────────────────────────────┘
```

---

## Bounded contexts

| Context | Responsibility | Learning role |
|---------|----------------|---------------|
| **Identity** | Auth, sessions | Attribution of signals |
| **Candidate profile / Resume Vault** | Resumes, privacy, discover | Structured candidate signal |
| **Job Catalog** | Sources, jobs, extraction, facets/tags | Structured opportunity signal |
| **Matching** | Job–candidate fit | Engagement; later practice targeting |
| **Assessment** (growing) | AI interviews, rubrics, scores | **Core product** |
| **Experience reports** | Confidence-scored interview submissions | Calibration labels |
| **Enterprise screening / workflow** (future) | Screens, scorecards, notes | Monetization + outcome labels |
| **Notifications** | Channel-routed match alerts (push + opt-in WhatsApp) | Retention into the flywheel |

Contexts share **PostgreSQL** and **async workers**—not in-process singletons.

---

## Design principles (engineering)

Aligned with [vision.md](./vision.md):

1. **Structured data first** — extraction pipeline writes canonical fields + confidence metadata (`jobs.extraction`, facets, tags).
2. **Confidence-aware** — important claims carry trust; avoid binary verified theater.
3. **Explainability** — match breakdowns, extraction evidence, assessment rationales.
4. **Calibration** — store outcomes so assessment quality is measurable over time.
5. **Model-agnostic AI** — providers behind adapters; prompts versioned; swapping DeepSeek/GPT/Gemini must not rewrite business logic.
6. **Stateless APIs** — scale on serverless; heavy work in workers.
7. **Idempotent ingestion** — `(source_id, external_id)` upserts.
8. **RLS as last line of defense** — especially resume privacy.

---

## AI architecture (normative)

| Rule | Practice |
|------|----------|
| No novelty AI | Ship AI only with a path to measurable hiring-quality improvement |
| Replaceable models | `extraction/llm/provider.js`-style adapters; env-selected model IDs |
| Versioned prompts | Prompt text + version in code/docs; record model + prompt version on outputs |
| Measurable loops | Log weak fields, LLM escalation rate, assessment↔outcome metrics |
| Cheap before smart | Deterministic extractors first; one-shot LLM escalation when confidence is low |

Current example: job extraction ETL (`scripts/ingestion/extraction/`) with DeepSeek v4 Flash as the first escalation provider.

---

## AI operation abstraction (credits)

Every billable AI capability is expressed as an **AI operation** with a configurable
credit cost, resolved through a single gate (`lib/credits/gate.js` → `runWithCredits`):

```
feature → AI operation (ai_operations.credit_cost) → provider adapter → ai_usage
```

- **Why it exists:** the assessment engine (Phase 2) will be the primary AI-cost
  consumer, and monetization ("AI Credits") must not be re-plumbed per feature.
- **Provider- and feature-agnostic:** reserving, recording usage, and refunding
  happen once, above the model adapter and below the product feature.
- **Entitlements, not feature flags:** plan → `plan_entitlements` → feature access;
  the ledger (`credit_transactions`) is append-only and authoritative.
- **Status: built but deferred.** The layer, schema, and API exist and are tested,
  but the user-facing credits UI and any paid gating are **not currently exposed**
  (see [credits.md](./credits.md) and [ADR-019](./decisions.md)). Resume
  Optimization is the first intended consumer if AI usage must be metered.
- **Invariant:** browser clients never mutate credits; all mutations run in
  `SECURITY DEFINER` functions granted only to `service_role`.

---

## WHY this architecture

| Decision | Why | Rejected |
|----------|-----|----------|
| Supabase PostgreSQL | Auth, storage, RLS; fast learning-system MVP | Firebase-only, ops-heavy raw RDS early |
| Next.js API + workers | Same repo; long jobs off request path | Sync ingestion in HTTP handlers |
| Extraction → structured store | Matching must not re-parse JD text | Regex-at-match-time forever |
| Provider adapters | Moat is data + calibration, not a vendor | Hard-coding one LLM SDK everywhere |

---

## Scalability path

| Scale | Changes |
|-------|---------|
| Early | Single Supabase project; CLI/cron workers |
| Growth | Queue for extraction/assessment; pooler; CDN for PDFs |
| Large | Dedicated assessment service; search; partition heavy tables |
| Enterprise | Isolation, audit trails, calibration pipelines as first-class jobs |

---

## Current vs target (honest)

| Layer | Current | Target |
|-------|---------|--------|
| Web | Next.js App Router | Same |
| Mobile | Expo app present | Full Phase 1 journeys |
| Jobs + extraction + matching | Implemented | Feeds practice targeting |
| Assessment engine | Backend present (`lib/assessment/`: normalized `practice_dimension_scores`, competency vector, deterministic weighted rollup, reproducible provider/model/prompt/rubric/temperature) — **not currently exposed** (surface deferred) | Surfaced as AI Interview Practice in Phase 2 |
| Interview experience reports | Live v1 (`/share`, `/reports`: confidence-scored, probabilistic) | Corroboration graph + calibration labels |
| Enterprise | Not built | Phases 3–5 |

---

## Common mistakes

| Mistake | Why it violates the vision |
|---------|----------------------------|
| Building job-board features that ignore practice/assessment | Breaks the flywheel |
| Parsing `job.description` in matching/filters | Undermines canonical extraction |
| Coupling product logic to one LLM SDK | Blocks model replacement |
| Storing interview reports as binary “verified” | Ignores probabilistic confidence |
| Shipping AI without outcome metrics | Cannot calibrate the engine |

---

## Related documents

- [vision.md](./vision.md), [product.md](./product.md), [roadmap.md](./roadmap.md)
- [ingestion.md](./ingestion.md), [matching.md](./matching.md), [database.md](./database.md)
- [decisions.md](./decisions.md)
