-- Resume Copilot v1 — AI Resume Optimization Engine (ADR-017)
-- Structured resume representation is the source of truth; original PDF preserved.
-- Applied AFTER all prior migrations.

-- ---------------------------------------------------------------------------
-- resumes: add parsed_status + current_version_number (nullable, backward safe)
-- ---------------------------------------------------------------------------

ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS parsed_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (parsed_status IN ('pending', 'parsing', 'ready', 'error')),
  ADD COLUMN IF NOT EXISTS current_version_number INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- resume_versions — snapshot history of structured resume data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resume_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  parsed_data JSONB NOT NULL,
  change_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resume_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_resume_versions_resume ON resume_versions (resume_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_resume_versions_user ON resume_versions (user_id, created_at DESC);

COMMENT ON TABLE resume_versions IS
  'Snapshot history of structured resume data. Original uploaded PDF is never modified.';

-- ---------------------------------------------------------------------------
-- resume_parsed_data — canonical structured resume JSON (source of truth)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resume_parsed_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resume_id UUID NOT NULL UNIQUE REFERENCES resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID REFERENCES resume_versions(id) ON DELETE SET NULL,
  parsed_json JSONB NOT NULL,
  parser_version TEXT NOT NULL DEFAULT 'resume-parse-v1',
  parser_confidence NUMERIC(5,2),
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_parsed_user ON resume_parsed_data (user_id);

COMMENT ON TABLE resume_parsed_data IS
  'The canonical structured representation of the resume. AI operates on this, never on raw PDF text.';

-- ---------------------------------------------------------------------------
-- resume_optimization_sessions — one chat session per resume
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resume_optimization_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_optimization_sessions_resume ON resume_optimization_sessions (resume_id, created_at);
CREATE INDEX IF NOT EXISTS idx_optimization_sessions_user ON resume_optimization_sessions (user_id, created_at DESC);

--- updated_at trigger
DROP TRIGGER IF EXISTS resume_optimization_sessions_updated_at ON resume_optimization_sessions;
CREATE TRIGGER resume_optimization_sessions_updated_at
  BEFORE UPDATE ON resume_optimization_sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- resume_suggestions — diff-based, explainable suggestions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS resume_suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES resume_optimization_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_path TEXT NOT NULL,
  current_text TEXT,
  suggested_text TEXT,
  rationale TEXT,
  estimated_impact JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'edited')),
  edited_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_suggestions_session ON resume_suggestions (session_id);
CREATE INDEX IF NOT EXISTS idx_resume_suggestions_status ON resume_suggestions (status);

--- updated_at trigger
DROP TRIGGER IF EXISTS resume_suggestions_updated_at ON resume_suggestions;
CREATE TRIGGER resume_suggestions_updated_at
  BEFORE UPDATE ON resume_suggestions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- generated_resume_exports — PDF exports from structured data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS generated_resume_exports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version_id UUID REFERENCES resume_versions(id) ON DELETE SET NULL,
  template TEXT NOT NULL DEFAULT 'clean',
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_exports_resume ON generated_resume_exports (resume_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — owner-only
-- ---------------------------------------------------------------------------

ALTER TABLE resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_parsed_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_optimization_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_resume_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner all versions" ON resume_versions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all parsed data" ON resume_parsed_data
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all optimization sessions" ON resume_optimization_sessions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all suggestions" ON resume_suggestions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all exports" ON generated_resume_exports
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);