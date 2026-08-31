# Vision

**Kazana is an AI Hiring Intelligence Platform.**

This document is the founding product manifesto. Every feature, architecture choice, and roadmap item should be judged against it.

---

## What Kazana is

Kazana builds a **continuously improving assessment engine** that learns how hiring actually works—and uses that intelligence to help candidates prepare and enterprises hire better.

The **assessment engine is the product**. Everything else supports it.

### What Kazana is not

| Not this | Why |
|----------|-----|
| A job board | Jobs are an acquisition surface, not the moat |
| An ATS | We do not replace applicant tracking systems |
| An interview question repository | We model hiring behavior, not memorize questions |
| A recruiter CRM | CRM is not the core; workflow data feeds learning |
| An interview platform that ends at practice | Practice is a learning loop into real outcomes |

### The decision filter

Whenever we propose a new feature, ask:

> **Does this naturally strengthen the assessment engine or one of its learning loops?**

If the answer is no, reconsider whether the feature belongs in Kazana.

A sharper operational form of the same question:

> **Does this improve our ability to make better hiring decisions over time?**

---

## Core philosophy

Kazana is a **learning system**, not a content dump.

```
Candidate Value
       ↓
Candidate Assessments
       ↓
Learning System
       ↓
Better Assessments
       ↓
Enterprise Adoption
       ↓
Recruiter Workflow Data
       ↓
Even Better Assessments
```

Data is not collected for its own sake. It exists to **improve hiring intelligence**.

---

## Long-term vision

Build a continuously improving assessment engine that gradually learns:

- interview styles
- evaluation patterns
- company expectations
- candidate strengths and weaknesses
- hiring outcomes
- assessment effectiveness

The objective is to **predict interview performance** and **improve hiring quality**.

Eventually Kazana becomes a **hiring intelligence layer for enterprises**—decision support grounded in calibrated assessments, not generic AI novelty.

---

## The flywheel

Every feature should strengthen this loop:

```
Jobs
  → Resume Optimization
  → AI Interview Practice
  → Real Interview
  → Interview Experience Submission
  → Assessment Improvement
  → Better AI Interviews
  → More Users
```

| Stage | Role |
|-------|------|
| Jobs | Acquisition and retention—not differentiation |
| Resume Optimization | Interview readiness; structured candidate signal |
| AI Interview Practice | Flagship B2C experience; primary assessment surface |
| Real Interview | Ground truth opportunity |
| Interview Experience Submission | Probabilistic learning signal (confidence-scored) |
| Assessment Improvement | Moat compounding |
| Better AI Interviews | Retention and trust |
| More Users | Scale of the learning system |

---

## Assessment engine (the moat)

This is the company's primary asset.

It should eventually understand:

- how companies evaluate candidates
- which competencies matter where
- how interviews differ by company, role, and stage
- what predicts success

**Goal:** model hiring behavior—not memorize interview questions.

Engineering implications:

- Prefer **reusable structured data** over opaque blobs
- Prefer **confidence-aware** and **explainable** outputs over binary labels
- Prefer **measurable calibration** loops over one-off model demos
- Prefer **provider-agnostic** AI abstractions (models and prompts must be replaceable)

---

## Candidate contributions (probabilistic, not binary)

Interview reports are **not** treated as absolute truth.

Every submission receives a **confidence score** that rises with corroborating signals, for example:

- invitation / rejection / advancement emails
- contributor reputation
- corroborating reports
- timeline consistency

Avoid “verified / unverified” as the product language. Reason **probabilistically**.

---

## Product principles

1. Every feature should improve the assessment engine.
2. The Jobs product exists to drive engagement, not differentiation.
3. Resume Optimization exists to improve interview readiness.
4. AI Interviews are the flagship B2C experience.
5. Enterprise products monetize the assessment engine.
6. Enterprise workflow data further improves the assessment engine.
7. Candidates and enterprises reinforce one another.

---

## Engineering principles

When implementing systems, optimize for:

| Principle | Meaning |
|-----------|---------|
| Reusable structured data | Canonical schemas, facets, extraction results—not re-parsing raw text at request time |
| Confidence-aware reasoning | Every important claim carries trust metadata |
| Continuous learning | Design for feedback loops from day one |
| Explainability | Users and operators can see *why* |
| Calibration | Measure whether assessments correlate with real outcomes |
| Model-agnostic AI | Business logic must not be tightly coupled to one LLM vendor |

---

## AI principles

We are not building AI for novelty.

- Use AI where it creates **measurable** improvements in hiring quality.
- Models should be **replaceable**.
- Prompts should be **versioned**.
- Learning loops should be **measurable**.
- Assessment quality should **improve over time**.

---

## Strategic phases (summary)

| Phase | Focus | Purpose |
|-------|-------|---------|
| **1** Candidate Platform | Jobs, Resume Optimization, AI Interview Practice, Interview Experience Sharing | Acquire users; generate value; collect learning signals |
| **2** Assessment Calibration | Outcomes, advancement, offers, rejections, feedback | Validate that Kazana assessments correlate with real hiring success |
| **3** Enterprise Entry | AI First-Round Screening | Monetize a *calibrated* engine—not generic AI |
| **4** Workflow Integration | Copilot, notes, scorecards, recruiter assistance, analytics | Workflow data as another learning signal |
| **5** Hiring Intelligence | Recommendations for interviews, decisions, interviewer calibration, process | AI decision-support layer |

Detail: [roadmap.md](./roadmap.md). Product surfaces: [product.md](./product.md). Systems: [architecture.md](./architecture.md).

---

## Related documents

- [product.md](./product.md) — how current and planned products serve the vision
- [roadmap.md](./roadmap.md) — strategic phases in depth
- [architecture.md](./architecture.md) — technical topology aligned to learning
- [glossary.md](./glossary.md) — domain terms
