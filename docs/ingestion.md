# Job Ingestion

## Purpose

Defines how Kazana continuously ingests jobs from external sources, normalizes them, and stores them for matching and discovery.

**Status: Implemented in prototype** — SQL migrations, Node ingestion CLI (`npm run ingest`), and `/jobs` frontend.

---

## Quick start (prototype)

1. **Run SQL** in Supabase SQL Editor (in order):
   - `create_jobs_tables.sql`
   - `rls_policies_jobs.sql`

2. **Add env vars** to `.env` (never commit service role key):
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. **Ingest jobs:**
   ```bash
   npm run ingest                  # incremental (default) — only new/changed jobs
   npm run ingest:full             # re-upsert everything (refresh descriptions)
   npm run ingest -- --source remotive
   ```

   **Incremental sync** uses `job_sources.last_fetched_at` per company. Public Lever/Greenhouse APIs still return the full job list (no server-side `since` filter), but Kazana only normalizes and upserts jobs that are new or updated, and marks removed listings as expired. Greenhouse incremental also skips heavy `content=true` on the full list and fetches descriptions only for new/changed roles.

   **Ingest metrics:** each `npm run ingest` appends a session to `logs/ingest-metrics/YYYY-MM-DD.json` (gitignored under `logs/`) with **session-level** (not per-source) totals: upserts, skips, failures, expiries, extracted, LLM calls, token usage (prompt / completion / cache hit·miss), and **estimated USD cost** from DeepSeek’s published rates. Each session also snapshots DeepSeek `GET /user/balance` **before and after** the run (`deepseek_balance_before` / `deepseek_balance_after`) and records `balance_spent_usd` (before − after). Estimated cost and balance delta can diverge slightly (billing lag, concurrent usage).

   **Date key:** the filename uses the **local calendar day of `started_at`**, not `finished_at`. If ingest starts on day D and finishes after local midnight, the session is still appended to `D.json`.

   Example (reconstructed Jul 30 ingest): `scripts/ingestion/examples/ingest-metrics-2026-07-30.json`.

   **Freshness model:** each job stores `posted_at` (employer), `discovered_at` (first Kazana ingest — never overwritten), `last_updated_at` + `job_version` (bumped only when a content hash of title/description/location/etc. changes). The Jobs feed defaults to **Newly Discovered** sort and supports freshness windows (15m → week).

   **Semantic extraction:** after identity normalize + freshness, each job runs the **AI-assisted extraction pipeline** (`scripts/ingestion/extraction/`): Stage 1 ATS structured fields → Stage 2 modular extractors (confidence-scored) → optional one-shot DeepSeek LLM when important fields are weak → merge (never overwrite trusted ATS) → validate → persist `jobs.extraction` JSONB + denormalized years/family + facet/tag projection. Matching must not parse raw descriptions.

   Apply `db/migrations/20260719090000_semantic_facets_tags.sql` and `db/migrations/20260726090000_job_extraction_canonical.sql`.

   Optional LLM env:
   ```
   DEEPSEEK_API_KEY=...
   DEEPSEEK_MODEL=deepseek-v4-flash
   EXTRACTION_CONFIDENCE_THRESHOLD=0.7
   ```

   Reprocess historical jobs:
   ```bash
   npm run extract:reprocess -- --limit 50
   npm run extract:reprocess -- --job-id <uuid> --force-llm
   ```

4. **Browse** at `/jobs` in the app.

Seeded ATS sources include **Greenhouse**, **Lever**, **Ashby**, **Workday**, and **Eightfold** boards (see `db/migrations/*_sources*.sql`).

```bash
npm run ingest -- --source ashby-openai   # one Ashby company
npm run ingest -- --source wd-nvidia      # one Workday company
npm run ingest -- --source ef-microsoft   # one Eightfold company
npm run ingest:probe-ats:write            # re-discover public boards
```

---

## Goals

1. **Legal compliance** — only licensed APIs, RSS, and permitted sources
2. **Idempotency** — re-running ingestion does not duplicate jobs
3. **Observability** — per-source success/failure metrics
4. **Schema uniformity** — all sources map to one internal `jobs` model

---

## Pipeline overview

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Source A    │   │ Source B    │   │ Source C    │
│ (Licensed   │   │ (RSS)       │   │ (API)       │
│  API)       │   │             │   │             │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────────────┬┴─────────────────┘
                        ▼
              ┌──────────────────┐
              │ Fetch adapter    │  per-source client
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │ Raw payload      │  optional staging table / S3
              │ archive          │
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │ Normalize        │  map → internal schema
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │ Dedupe + upsert  │  (source_id, external_id)
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │ Classify         │  Facets + Tags (multi-valued)
              └────────┬─────────┘
                       ▼
              ┌──────────────────┐
              │ jobs + job_facets│
              │ + job_tags       │
              └────────┬─────────┘
                       │
                       ▼
              Trigger matching worker (async)
