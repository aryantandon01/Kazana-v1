# Architecture Decision Records (ADRs)

## Purpose

Records significant architectural decisions in ADR format for long-term maintainability. New decisions append with incrementing IDs.

**Status legend:** `Accepted` | `Proposed` | `Superseded` | `Deprecated`

---

## Index

| ID | Title | Status |
|----|-------|--------|
| [ADR-001](#adr-001-supabase-as-primary-backend) | Supabase as primary backend | Accepted |
| [ADR-002](#adr-002-nextjs-for-production-web-and-api) | Next.js for production web and API | Accepted |
| [ADR-003](#adr-003-expo-for-mobile) | Expo for mobile | Accepted |
| [ADR-004](#adr-004-row-level-security-for-authorization) | Row Level Security for authorization | Accepted |
| [ADR-005](#adr-005-separate-workers-for-ingestion-and-matching) | Separate workers for ingestion and matching | Accepted |
| [ADR-006](#adr-006-public-read-private-name-for-resumes) | Public read, private name for resumes | Accepted |
| [ADR-007](#adr-007-companies-as-array-on-resumes) | Companies as array on resumes | Accepted |
| [ADR-008](#adr-008-rule-based-matching-v1) | Rule-based matching v1 | Accepted |
| [ADR-009](#adr-009-fcm-for-push-notifications) | FCM for push notifications | Accepted |
| [ADR-010](#adr-010-vite-prototype-exception) | Vite SPA as prototype exception | Accepted |
| [ADR-011](#adr-011-client-side-pagination-prototype-only) | Client-side pagination (prototype only) | Accepted |
| [ADR-012](#adr-012-lookup-tables-for-async-select) | Lookup tables for AsyncSelect | Accepted |
| [ADR-013](#adr-013-ai-hiring-intelligence-platform) | AI Hiring Intelligence Platform as north star | Accepted |
| [ADR-014](#adr-014-ai-interview-practice-with-structured-rubrics) | AI Interview Practice with structured rubrics | Accepted |
| [ADR-015](#adr-015-confidence-scored-interview-experience-reports) | Confidence-scored interview experience reports | Accepted |
| [ADR-016](#adr-016-normalized-assessment-engine-v2) | Normalized Assessment Engine v2 | Accepted |
| [ADR-017](#adr-017-resume-copilot-structured-resume-optimization) | Resume Copilot — structured resume optimization | Accepted |

---

## ADR-001: Supabase as primary backend

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Kazana needs PostgreSQL, authentication, file storage, and optional serverless functions. Team size is small; operational overhead must be minimal.

### Decision

Use **Supabase** for PostgreSQL, Auth, Storage, and Edge Functions.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Firebase | Weak relational queries; poor fit for filters/joins |
| AWS RDS + Cognito + S3 | High ops burden; slower MVP |
| PlanetScale + Clerk | More vendors; no integrated storage |

### Trade-offs

| Pros | Cons |
|------|------|
| Fast MVP; integrated auth/storage | Vendor coupling |
| RLS built-in | Connection limits at extreme scale |
| Generous free tier | Less control than self-hosted PG |

### Consequences

- All relational data in Supabase PostgreSQL
- Migrations managed via SQL files / CLI
- Service role restricted to server/workers

### Future considerations

- Evaluate read replicas and connection pooler at 100K+ users
- Export strategy for regulatory portability

---

## ADR-002: Next.js for production web and API

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Production web needs SEO for Discover, colocated API, and alignment with hiring market. Current prototype uses Vite SPA.

### Decision

Migrate production web to **Next.js (App Router)** with **API Routes** for backend logic.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep Vite SPA + separate Express API | Two deployables; no SSR |
| Remix | Smaller ecosystem; team familiarity with Next |
| Serverless only (no Next) | Loses SSR and unified frontend |

### Trade-offs

| Pros | Cons |
|------|------|
| SSR/SSG for Discover | Learning curve App Router |
| Single deploy on Vercel | Serverless cold starts |
| API colocation | |

### Consequences

- Phase 1 roadmap includes Vite → Next migration
- API contracts defined in [api.md](./api.md)

### Future considerations

- Server Actions for form mutations where appropriate
- Edge runtime for geo-sensitive routes

---

## ADR-003: Expo for mobile

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Job Discovery requires push notifications and mobile-first engagement. Need iOS + Android from small team.

### Decision

Use **React Native with Expo** (Expo Router).

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| React Native CLI (bare) | Slower builds; more native config |
| Flutter | Different language; no code share with React web |
| PWA only | Limited push on iOS; poor app store presence |

### Trade-offs

| Pros | Cons |
|------|------|
| OTA updates; EAS Build | Expo version constraints |
| Shared React mental model | Native module edge cases |

### Consequences

- Mobile app in separate `apps/mobile` (target monorepo)
- Shared types package with web

### Future considerations

- Eject only if blocked by native module

---

## ADR-004: Row Level Security for authorization

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Prototype calls Supabase directly from browser. Authorization must not rely solely on client-side checks.

### Decision

Enforce access control with **PostgreSQL RLS** on all user-facing tables. API layer adds defense in depth (target).

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| App-only authorization | Bypassed if API bug or direct client |
| Postgres roles per user | Impractical with Supabase JWT model |

### Trade-offs

| Pros | Cons |
|------|------|
| DB-enforced security | Policy complexity |
| Works with direct client | Easy to misconfigure (empty data) |

### Consequences

- SQL policy files required in repo
- Enabling RLS without policies breaks app — documented in TROUBLESHOOTING

### Future considerations

- Automated RLS tests in CI

---

## ADR-005: Separate workers for ingestion and matching

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Job ingestion is scheduled, long-running, and failure-prone. Must not block user requests.

### Decision

Run **ingestion**, **matching**, and **notification dispatch** as **background workers** triggered by cron or queue.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Next.js API cron only | Timeout limits; tight coupling |
| Supabase pg_cron only | Limited orchestration across sources |
| Real-time per-request matching | O(users × jobs) per request |

### Trade-offs

| Pros | Cons |
|------|------|
| Retries, rate limits | Infra to monitor |
| Scales independently | Delayed consistency |

### Consequences

- See [ingestion.md](./ingestion.md), [matching.md](./matching.md)
- Idempotent upserts required

### Future considerations

- Redis/SQS queue at high volume

---

## ADR-006: Public read, private name for resumes

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Users upload resumes for others to learn from, but may use internal labels ("Backend resume", "Google version").

### Decision

- **Public:** companies, job family, level, years, country, university, PDF
- **Private:** `resumes.name` — visible only to owner
- Discover search MUST NOT query `name`

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Fully anonymous uploads | Harder for users to manage multiple resumes |
| Fully public including name | Privacy concern; users won't upload |

### Trade-offs

| Pros | Cons |
|------|------|
| Trust + usability | Users can't search by others' names |

### Consequences

- PDF modal for others excludes name field
- API DTOs must strip `name` on public endpoints

### Future considerations

- Optional display name users choose to make public

---

## ADR-007: Companies as array on resumes

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Users pass screening at multiple companies with same resume. Single `company` field insufficient.

### Decision

Store **`companies` as `text[]`** on `resumes`.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Single company field | Loses signal |
| Junction table resume_companies | Overkill for MVP; array sufficient |

### Trade-offs

| Pros | Cons |
|------|------|
| Simple queries; matches product | Array GIN index needed at scale |

### Consequences

- UI: multi-select AsyncSelect
- Display: "Amazon +4" pattern with tooltip

### Future considerations

- Junction table if per-company metadata needed (date, round)

---

## ADR-008: Rule-based matching v1

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Job Discovery needs relevance scoring without ML infrastructure or labeled data.

### Decision

**Rule-based weighted scoring** for v1 (job family, level, location, company preferences).

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| ML ranker day one | No training data; ops overhead |
| No scoring — notify all | Push fatigue |

### Trade-offs

| Pros | Cons |
|------|------|
| Explainable; debuggable | Lower ceiling on relevance |

### Consequences

- `matches.reasons` jsonb stores explainability
- Revisit ML when click data exists

### Future considerations

- Learning-to-rank from open/apply events

---

## ADR-009: FCM for push notifications

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Mobile app needs push for job matches. Expo integrates with FCM.

### Decision

Use **FCM via Expo Notifications** as primary push provider.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| OneSignal | Cost; extra vendor (fallback option) |
| Direct APNS + FCM | More implementation work |

### Trade-offs

| Pros | Cons |
|------|------|
| Free; Expo native | Google dependency |

### Consequences

- `device_tokens` table stores FCM tokens
- See [notifications.md](./notifications.md)

### Future considerations

- OneSignal if marketing campaigns dominate

---

## ADR-010: Vite SPA as prototype exception

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Need fast validation of Resume Vault UX before committing to Next.js migration.

### Decision

Allow **Vite + React SPA** for prototype phase only. **Not** production target.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Start with Next.js | Slower initial iteration for solo dev |
| No prototype | Slower product learning |

### Trade-offs

| Pros | Cons |
|------|------|
| Fast dev server; simple | No SSR; client-only security model |

### Consequences

- Direct Supabase from browser acceptable temporarily
- Documented in [docs/README.md](./README.md) current vs target table

### Future considerations

- Deprecate Vite app after Phase 1 migration

---

## ADR-011: Client-side pagination (prototype only)

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Discover fetches all resumes then paginates in browser. Acceptable for hundreds of rows, not millions.

### Decision

**Client-side filter/sort/pagination** in prototype. **Server-side pagination** required for production API.

### Alternatives considered

| Alternative | Why rejected for prototype |
|-------------|---------------------------|
| Server pagination now | No API layer yet |
| Load all forever | Breaks at scale |

### Trade-offs

| Pros | Cons |
|------|------|
| Simple implementation | Memory/network at large N |

### Consequences

- Migrate to `GET /resumes?page=&limit=` in Phase 1
- Indexes still recommended on DB

### Future considerations

- Cursor-based pagination for mobile infinite scroll

---

## ADR-012: Lookup tables for AsyncSelect

**Status:** Accepted  
**Date:** 2026-07-06

### Context

Companies, countries, universities need searchable dropdowns with large datasets (especially universities).

### Decision

Dedicated **lookup tables** populated via SQL seed scripts; queried with `ilike` search from AsyncSelect.

### Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Hardcoded JSON in client | Bundle size; stale data |
| External geocoding API only | Cost; offline dev |
| Full-text search engine | Overkill for MVP |

### Trade-offs

| Pros | Cons |
|------|------|
| Consistent UX; DB-backed | Large universities seed file |
| RLS: public read | Manual seed updates |

### Consequences

- `create_*_table.sql` files in repo
- RLS policies for public SELECT

### Future considerations

- Admin UI to add companies
- Prefix search index for universities

---

## ADR-013: AI Hiring Intelligence Platform as north star

**Status:** Accepted  
**Date:** 2026-07-30

### Context

Kazana began as Resume Vault + Job Discovery (“career intelligence”). The durable strategy is a continuously improving **assessment engine** that learns from candidate practice and real outcomes, then powers enterprise hiring intelligence. Without an explicit north star, features drift toward job-board or ATS shapes we reject.

### Decision

- Position Kazana as an **AI Hiring Intelligence Platform**.
- Treat the **assessment engine** as the primary product and moat.
- Use Jobs / Resume Optimization / AI Interviews / Experience Sharing as Phase 1 candidate surfaces that feed the flywheel.
- Monetize via enterprise products that consume a *calibrated* engine; feed workflow outcomes back into learning.
- Require the product decision filter on new work; prefer confidence-aware, structured, provider-agnostic systems.

Canonical docs: [vision.md](./vision.md), [product.md](./product.md), [roadmap.md](./roadmap.md), [architecture.md](./architecture.md).  
Cursor rule: `.cursor/rules/kazana-vision.mdc` (`alwaysApply: true`).

### Alternatives considered

- Remain a job board with resume social features — rejected (no durable moat).
- Become an ATS — rejected (wrong category).
- Ship generic “AI interview” without calibration — rejected (novelty without learning).

### Consequences

- Roadmap phases 1–5 replace the old prototype→monetize engineering phases as the strategic narrative.
- Matching/ingestion remain important but are acquisition and structure—not the end product.
- Future ADRs should cite alignment with the assessment flywheel.

### Future considerations

- Assessment runtime schema and calibration metrics as first-class platform components.

---

## ADR-014: AI Interview Practice with structured rubrics

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Phase 1 calls for **AI Interview Practice** as the flagship B2C assessment surface. It must generate structured, explainable, confidence-scored assessments — not generic chat — and feed the assessment engine that Phase 2 calibration depends on.

### Decision

- New `practice_rubrics`, `practice_sessions`, and `practice_questions` tables.
- Rubrics are **structured data** (dimensions + weights), versioned, with prompt version recorded on every output.
- Each session: LLM generates questions → candidate answers each → per-answer evaluation scored against the rubric → final rollup assessment stored on the session.
- All LLM I/O through `lib/assessment/provider.js` (model-agnostic, mirrors the extraction provider). Prompts live in `lib/assessment/prompts.js` (versioned exports).
- Fallback deterministic question sets and assessments when the LLM is unavailable, so the feature never hard-fails.
- `POST /api/practice/sessions`, `GET /api/practice/sessions`, `GET/POST /api/practice/sessions/[id]`, and UI at `/practice` + `/practice/[id]`.

### Alternatives considered

- Storing questions/evaluations as a single JSONB blob — rejected: no per-question RLS/querying, and less flexible for calibration analytics.
- Hardcoding company-specific question banks — rejected: doesn't scale and becomes a question repository, which the vision explicitly rejects.
- Inlining prompt text in business logic — rejected: violates the versioned-prompts principle.

### Trade-offs

- LLM calls per session (question generation + one per answer + final rollup) cost more than a single-shot chat, but produce structured, comparable assessments.
- Rubric dimension weights are initially static; calibration may later tune them per outcome.

### Consequences

- Sessions/questions are owner-only via RLS; rubrics are public read.
- Each assessment carries confidence + model + prompt version — the raw material for Phase 2 calibration.
- Deterministic fallbacks keep the product usable without an API key.

### Future considerations

- Voice responses, coding assessments, timed sessions.
- Calibration: compare practice scores to real interview outcomes (Phase 2).
- Rubric versioning/migration when dimensions change.

---

## ADR-015: Confidence-scored interview experience reports

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Candidates share real interview experiences. Per the vision, reports are **inputs to a learning system** — never binary "verified." The product must reason probabilistically.

### Decision

- New `interview_reports` table storing questions, topics, difficulty, outcome, interview date, report text, and a **confidence JSONB**.
- Confidence computed by `lib/assessment/reportConfidence.js`: base 0.40, rising with email evidence (hashed only), corroborating reports, contributor reputation, timeline consistency, and detail level. Cap 0.95. Levels: low/medium/high.
- Email evidence is **hashed** — the raw email is never stored.
- Public read of published reports (privacy-stripped); owner write only.
- API: `POST /api/reports`, `GET /api/reports` (browse/search/sort by confidence), `GET /api/reports/[id]`. UI: `/share` and `/reports[/:id]`.

### Alternatives considered

- Binary "verified/unverified" label — rejected per vision (probabilistic reasoning).
- Storing raw emails as evidence — rejected (privacy).
- Storing confidence as an opaque number — rejected; signals and level are stored for explainability.

### Trade-offs

- Confidence is approximate until calibration; corroboration bucketing is coarse.
- Public read broadens distribution but requires careful privacy stripping.

### Consequences

- Reports are an early ground-truth loop for Phase 2 calibration.
- Privacy: no email, no user identity exposed on public reports.

### Future considerations

- Reputation scoring, corroboration graph, LLM-assisted moderation, and outcome-latency analytics.

---

## ADR-016: Normalized Assessment Engine v2

**Status:** Accepted
**Date:** 2026-08-06

### Context

v1 stored per-question evaluations and session dimension scores in JSONB blobs (_practice_questions.evaluation_, _practice_sessions.dimension_scores_). Answering "which competencies do candidates struggle with?" required nested _jsonb_each_ — not sustainable for calibration analytics, trends, or future ML.

### Decision

Introduce a **normalized competency model**:

- _dimensions_ — canonical competency vocabulary (slug, label, description)
- _rubric_dimensions_ — junction table with weights, positive/negative indicators, evaluation guidance (replaces the JSONB _dimensions_ array on _practice_rubrics_)
- _practice_question_evaluations_ — one row per answered question with provider/model/prompt_version/temperature for reproducibility
- _practice_dimension_scores_ — **the primary asset**: one row per dimension per evaluation (score + confidence + evidence)
- _assessment_events_ — append-only timeline (session created, question answered, interview completed, etc.)
- _confidence_rules_ — configurable confidence weights (addable/disabled without code changes)

Engine changes:

- _evaluateResponse()_ writes normalized rows AND legacy JSONB for backward compatibility
- _completeSession()_ aggregates dimension scores **deterministically** from normalized tables (weighted by rubric dimensions); LLM only generates text (summary/strengths/gaps/recommendations)
- Overall score is a weighted rollup of the competency vector — not an LLM guess
- Session stores provider/model/temperature/prompt_version/rubric_version for reproducibility

### Alternatives considered

- Keep JSONB blobs and add GIN indexes — rejected: nested JSON queries are not analyzable at the speed/flexibility needed
- Materialize competency vectors as a separate table — deferred: derived from dimension scores on read
- Rubric inheritance via parent_id now — deferred: schema added, resolver stays flat for v2

### Trade-offs

- Normalized writes double (JSONB + relational) during cutover — accepted, JSONB removed in a future cleanup migration
- Old sessions' analytics live only in JSONB — forward-looking fix; backfill script deferred
- LLM rollup no longer produces the numeric score directly — the weighted aggregation from rubric dimensions is the source of truth

### Consequences

- Structured SQL now answers: "What competencies predict advancement?" / "How has Communication improved over time?" / "Which company weights System Design most?"
- Every assessment is reproducible (provider/model/prompt/rubric/temperature recorded)
- Rubrics are data, not company hardcodes — inheritance-ready via parent_id

### Future considerations

- Backfill old JSONB evaluations into normalized tables
- Calibration: correlate dimension scores with interview report outcomes
- Rubric inheritance resolution, company-specific rubrics

---

## ADR-017: Resume Copilot — structured resume optimization

**Status:** Accepted
**Date:** 2026-08-07

### Context

Phase 1 required **Resume Optimization** as the missing flywheel link between job browsing and interview readiness. Users upload PDFs but there was no structured representation, no optimization workflow, and no versioning — the PDF was an opaque artifact.

### Decision

- **The structured resume JSON is the source of truth**, not the PDF. The uploaded PDF is an import artifact, never modified.
- New pipeline: PDF → parsed structured JSON → deterministic quality analysis → LLM optimization suggestions → user accept/reject/edit → new version snapshot → export.
- New tables: `resume_versions` (append-only snapshots), `resume_parsed_data` (canonical structured JSON), `resume_optimization_sessions` (chat history), `resume_suggestions` (diff-based, per-suggestion status), `generated_resume_exports`.
- The quality engine is **deterministic** (cheap-first, mirrors the extraction philosophy) — the LLM is only used for parse and optimization suggestion generation.
- Suggestions are individual DB rows with `field_path`, current/suggested text, rationale, and estimated impact — queried, not buried in chat JSON.
- Prompts are versioned (`resume-parse-v1`, `resume-optimize-v1`); LLM access goes through the existing provider abstraction.
- Chat-style UI at `/resume-manager/[id]/copilot`; entry point is a "Resume Copilot ✨" action in My Resumes.
- MVP export is structured JSON; a PDF renderer can be plugged into the export route without changing its response shape.

### Alternatives considered

- Building a resume builder / PDF editor — rejected (non-goal, per product strategy).
- Editing the PDF directly — rejected (destroys original; loses structure).
- Running quality analysis via LLM — rejected (expensive, non-deterministic); deterministic analysis is instant and explainable.

### Trade-offs

- Parsing happens on first copilot open, not on upload — avoids adding latency to the upload flow.
- Versions are full snapshots, not diffs — simpler to query/restore for MVP; storage cost acceptable.
- Export is JSON for MVP — PDF rendering is a fast-follow, same endpoint shape.

### Consequences

- Every resume now has a canonical structured representation; resume skills (a weak proxy in matching) can later be sourced from parsed data.
- Candidates can visibly improve a resume across sessions, with full history.
- The original PDF is always preserved; every accepted suggestion creates a new version.

### Future considerations

- PDF rendering library for real ATS-safe exports.
- Skills extraction feeding the matching engine (replacing `FAMILY_SKILL_PRIORS`).
- Diff comparison UI between versions.
- Calibration: measure whether accepted suggestions correlate with real interview outcomes.

---

## How to add a new ADR

1. Copy template below
2. Assign next ID
3. Get review from maintainer
4. Update index table in this file

### Template

```markdown
## ADR-XXX: Title

**Status:** Proposed
**Date:** YYYY-MM-DD

### Context
### Decision
### Alternatives considered
### Trade-offs
### Consequences
### Future considerations
```
