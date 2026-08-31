-- AI Interview Practice + Interview Experience Sharing (Phase 1 completion)

-- ---------------------------------------------------------------------------
-- Practice rubrics — structured assessment dimensions per career area
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS practice_rubrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  career_area TEXT NOT NULL,
  description TEXT,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  prompt_version TEXT NOT NULL DEFAULT 'rubric-v1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE practice_rubrics IS
  'Structured rubrics (dimensions + weights) that an AI interview evaluates against. Dimension weights sum to 1.';

-- ---------------------------------------------------------------------------
-- Practice sessions — one interview attempt
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS practice_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role_key TEXT NOT NULL,
  role_label TEXT NOT NULL,
  level TEXT NOT NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  rubric_id UUID REFERENCES practice_rubrics(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  question_count INTEGER NOT NULL DEFAULT 0,
  current_index INTEGER NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2),
  dimension_scores JSONB,
  strengths JSONB,
  gaps JSONB,
  recommendations JSONB,
  confidence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user ON practice_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_job ON practice_sessions (job_id);

COMMENT ON TABLE practice_sessions IS
  'One AI-conducted interview attempt. Overall assessment is confidence-scored and explainable.';

-- ---------------------------------------------------------------------------
-- Practice questions — per-session questions with per-response evaluation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS practice_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('behavioral', 'technical', 'system_design', 'situational', 'coding')),
  question TEXT NOT NULL,
  context_note TEXT,
  user_response TEXT,
  evaluation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_practice_questions_session ON practice_questions (session_id, order_index);

COMMENT ON TABLE practice_questions IS
  'Questions within a session. Each carries its own confidence-scored evaluation. Null user_response = skipped.';

-- ---------------------------------------------------------------------------
-- Interview reports — candidate-submitted real interview experiences
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS interview_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role_key TEXT,
  role_label TEXT NOT NULL,
  stage TEXT NOT NULL
    CHECK (stage IN ('phone_screen', 'technical', 'system_design', 'behavioral', 'onsite', 'final')),
  questions_asked TEXT[] NOT NULL DEFAULT '{}',
  topics TEXT[] NOT NULL DEFAULT '{}',
  difficulty INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  outcome TEXT CHECK (outcome IN ('offer', 'advance', 'reject', 'no_response')),
  interview_date DATE,
  report_text TEXT,
  email_evidence_hashed TEXT,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  confidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reports_company ON interview_reports (company, role_key, stage);
CREATE INDEX IF NOT EXISTS idx_reports_user ON interview_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_confidence ON interview_reports ((confidence ->> 'score'));
CREATE INDEX IF NOT EXISTS idx_reports_created ON interview_reports (created_at DESC);

COMMENT ON TABLE interview_reports IS
  'Candidate-submitted interview experiences. NEVER treated as verified — every report carries a confidence score that rises with corroboration, evidence, and contributor reputation.';

-- RLS: practice sessions + questions are owner-only; reports are public-read, owner-write
ALTER TABLE practice_rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_reports ENABLE ROW LEVEL SECURITY;

-- Rubrics: public read (needed to generate sessions)
CREATE POLICY "public read practice rubrics" ON practice_rubrics
  FOR SELECT USING (true);