```

---

## Semantic model: Facets vs Tags

Jobs are **not** mapped to a single Job Family. Real roles span disciplines; Kazana models each job as a rich semantic object.

| Layer | Purpose | Examples | Powers |
|-------|---------|----------|--------|
| **Facets** | Structured, predefined, highly filterable | Career Areas (multi), Experience Level, Employment Type, Work Arrangement, Company, Location | Filtering, sorting, recommendations, analytics |
| **Tags** | Open-ended semantic descriptors with provenance | Python, React, LLMs, Kubernetes | Search, recommendations, notifications, analytics |

### Tag provenance (`job_tags.tag_source`)

| Source | Meaning |
|--------|---------|
| `employer` | Explicitly mentioned in the job description |
| `ai` | Inferred by Kazana (rule-based today; ML later) |
| `community` | Reserved for future community-derived metadata |

### Schema (normalized — no JSON arrays)

- `facets` / `job_facets` — catalog + job links (`source`, `confidence`)
- `tags` / `job_tags` — catalog + job links (`tag_source`, `confidence_score`)

Classifier: `scripts/ingestion/classification/` (wired in `pipeline.js` after upsert).

Legacy `jobs.job_family` / `jobs.level` remain populated as a coarse fallback for older matching UI until full cutover.

### Search & filtering

- **Search (`q`)** spans title, description, company, location, and Tags (employer + AI)
- **Filters** primarily use Facets; Career Areas are multi-select with OR semantics

---

## Internal job schema (target)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | uuid | yes | Internal PK |
| `source_id` | uuid FK | yes | Which feed |
| `external_id` | text | yes | Stable ID from source |
| `title` | text | yes | |
| `company_name` | text | yes | Normalized |
| `location` | text | no | City, country, remote |
| `description` | text | no | Sanitized HTML → text |
| `url` | text | yes | Apply link |
| `job_family` | text | no | Legacy coarse label (fallback); prefer Career Area facets |
| `level` | text | no | Legacy L-level; prefer Experience Level facet |
| `posted_at` | timestamptz | no | |
| `expires_at` | timestamptz | no | Soft-delete when passed |
| `raw_payload` | jsonb | no | Debug only; TTL |

**Unique constraint:** `(source_id, external_id)`

Related semantic tables: `facets`, `job_facets`, `tags`, `job_tags` (see migration `20260719090000_semantic_facets_tags.sql`).

---

## Source adapter pattern

Each source implements:

```
interface JobSourceAdapter {
  sourceId: string;
  fetch(since: Date): Promise<RawJob[]>;
  normalize(raw: RawJob): NormalizedJob;
}
```

### WHY adapter pattern

| Benefit | Alternative rejected |
|---------|---------------------|
| Add sources without changing core pipeline | One giant switch statement |
| Test normalization per source | |
| Disable source independently | |

---

## Scheduling

| Environment | Trigger |
|-------------|---------|
| Production | Cron every 15–60 min per source (configurable) |
| Staging | Manual + reduced schedule |
| Dev | CLI command |

**Rejected:** Real-time polling on every user request — unpredictable load and ToS risk.

---

## Communication with other subsystems

| Subsystem | Interaction |
|-----------|-------------|
| [database.md](./database.md) | Writes `jobs`, `job_sources`, ingestion logs |
| [matching.md](./matching.md) | Notified on new/updated jobs (event or poll) |
| [backend.md](./backend.md) | Workers run ingestion |
| [security.md](./security.md) | API keys in secrets manager |

---

## Design principles

1. **Store raw, normalize async** — recover from mapping bugs
2. **Rate limit per source** — respect API quotas
3. **Dead letter queue** for permanently failing records
4. **Geo and license metadata** on `job_sources` — disable by region if needed

---

## Assumptions

- Initial sources: 2–3 partners/RSS feeds, not entire open web
- English job postings first
- Kazana does not host application flow — external `url` only

---

## Future expansion

- Stronger AI tag enrichment (LLM classifiers with confidence scores)
- Community tags (visa sponsorship, interview quality, etc.)
- Employer direct feed (verified uploads)
- Deduplication across sources (same job, multiple listings)

---

## Known limitations

- Rule-based Career Area / Tag extraction is imperfect vs. full LLM classification
- Legacy `job_family` / `level` remain for resume matching until that subsystem migrates to facets/tags
- RSS feeds may lack stable external IDs — may need hash-based fallback with collision handling

---

## Common mistakes

| Mistake | Risk |
|---------|------|
| Scraping without license | Legal exposure |
| No `external_id` | Duplicates |
| Ingestion in API route | Timeouts |
| Deleting jobs hard on missing feed | Data loss; prefer `expires_at` |
| Storing facets/tags as JSON arrays | Breaks filter/analytics; use normalized tables |

---

## Related documents

- [matching.md](./matching.md)
- [decisions.md](./decisions.md) — ADR on ingestion stack
- [database.md](./database.md)