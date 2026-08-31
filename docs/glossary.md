# Glossary

## Purpose

Domain and technical terms used across Kazana documentation.

---

## Product terms

| Term | Definition |
|------|------------|
| **AI Hiring Intelligence Platform** | Kazana’s identity: learning system that improves hiring decisions over time |
| **Assessment engine** | Core product/moat: models hiring behavior and produces calibrated assessments |
| **Flywheel** | Jobs → Resume Optimization → AI Interview Practice → Real Interview → Experience Submission → Better Assessments → More Users |
| **Resume Vault** | Candidate surface to upload/discover resumes that passed company screening |
| **Jobs Dashboard** | Acquisition/retention surface for browsing jobs—not the strategic moat |
| **Job Discovery / Matches** | Ingested jobs matched to a candidate profile |
| **AI Interview Practice** | Flagship B2C assessment experience (Phase 1+) |
| **Interview experience report** | Confidence-scored submission about a real interview (learning signal) |
| **Confidence score** | Probabilistic trust in a signal; preferred over binary verified/unverified |
| **Discover** | Public browse UI for resumes (Resume Vault) |
| **My Resumes** | Authenticated user's resume management screen |
| **ATS** | Applicant Tracking System — employer software; Kazana is **not** an ATS |
| **Screening** | Passed initial automated/human resume review (not necessarily offer) |
| **Job family** | Role category (e.g. Software Engineer, Product Manager) |
| **Level** | Seniority band (L1–L9 in Kazana) |
| **Match** | Association between a user and a job with relevance score |
| **Canonical extraction** | Structured job fields + per-field confidence/evidence from the ETL pipeline |

---

## Data terms

| Term | Definition |
|------|------------|
| **Resume metadata** | Non-PDF fields: companies, job family, level, years, etc. |
| **Private name** | `resumes.name` — user-defined label, not shown to others |
| **Lookup table** | Reference data: companies, countries, universities |
| **Normalized job** | Job record in internal schema after ingestion processing |
| **External ID** | Stable identifier from job source for deduplication |

---

## Technical terms

| Term | Definition |
|------|------------|
| **RLS** | Row Level Security — PostgreSQL policies restricting row access |
| **Anon key** | Supabase public API key safe for client (RLS enforced) |
| **Service role** | Supabase admin key — bypasses RLS; server only |
| **Edge Function** | Supabase serverless function at the edge |
| **Adapter** | Source-specific ingestion module (fetch + normalize) |
| **ADR** | Architecture Decision Record — see [decisions.md](./decisions.md) |

---

## Acronyms

| Acronym | Expansion |
|---------|-----------|
| FCM | Firebase Cloud Messaging |
| OAuth | Open Authorization (Google login) |
| SSR | Server-Side Rendering |
| CSR | Client-Side Rendering |
| SLA | Service Level Agreement |
| MVP | Minimum Viable Product |

---

## Field naming notes

| UI label | DB column | Notes |
|----------|-----------|-------|
| Years of Experience | `years_of_experience` | Legacy `years` may exist |
| Companies | `companies` (text[]) | Was singular `company` |
| Resume Name | `name` | Private |

---

## Related documents

- [product.md](./product.md)
- [database.md](./database.md)
