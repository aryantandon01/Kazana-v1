-- Add name column to resumes table
-- This allows users to name their resumes (e.g., "Data Engineering Resume", "Backend Resume")
-- If not provided, it will be auto-generated as "Resume 1", "Resume 2", etc.

ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS name TEXT;

-- Optional: Add a comment to document the column
COMMENT ON COLUMN resumes.name IS 'User-defined name for the resume. If not provided, auto-generated as "Resume N" where N is the resume number for that user.';
