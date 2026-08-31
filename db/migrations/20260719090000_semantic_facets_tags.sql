-- Semantic job classification: Facets (structured) + Tags (semantic)
-- Run after create_jobs_tables.sql and job freshness migration

-- ---------------------------------------------------------------------------
-- Facet catalog (predefined, filterable attributes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facet_type text NOT NULL CHECK (facet_type IN (
    'company',
    'career_area',
    'experience_level',
    'employment_type',
    'work_arrangement',
    'location'
  )),
  facet_value text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facet_type, facet_value)
);

CREATE INDEX IF NOT EXISTS idx_facets_type ON facets (facet_type) WHERE is_active;

-- ---------------------------------------------------------------------------
-- Tag catalog (open-ended semantic descriptors)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name text NOT NULL,
  tag_slug text NOT NULL UNIQUE,
  tag_category text NOT NULL CHECK (tag_category IN (
    'programming_language',
    'framework',
    'cloud',
    'ai',
    'infrastructure',
    'database',
    'soft_skill',
    'domain',
    'tool',
    'other'
  )),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_category ON tags (tag_category);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (tag_name);

-- ---------------------------------------------------------------------------
-- Job ↔ Facet (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_facets (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  facet_id uuid NOT NULL REFERENCES facets(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'classifier' CHECK (source IN ('classifier', 'provider', 'manual')),
  confidence numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, facet_id)
);

CREATE INDEX IF NOT EXISTS idx_job_facets_facet ON job_facets (facet_id);
CREATE INDEX IF NOT EXISTS idx_job_facets_job ON job_facets (job_id);

-- ---------------------------------------------------------------------------
-- Job ↔ Tag (many-to-many with provenance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_tags (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  tag_source text NOT NULL CHECK (tag_source IN ('employer', 'ai', 'community')),
  confidence_score numeric(4,3) NOT NULL DEFAULT 1.000 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, tag_id, tag_source)
);

CREATE INDEX IF NOT EXISTS idx_job_tags_tag ON job_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_job_tags_job ON job_tags (job_id);
CREATE INDEX IF NOT EXISTS idx_job_tags_source ON job_tags (tag_source);

-- ---------------------------------------------------------------------------
-- Seed Career Areas
-- ---------------------------------------------------------------------------
INSERT INTO facets (facet_type, facet_value, label, sort_order) VALUES
  ('career_area', 'ai', 'AI', 10),
  ('career_area', 'machine_learning', 'Machine Learning', 20),
  ('career_area', 'backend', 'Backend', 30),
  ('career_area', 'frontend', 'Frontend', 40),
  ('career_area', 'full_stack', 'Full Stack', 50),
  ('career_area', 'cloud', 'Cloud', 60),
  ('career_area', 'security', 'Security', 70),
  ('career_area', 'devops', 'DevOps', 80),
  ('career_area', 'data', 'Data', 90),
  ('career_area', 'product', 'Product', 100),
  ('career_area', 'design', 'Design', 110),
  ('career_area', 'sales', 'Sales', 120),
  ('career_area', 'marketing', 'Marketing', 130),
  ('career_area', 'finance', 'Finance', 140),
  ('career_area', 'legal', 'Legal', 150),
  ('career_area', 'hr', 'HR', 160),
  ('career_area', 'operations', 'Operations', 170),
  ('career_area', 'it', 'IT', 180),
  ('career_area', 'hardware', 'Hardware', 190),
  ('career_area', 'quantitative', 'Quantitative', 200),
  ('career_area', 'management', 'Engineering Management', 210)
ON CONFLICT (facet_type, facet_value) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed Experience Levels
-- ---------------------------------------------------------------------------
INSERT INTO facets (facet_type, facet_value, label, sort_order) VALUES
  ('experience_level', 'intern', 'Intern', 10),
  ('experience_level', 'new_grad', 'New Grad', 20),
  ('experience_level', 'entry', 'Entry Level', 30),
  ('experience_level', 'mid', 'Mid Level', 40),
  ('experience_level', 'senior', 'Senior', 50),
  ('experience_level', 'staff', 'Staff', 60),
  ('experience_level', 'principal', 'Principal', 70),
  ('experience_level', 'director', 'Director', 80)
ON CONFLICT (facet_type, facet_value) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed Employment Types
-- ---------------------------------------------------------------------------
INSERT INTO facets (facet_type, facet_value, label, sort_order) VALUES
  ('employment_type', 'full_time', 'Full Time', 10),
  ('employment_type', 'internship', 'Internship', 20),
  ('employment_type', 'contract', 'Contract', 30),
  ('employment_type', 'part_time', 'Part Time', 40),
  ('employment_type', 'temporary', 'Temporary', 50)
ON CONFLICT (facet_type, facet_value) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed Work Arrangements
-- ---------------------------------------------------------------------------
INSERT INTO facets (facet_type, facet_value, label, sort_order) VALUES
  ('work_arrangement', 'remote', 'Remote', 10),
  ('work_arrangement', 'hybrid', 'Hybrid', 20),
  ('work_arrangement', 'onsite', 'On-site', 30)
ON CONFLICT (facet_type, facet_value) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Seed common Tags (classifier will upsert more on the fly)
-- ---------------------------------------------------------------------------
INSERT INTO tags (tag_name, tag_slug, tag_category) VALUES
  ('Python', 'python', 'programming_language'),
  ('JavaScript', 'javascript', 'programming_language'),
  ('TypeScript', 'typescript', 'programming_language'),
  ('Go', 'go', 'programming_language'),
  ('Rust', 'rust', 'programming_language'),
  ('Java', 'java', 'programming_language'),
  ('C++', 'cpp', 'programming_language'),
  ('C#', 'csharp', 'programming_language'),
  ('Swift', 'swift', 'programming_language'),
  ('Kotlin', 'kotlin', 'programming_language'),
  ('Ruby', 'ruby', 'programming_language'),
  ('PHP', 'php', 'programming_language'),
  ('Scala', 'scala', 'programming_language'),
  ('R', 'r', 'programming_language'),
  ('SQL', 'sql', 'programming_language'),
  ('React', 'react', 'framework'),
  ('Next.js', 'nextjs', 'framework'),
  ('Vue', 'vue', 'framework'),
  ('Angular', 'angular', 'framework'),
  ('Node.js', 'nodejs', 'framework'),
  ('Django', 'django', 'framework'),
  ('Flask', 'flask', 'framework'),
  ('FastAPI', 'fastapi', 'framework'),
  ('Spring', 'spring', 'framework'),
  ('Rails', 'rails', 'framework'),
  ('.NET', 'dotnet', 'framework'),
  ('GraphQL', 'graphql', 'framework'),
  ('AWS', 'aws', 'cloud'),
  ('Azure', 'azure', 'cloud'),
  ('GCP', 'gcp', 'cloud'),
  ('Snowflake', 'snowflake', 'cloud'),
  ('Databricks', 'databricks', 'cloud'),
  ('Docker', 'docker', 'infrastructure'),
  ('Kubernetes', 'kubernetes', 'infrastructure'),
  ('Terraform', 'terraform', 'infrastructure'),
  ('CI/CD', 'cicd', 'infrastructure'),
  ('Linux', 'linux', 'infrastructure'),
  ('PostgreSQL', 'postgresql', 'database'),
  ('MySQL', 'mysql', 'database'),
  ('MongoDB', 'mongodb', 'database'),
  ('Redis', 'redis', 'database'),
  ('Elasticsearch', 'elasticsearch', 'database'),
  ('Vector Databases', 'vector-databases', 'database'),
  ('TensorFlow', 'tensorflow', 'ai'),
  ('PyTorch', 'pytorch', 'ai'),
  ('CUDA', 'cuda', 'ai'),
  ('LLMs', 'llms', 'ai'),
  ('RAG', 'rag', 'ai'),
  ('LangGraph', 'langgraph', 'ai'),
  ('Agents', 'agents', 'ai'),
  ('NLP', 'nlp', 'ai'),
  ('Computer Vision', 'computer-vision', 'ai'),
  ('Distributed Systems', 'distributed-systems', 'domain'),
  ('Microservices', 'microservices', 'domain'),
  ('Leadership', 'leadership', 'soft_skill'),
  ('Communication', 'communication', 'soft_skill'),
  ('Project Management', 'project-management', 'soft_skill')
ON CONFLICT (tag_slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_facets ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read facets" ON facets;
CREATE POLICY "Public read facets" ON facets FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read tags" ON tags;
CREATE POLICY "Public read tags" ON tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read job_facets" ON job_facets;
CREATE POLICY "Public read job_facets" ON job_facets FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read job_tags" ON job_tags;
CREATE POLICY "Public read job_tags" ON job_tags FOR SELECT USING (true);
