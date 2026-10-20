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

**Purpose:** Acquire candidates. Generate candidate value. Collect learning signals. **This phase is the current focus.**

Phase 1 is delivered in three ordered sub-phases. **Resume Optimization (1B) is the current AI priority.** The assessment engine surface and its AI-credits layer are deliberately deferred to Phase 2 — see [ADR-019](./decisions.md#adr-019-defer-assessment--monetization-focus-phase-1-on-the-candidate-platform).

### Phase 1A — Candidate foundation (live)

| Product | Intent | Status |
|---------|--------|--------|
| Resume Vault (`/discover`, Add Resume) | Peer signal + structured candidate data | Live |
| Jobs Dashboard | Acquisition and retention (not the moat) | Live |
| Matches + preferences | Personalization; engagement with jobs | Live |
| Match notifications (push + WhatsApp) | Re-engagement loop back into jobs; opt-in WhatsApp channel | Live |
| Job extraction / matching | Single source of structured job data | Live |
| Interview Experience Sharing (`/share`, `/reports`) | Early ground-truth loop (confidence-scored) | Live |

### Phase 1B — Resume Optimization (current AI priority)

Job-targeted resume rewrites, gap analysis, and readiness scoring that turn a resume into interview-ready, structured signal. **This is where AI investment lands now.**

| Product | Intent | Status |
|---------|--------|--------|
| Resume Optimization (Resume Copilot) | Interview readiness; structured candidate data | In progress |

### Phase 1C — Candidate platform hardening

Deepen 1A/1B quality, retention, and data capture before the assessment engine returns in Phase 2.

**Exit criteria (strategic):**

- Candidates return for prep and job discovery, not only browsing
- Structured signals flow from resumes, optimization, and early experience reports
- Jobs funnel into resume prep rather than ending at “open external apply”

**Current repo:** Resume Vault, Jobs, Matches, match notifications (push + WhatsApp), extraction, matching, and **Interview Experience Sharing** (`/share`, `/reports` — confidence-scored, probabilistic) are live. Resume Optimization is the active build. **AI Interview Practice, the assessment-engine surface, and AI Credits monetization are deferred to Phase 2** — the backend assessment engine (`lib/assessment/`) and credit ledger exist in the repo but are not currently user-facing.

---

## Phase 2 — AI Interview Practice & Assessment Calibration

**Purpose:** Expose the (already-built) assessment engine as the flagship B2C product, and prove that Kazana assessments correlate with real hiring success.

> **Deferred from Phase 1.** The assessment engine (`lib/assessment/`), practice schema, and AI-credits ledger exist in the repo but are not currently user-facing. We return to them once Phase 1 establishes the candidate platform and structured Resume Optimization signal.

Learning inputs:

- practice sessions (rubrics, scores, retries)
- interview outcomes
- advancement rates
- offers and rejections
- candidate feedback
- confidence-weighted experience reports

**Exit criteria (strategic):**

- AI Interview Practice surfaced as the flagship experience
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
Jobs → Resume Optimization → AI Interview Practice (Phase 2) → Real Interview
  → Experience Submission → Assessment Improvement → Better AI Interviews → More Users
```

Phase 1 currently exercises the Jobs → Resume Optimization → Experience Submission arc; AI Interview Practice joins the wheel in Phase 2. Phase 3–5 add enterprise edges to the same wheel; they must not fork a separate uncalibrated “AI product.”

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
| AI Interview Practice surface | Phase 2 | Phase 1 is the candidate platform; Resume Optimization is the current AI priority |
| AI Credits monetization / paid gating | Phase 2 | Built but not user-facing; meter AI only when the assessment surface returns |
| Generic ATS replacement | Never (as identity) | Out of strategy |
| Job board SEO as primary growth | Not the north star | Distracts from assessment moat |
| Opaque “AI magic” without metrics | Never | Violates AI principles |
| Enterprise CRM suite | Phase 4+ only as learning surface | Workflow is means, not identity |

---

## Success metrics (directional)

| Phase | Example metrics |
|-------|-----------------|
| 1 | Resume optimization usage, retention, experience submissions, jobs→prep conversion |
| 2 | Practice completion, assessment↔outcome correlation, calibration error over time |
| 3 | Enterprise pilot conversion, screen→advance precision/recall |
| 4 | Scorecard adoption, decision latency, label coverage |
| 5 | Recommendation acceptance, interviewer calibration drift reduction |

---

## Related documents

- [vision.md](./vision.md)
- [product.md](./product.md)
- [architecture.md](./architecture.md)
- [decisions.md](./decisions.md)