-- Sessions: owner-only full access
CREATE POLICY "owner all sessions" ON practice_sessions
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Questions: owner-only via session
CREATE POLICY "owner all questions" ON practice_questions
  USING (
    EXISTS (
      SELECT 1 FROM practice_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM practice_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

-- Reports: anyone can read published; owner can insert/update/delete own
CREATE POLICY "public read published reports" ON interview_reports
  FOR SELECT USING (status = 'published');

CREATE POLICY "owner insert reports" ON interview_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner update own reports" ON interview_reports
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner delete own reports" ON interview_reports
  FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed default rubrics for core career areas
-- ---------------------------------------------------------------------------

INSERT INTO practice_rubrics (slug, name, career_area, description, dimensions, version, prompt_version)
VALUES
  (
    'rubric-software-engineer',
    'Software Engineer Interview Rubric',
    'software_engineer',
    'Core dimensions evaluated for software engineering interviews.',
    '[
      {"key": "problem_solving", "label": "Problem Solving", "weight": 0.25, "focus": "Approach, structure, and clarity of reasoning"},
      {"key": "technical_depth", "label": "Technical Depth", "weight": 0.25, "focus": "Understanding of CS fundamentals, data structures, algorithms, and relevant stack"},
      {"key": "communication", "label": "Communication", "weight": 0.15, "focus": "Clear articulation, asking clarifying questions, sharing reasoning out loud"},
      {"key": "code_quality", "label": "Code Quality", "weight": 0.15, "focus": "Correctness, edge cases, readability, and best practices"},
      {"key": "experience_fit", "label": "Experience Fit", "weight": 0.10, "focus": "Alignment of past experience with the role and level"},
      {"key": "company_fit", "label": "Company / Culture Fit", "weight": 0.10, "focus": "Alignment with company values, ownership, and collaboration"}
    ]'::jsonb,
    1,
    'rubric-v1'
  ),
  (
    'rubric-machine-learning-engineer',
    'Machine Learning Engineer Interview Rubric',
    'machine_learning_engineer',
    'Core dimensions for ML engineering interviews.',
    '[
      {"key": "ml_fundamentals", "label": "ML Fundamentals", "weight": 0.25, "focus": "Model families, training/validation, metrics, and bias-variance"},
      {"key": "problem_solving", "label": "Problem Solving", "weight": 0.20, "focus": "Framing problems, data handling, and evaluation design"},
      {"key": "engineering", "label": "Engineering Depth", "weight": 0.20, "focus": "Production systems, data pipelines, and software quality"},
      {"key": "communication", "label": "Communication", "weight": 0.15, "focus": "Clear articulation of trade-offs and reasoning"},
      {"key": "experience_fit", "label": "Experience Fit", "weight": 0.10, "focus": "Alignment of past ML work with the role"},
      {"key": "company_fit", "label": "Company / Culture Fit", "weight": 0.10, "focus": "Alignment with company values and collaboration"}
    ]'::jsonb,
    1,
    'rubric-v1'
  ),
  (
    'rubric-product-manager',
    'Product Manager Interview Rubric',
    'product_manager',
    'Core dimensions for product management interviews.',
    '[
      {"key": "product_sense", "label": "Product Sense", "weight": 0.30, "focus": "User empathy, problem framing, and prioritization"},
      {"key": "execution", "label": "Execution", "weight": 0.20, "focus": "Roadmap planning, stakeholder management, and delivery"},
      {"key": "analytics", "label": "Analytics & Metrics", "weight": 0.15, "focus": "Defining and using metrics to drive decisions"},
      {"key": "communication", "label": "Communication", "weight": 0.15, "focus": "Clear, structured, persuasive articulation"},
      {"key": "leadership", "label": "Leadership & Influence", "weight": 0.10, "focus": "Cross-functional influence and decision making"},
      {"key": "company_fit", "label": "Company / Culture Fit", "weight": 0.10, "focus": "Alignment with company values and mission"}
    ]'::jsonb,
    1,
    'rubric-v1'
  ),
  (
    'rubric-data-scientist',
    'Data Scientist Interview Rubric',
    'data_scientist',
    'Core dimensions for data science interviews.',
    '[
      {"key": "statistical_thinking", "label": "Statistical Thinking", "weight": 0.25, "focus": "Experiment design, inference, and probability"},
      {"key": "data_analysis", "label": "Data Analysis", "weight": 0.20, "focus": "Exploratory analysis, hypothesis testing, and storytelling with data"},
      {"key": "modeling", "label": "Modeling", "weight": 0.20, "focus": "Model selection, evaluation, and pitfalls"},
      {"key": "communication", "label": "Communication", "weight": 0.15, "focus": "Clear articulation of methods, trade-offs, and results"},
      {"key": "experience_fit", "label": "Experience Fit", "weight": 0.10, "focus": "Alignment of past analytical work with the role"},
      {"key": "company_fit", "label": "Company / Culture Fit", "weight": 0.10, "focus": "Alignment with company values and collaboration"}
    ]'::jsonb,
    1,
    'rubric-v1'
  ),
  (
    'rubric-generic',
    'General Interview Rubric',
    'general',
    'Fallback rubric for roles without a dedicated rubric.',
    '[
      {"key": "domain_knowledge", "label": "Domain Knowledge", "weight": 0.25, "focus": "Depth and breadth of relevant expertise"},
      {"key": "problem_solving", "label": "Problem Solving", "weight": 0.25, "focus": "Approach, structure, and clarity of reasoning"},
      {"key": "communication", "label": "Communication", "weight": 0.20, "focus": "Clear articulation and structured thinking"},
      {"key": "experience_fit", "label": "Experience Fit", "weight": 0.15, "focus": "Alignment of past experience with the role and level"},
      {"key": "company_fit", "label": "Company / Culture Fit", "weight": 0.15, "focus": "Alignment with company values and collaboration"}
    ]'::jsonb,
    1,
    'rubric-v1'
  )
ON CONFLICT (slug) DO NOTHING;