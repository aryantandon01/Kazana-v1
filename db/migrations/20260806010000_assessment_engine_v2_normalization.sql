-- Assessment Engine v2 — normalized competency scoring (ADR-016)
-- Replaces JSONB-buried dimension scoring with relational tables.
-- Applied AFTER 20260805010000_ai_interview_practice_reports.sql.

--- 1. Canonical competency dimensions ----------------------------------------

CREATE TABLE IF NOT EXISTS dimensions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dimensions IS
  'Canonical competency dimensions shared across all rubrics. The dimension score is the primary assessment asset.';

--- 2. Rubric ↔ dimension junction (replaces practice_rubrics.dimensions JSONB)

CREATE TABLE IF NOT EXISTS rubric_dimensions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rubric_id UUID NOT NULL REFERENCES practice_rubrics(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  weight NUMERIC(5,3) NOT NULL DEFAULT 0.1 CHECK (weight >= 0 AND weight <= 1),
  focus TEXT,
  positive_indicators TEXT[] NOT NULL DEFAULT '{}',
  negative_indicators TEXT[] NOT NULL DEFAULT '{}',
  evaluation_guidance TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rubric_id, dimension_id)
);

COMMENT ON TABLE rubric_dimensions IS
  'Dimension definitions per rubric — weight, focus, and evaluation guidance. Replaces the JSONB dimensions array on practice_rubrics.';

--- 3. Per-question evaluations (split from practice_questions.evaluation JSONB)

CREATE TABLE IF NOT EXISTS practice_question_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES practice_questions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  model TEXT,
  prompt_version TEXT NOT NULL DEFAULT 'evaluate-response-v2',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
  overall_confidence NUMERIC(5,2) NOT NULL DEFAULT 0.5 CHECK (overall_confidence >= 0 AND overall_confidence <= 1),
  evaluation_summary TEXT,
  strengths TEXT[] NOT NULL DEFAULT '{}',
  weaknesses TEXT[] NOT NULL DEFAULT '{}',
  suggested_answer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qevaluation_question ON practice_question_evaluations (question_id);
CREATE INDEX IF NOT EXISTS idx_qevaluation_created ON practice_question_evaluations (created_at DESC);

COMMENT ON TABLE practice_question_evaluations IS
  'One evaluation per answered question. Provider/model/prompt_version recorded for reproducibility.';

--- 4. Per-dimension scores per evaluation (the PRIMARY ASSET) ----------------

CREATE TABLE IF NOT EXISTS practice_dimension_scores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id UUID NOT NULL REFERENCES practice_question_evaluations(id) ON DELETE CASCADE,
  dimension_id UUID NOT NULL REFERENCES dimensions(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 1),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (evaluation_id, dimension_id)
);

CREATE INDEX IF NOT EXISTS idx_dimscore_dimension ON practice_dimension_scores (dimension_id);
CREATE INDEX IF NOT EXISTS idx_dimscore_evaluation ON practice_dimension_scores (evaluation_id);

COMMENT ON TABLE practice_dimension_scores IS
  'One row per competency per question evaluation. This table powers competency vectors, trend analytics, and future calibration.';

--- 5. Assessment events — complete historical timeline -----------------------

CREATE TABLE IF NOT EXISTS assessment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES practice_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_user_time ON assessment_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON assessment_events (session_id, created_at);

COMMENT ON TABLE assessment_events IS
  'Everything becomes an event: question answered, dimension evaluated, interview completed, report submitted, calibration completed. Enables complete historical timelines.';

--- 6. Configurable confidence rules (replace hardcoded constants) ------------

CREATE TABLE IF NOT EXISTS confidence_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  rule_name TEXT NOT NULL,
  weight NUMERIC(5,3) NOT NULL DEFAULT 0,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE confidence_rules IS
  'Configurable confidence weights for interview-report scoring. Rules can be added/disabled without code changes.';

--- 7. Column additions (all nullable - no existing-row breakage) ------------

ALTER TABLE practice_rubrics
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES practice_rubrics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS evaluation_guidance TEXT;

ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS rubric_version INTEGER,
  ADD COLUMN IF NOT EXISTS temperature NUMERIC(3,2) NOT NULL DEFAULT 0;

ALTER TABLE practice_questions
  ADD COLUMN IF NOT EXISTS difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS competency_dimensions UUID[],
  ADD COLUMN IF NOT EXISTS concepts_tested TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estimated_duration INTEGER,
  ADD COLUMN IF NOT EXISTS generated_vs_curated TEXT NOT NULL DEFAULT 'generated'
    CHECK (generated_vs_curated IN ('generated', 'curated'));

--- 8. RLS --------------------------------------------------------------------

ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_question_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_dimension_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE confidence_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read dimensions" ON dimensions FOR SELECT USING (true);
CREATE POLICY "public read rubric dimensions" ON rubric_dimensions FOR SELECT USING (true);

