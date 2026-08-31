# Roadmap

## Purpose

Strategic product phases for Kazana as an **AI Hiring Intelligence Platform**. This is the company roadmap—not a sprint board.

Engineering delivery detail for the current codebase lives in subsystem docs ([ingestion.md](./ingestion.md), [matching.md](./matching.md), [deployment.md](./deployment.md)). Those MUST serve the phases below.

---

## North star

A continuously improving **assessment engine** that predicts interview performance and improves hiring quality—first for candidates, then as an enterprise hiring intelligence layer.

See [vision.md](./vision.md).

---

## Phase 1 — Candidate Platform

**Purpose:** Acquire users. Generate candidate value. Collect learning signals.

| Product | Intent |
|---------|--------|
| Jobs Dashboard | Acquisition and retention (not the moat) |
| Resume Optimization | Interview readiness; structured candidate data |
| AI Interview Practice | Flagship B2C assessment experience |
| Interview Experience Sharing | Early ground-truth loop (confidence-scored) |

**Exit criteria (strategic):**

- Candidates return for practice, not only job browsing
- Structured signals flow from resumes, practice, and early experience reports
- Jobs funnel into practice / prep rather than ending at “open external apply”

**Current repo:** Resume Vault, Jobs, Matches, extraction, matching, **AI Interview Practice** (`/practice`, structured rubrics + confidence-scored assessments), and **Interview Experience Sharing** (`/share`, `/reports` — confidence-scored, probabilistic) are now live Phase 1 surfaces. Next investments: Resume Optimization and deepening the assessment engine (voice, coding, calibration).

---

## Phase 2 — Assessment Calibration

**Purpose:** Prove that Kazana assessments correlate with real hiring success.

Learning inputs:

- interview outcomes
- advancement rates
- offers and rejections
- candidate feedback
- confidence-weighted experience reports

**Exit criteria (strategic):**

- Measurable correlation between practice/assessment scores and real outcomes
- Calibration dashboards (internal) that track assessment quality over time
- Clear versioning of assessment rubrics / models / prompts

---

## Phase 3 — Enterprise Entry

**Primary product:** AI First-Round Screening

**Value proposition:** Not “we have an LLM.”  
**Value proposition:** A **continuously calibrated** assessment engine.

**Exit criteria (strategic):**

- Paying enterprise pilots using Kazana screening
- Outcome labels from enterprise screens feeding the same learning system as B2C

---

## Phase 4 — Workflow Integration

Expand into recruiter workflow so process data becomes signal:

- Interview Copilot
- Interview Notes
- Scorecards
- Recruiter Assistance
- Hiring Analytics

**Exit criteria (strategic):**

- Workflow artifacts stored as structured, confidence-aware data
- Closed loop: enterprise decisions → assessment improvement → better screens

---

## Phase 5 — Hiring Intelligence

Kazana recommends and supports decisions:

- interview improvements
- hiring decisions
- interviewer calibration
- process optimization

At this point Kazana is an **AI decision-support platform** for hiring—not a practice app with jobs bolted on.

---

## Flywheel (every phase)

```
Jobs → Resume Optimization → AI Interview Practice → Real Interview
  → Experience Submission → Assessment Improvement → Better AI Interviews → More Users
```

Phase 3–5 add enterprise edges to the same wheel; they must not fork a separate uncalibrated “AI product.”

---

## Dependency sketch

```
Phase 1 Candidate Platform
        │
        ▼
Phase 2 Calibration  ←── outcome labels from candidates (+ early enterprise if any)
        │
        ▼
Phase 3 Enterprise Screening (monetize calibrated engine)
        │
        ▼
Phase 4 Workflow Integration (more labels + distribution)
        │
        ▼
Phase 5 Hiring Intelligence (decision support)
```

---

## What we defer (on purpose)

| Deferred | Until | Why |
|----------|-------|-----|
| Generic ATS replacement | Never (as identity) | Out of strategy |
| Job board SEO as primary growth | Not the north star | Distracts from assessment moat |
| Opaque “AI magic” without metrics | Never | Violates AI principles |
| Enterprise CRM suite | Phase 4+ only as learning surface | Workflow is means, not identity |

---

## Success metrics (directional)

| Phase | Example metrics |
|-------|-----------------|
| 1 | Practice completion, retention, experience submissions, jobs→practice conversion |
| 2 | Assessment↔outcome correlation, calibration error over time |
| 3 | Enterprise pilot conversion, screen→advance precision/recall |
| 4 | Scorecard adoption, decision latency, label coverage |
| 5 | Recommendation acceptance, interviewer calibration drift reduction |

---

## Related documents

- [vision.md](./vision.md)
- [product.md](./product.md)
- [architecture.md](./architecture.md)
- [decisions.md](./decisions.md)
