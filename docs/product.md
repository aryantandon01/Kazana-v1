# Product Strategy

## Purpose

Maps Kazana products to the company vision. Feature work MUST reinforce the [assessment engine and flywheel](./vision.md)—not expand Kazana into adjacent categories we explicitly reject.

---

## Positioning

| We are | We are not |
|--------|------------|
| AI Hiring Intelligence Platform | Job board, ATS, question bank, recruiter CRM, generic interview SaaS |
| Assessment-engine company | Marketplace that ends at “apply externally” |

**Jobs Dashboard** is a growth and retention surface. **AI Interviews** are the flagship B2C product. **Enterprise screening and workflow tools** monetize the engine.

---

## How products feed the flywheel

```
Jobs → Resume Optimization → AI Interview Practice → Real Interview
  → Interview Experience Submission → Assessment Improvement → Better practice → More users
```

| Product | Strategic role | Learning signal |
|---------|----------------|-----------------|
| **Jobs Dashboard** | Acquisition / retention | Preferences, matches engaged, apply intent |
| **Resume Optimization** | Interview readiness | Structured profile, skills, experience, gaps |
| **AI Interview Practice** | Flagship B2C assessment | Performance, rubrics, retries, topic weakness |
| **Interview Experience Sharing** | Ground-truth loop | Confidence-scored reports of real interviews |
| **Enterprise First-Round Screening** (later) | Monetization of calibration | Screening outcomes at scale |
| **Recruiter workflow tools** (later) | Distribution + signal | Notes, scorecards, decisions, process data |

---

## Current platform surfaces (engineering reality)

These exist in the repository today and should be framed as **Phase 1 candidate-platform** building blocks—not as the end state.

| Surface | Status | Vision mapping |
|---------|--------|----------------|
| Resume Vault / Discover | Live | Peer signal + resume contribution (early learning) |
| Jobs browse + filters | Live | Jobs acquisition surface |
| Matches + preferences | Live | Personalization; engagement with jobs |
| Job extraction / matching | Live | Structured job data for better practice targeting later |
| AI Interview Practice | Live (`/practice`) | Flagship assessment experience — structured rubrics, confidence-scored evaluations |
| Interview Experience Sharing | Live (`/share`, `/reports`) | Confidence-scored contribution loop |
| Enterprise screening | Future (Phase 3) | Monetized calibrated assessments |

---

## User roles

| Role | Role in the system |
|------|--------------------|
| **Candidate** | Receives value; generates assessments and experience signals |
| **Contributor** | Submits interview experiences with probabilistic confidence |
| **Enterprise recruiter / hiring manager** (future) | Consumes calibrated assessments; generates workflow outcomes |
| **Operator** | Source licensing, moderation, calibration ops |
| **System** | Ingestion, extraction, matching, assessment workers |

---

## Candidate journeys (Phase 1)

### Discover / contribute resumes (Resume Vault)

```
Discover → filter peer resumes → learn screening patterns
Add Resume → structured metadata + PDF → Discover / matching inputs
```

Privacy MUST remain: contributor `name` is owner-only on Discover.

### Jobs and matches

```
Ingest + extract structured jobs → match to profile → Matches / Jobs UI
Preferences (location, student, min score) shape what is shown
```

Jobs MUST NOT become the product identity. They exist to keep candidates in the loop toward practice and real interviews.

### Future: practice → real interview → report

```
AI Interview Practice → real company interview → Interview Experience Submission
  → confidence scoring → assessment calibration
```

---

## Interview contributions (confidence, not verification theater)

Reports are inputs to a **learning system**, not gospel.

- Store evidence and **confidence**, not a binary verified flag as the primary UX.
- Raise confidence with corroboration (emails, reputation, overlapping reports, timeline consistency).
- Downstream assessments should weight contributions by confidence.

---

## Domain entities (strategic)

| Entity | Why it exists |
|--------|----------------|
| Candidate profile / resume | Structured readiness + matching input |
| Job (canonical extraction) | Target roles for practice and prep—not a board destination |
| Match / preference | Engagement signal |
| Assessment / practice session | Core product artifact |
| Interview experience report | Calibrating signal with confidence |
| Enterprise screen / scorecard (future) | Monetization + outcome labels |
| Extraction / facet / tag | Reusable structured job intelligence |

---

## Product principles (operating)

1. Improve the assessment engine—or strengthen a named learning loop.
2. Jobs = engagement, not moat.
3. Resume Optimization = readiness for interviews.
4. AI Interviews = flagship B2C.
5. Enterprise = monetize calibration.
6. Workflow data = more learning.
7. Candidate ↔ enterprise flywheel must remain intact.

Full manifesto: [vision.md](./vision.md).

---

## Explicit non-goals (product)

- Becoming a general ATS or recruiting CRM
- Competing primarily as a job board
- Shipping AI features without a path to measurement or calibration
- Treating scraped or user-reported interview content as ground truth without confidence

---

## Related documents

- [vision.md](./vision.md)
- [roadmap.md](./roadmap.md)
- [matching.md](./matching.md), [ingestion.md](./ingestion.md) — current Jobs/matching implementation
- [glossary.md](./glossary.md)
