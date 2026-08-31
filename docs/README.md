# Kazana Engineering Documentation

This directory is the **single source of truth** for how Kazana is designed, built, and evolved.

**Start here if you are new:** [vision.md](./vision.md) — the founding product manifesto.

---

## What Kazana is (one paragraph)

Kazana is an **AI Hiring Intelligence Platform**. The **assessment engine** is the product and the moat. Candidate products (Jobs, Resume Optimization, AI Interview Practice, Experience Sharing) create value and learning signals. Enterprise products monetize a *calibrated* engine and return workflow outcomes into the same learning system.

We are **not** a job board, ATS, interview-question repo, recruiter CRM, or generic interview SaaS.

**Decision filter:** *Does this strengthen the assessment engine or one of its learning loops?* If not, reconsider.

---

## Audience

| Audience | Read in order |
|----------|----------------|
| New engineers | [vision.md](./vision.md) → [product.md](./product.md) → [roadmap.md](./roadmap.md) → [architecture.md](./architecture.md) |
| Product / strategy | [vision.md](./vision.md) → [product.md](./product.md) → [roadmap.md](./roadmap.md) |
| Frontend | [architecture.md](./architecture.md) → [frontend.md](./frontend.md) → [api.md](./api.md) |
| Backend / platform | [architecture.md](./architecture.md) → [backend.md](./backend.md) → [database.md](./database.md) → [ingestion.md](./ingestion.md) |
| Matching / jobs | [matching.md](./matching.md) → [ingestion.md](./ingestion.md) |
| AI coding assistants | [vision.md](./vision.md) → [architecture.md](./architecture.md) → [decisions.md](./decisions.md) → subsystem doc for the task |

---

## Document map

```
docs/
├── README.md              ← You are here
├── vision.md              ← Manifesto: identity, flywheel, moat, principles
├── product.md             ← Product strategy: how surfaces serve the vision
├── roadmap.md             ← Strategic phases 1–5
├── architecture.md        ← Topology + engineering/AI principles for learning
├── frontend.md            ← Web + mobile clients
├── backend.md             ← API, workers
├── database.md            ← Schema, RLS, migrations
├── ingestion.md           ← Job ETL / extraction
├── matching.md            ← Job–candidate matching
├── notifications.md       ← Push
├── api.md                 ← API contracts
├── deployment.md          ← Envs, CI/CD
├── contributing.md        ← How to work in this repo
├── coding-standards.md    ← Style and review
├── security.md            ← Auth, secrets, RLS
├── testing.md             ← Quality gates
├── glossary.md            ← Terms
└── decisions.md           ← ADRs
```

Narrative docs (`vision`, `product`, `roadmap`, `architecture`) are intentionally non-duplicative: vision states *why*, product *what*, roadmap *when/phases*, architecture *how systems reinforce learning*.

---

## Current repository state

| Layer | Now | Role in vision |
|-------|-----|----------------|
| Next.js web + API | Live | Candidate platform shell |
| Resume Vault | Live | Early structured candidate signal |
| Jobs + extraction + matching | Live | Acquisition surface + structured jobs |
| Expo mobile | Present | Candidate reach |
| AI Interview Practice / Experience Sharing | Next Phase 1 investments | Flagship assessment + calibration input |
| Enterprise | Future | Phases 3–5 |

Subsystem docs describe **target** behavior and call out gaps where code is still catching up.

---

## How to keep docs accurate

1. Strategy / positioning change → update [vision.md](./vision.md) (and product/roadmap if phases shift).
2. Architectural change → [architecture.md](./architecture.md) + ADR in [decisions.md](./decisions.md).
3. New API or table → [api.md](./api.md) / [database.md](./database.md).
4. Security / RLS → [security.md](./security.md) + [database.md](./database.md).
5. New feature proposal → apply the decision filter in [vision.md](./vision.md) before building.

---

## Conventions

- **MUST** / **SHOULD** / **MAY** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).
- Diagrams: Mermaid or ASCII.
- ADRs numbered in [decisions.md](./decisions.md).