CREATE POLICY "owner read evaluations" ON practice_question_evaluations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM practice_questions pq
      JOIN practice_sessions ps ON ps.id = pq.session_id
      WHERE pq.id = question_id AND ps.user_id = auth.uid()
    )
  );

CREATE POLICY "owner insert evaluations" ON practice_question_evaluations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_questions pq
      JOIN practice_sessions ps ON ps.id = pq.session_id
      WHERE pq.id = question_id AND ps.user_id = auth.uid()
    )
  );

CREATE POLICY "owner read dimension scores" ON practice_dimension_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM practice_question_evaluations pqe
      JOIN practice_questions pq ON pq.id = pqe.question_id
      JOIN practice_sessions ps ON ps.id = pq.session_id
      WHERE pqe.id = evaluation_id AND ps.user_id = auth.uid()
    )
  );

CREATE POLICY "owner insert dimension scores" ON practice_dimension_scores
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_question_evaluations pqe
      JOIN practice_questions pq ON pq.id = pqe.question_id
      JOIN practice_sessions ps ON ps.id = pq.session_id
      WHERE pqe.id = evaluation_id AND ps.user_id = auth.uid()
    )
  );

CREATE POLICY "owner insert events" ON assessment_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner read events" ON assessment_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "public read confidence rules" ON confidence_rules FOR SELECT USING (true);

--- 9. Seed canonical dimensions (deduped slugs from v1 rubric JSONB) ---------

INSERT INTO dimensions (slug, label, description) VALUES
  ('problem_solving', 'Problem Solving', 'Approach, structure, and clarity of reasoning when faced with a problem.'),
  ('technical_depth', 'Technical Depth', 'Understanding of CS fundamentals, data structures, algorithms, and the relevant stack.'),
  ('communication', 'Communication', 'Clear articulation, asking clarifying questions, and sharing reasoning out loud.'),
  ('code_quality', 'Code Quality', 'Correctness, edge cases, readability, and best practices in code.'),
  ('experience_fit', 'Experience Fit', 'Alignment of past experience with the role and level.'),
  ('company_fit', 'Company / Culture Fit', 'Alignment with company values, ownership, and collaboration.'),
  ('ml_fundamentals', 'ML Fundamentals', 'Model families, training/validation, metrics, and bias-variance.'),
  ('engineering', 'Engineering Depth', 'Production systems, data pipelines, and software quality.'),
  ('product_sense', 'Product Sense', 'User empathy, problem framing, and prioritization.'),
  ('execution', 'Execution', 'Roadmap planning, stakeholder management, and delivery.'),
  ('analytics', 'Analytics & Metrics', 'Defining and using metrics to drive decisions.'),
  ('leadership', 'Leadership & Influence', 'Cross-functional influence and decision making.'),
  ('statistical_thinking', 'Statistical Thinking', 'Experiment design, inference, and probability.'),
  ('data_analysis', 'Data Analysis', 'Exploratory analysis, hypothesis testing, and storytelling with data.'),
  ('modeling', 'Modeling', 'Model selection, evaluation, and pitfalls.'),
  ('domain_knowledge', 'Domain Knowledge', 'Depth and breadth of relevant expertise.')
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label;

--- 10. Migrate existing rubric dimensions JSONB to rubric_dimensions ---------

INSERT INTO rubric_dimensions (rubric_id, dimension_id, weight, focus, positive_indicators, negative_indicators)
SELECT
  r.id,
  d.id,
  (dim.value ->> 'weight')::NUMERIC(5,3),
  dim.value ->> 'focus',
  '{}',
  '{}'
FROM practice_rubrics r
CROSS JOIN LATERAL jsonb_array_elements(r.dimensions) AS dim
JOIN dimensions d ON d.slug = COALESCE(dim.value ->> 'key', '')
ON CONFLICT (rubric_id, dimension_id) DO NOTHING;

--- 11. Seed confidence rules (mirrors previous hardcoded constants) ----------

INSERT INTO confidence_rules (slug, rule_name, weight, description) VALUES
  ('base_confidence', 'Base Confidence', 0.40, 'Starting confidence for an unverified single report.'),
  ('email_evidence', 'Email Evidence', 0.15, 'Bonus when hashed email evidence is provided.'),
  ('corroboration_per_report', 'Corroborating Reports', 0.10, 'Bonus per corroborating report (same company+role+stage).'),
  ('corroboration_cap', 'Corroboration Cap', 0.25, 'Maximum total corroboration bonus.'),
  ('contributor_reputation', 'Contributor Reputation', 0.05, 'Bonus for contributors with 5+ prior published reports.'),
  ('timeline_consistency', 'Timeline Consistency', 0.05, 'Bonus when report submitted within 14 days of the interview.'),
  ('detail_bonus', 'Detailed Report', 0.05, 'Bonus for reports with 3+ questions and 500+ chars of text.'),
  ('max_confidence', 'Maximum Confidence', 0.95, 'Absolute cap for any report confidence score.')
ON CONFLICT (slug) DO NOTHING;
