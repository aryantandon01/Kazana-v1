-- Migration: Change company field to companies (array)
-- Run this in your Supabase SQL Editor

-- Step 1: Add new companies column as text array
ALTER TABLE resumes 
ADD COLUMN companies TEXT[];

-- Step 2: Migrate existing company data to companies array
-- This converts single company values to an array
UPDATE resumes 
SET companies = ARRAY[company] 
WHERE company IS NOT NULL AND company != '';

-- Step 3: (Optional) Drop the old company column after verifying data
-- Uncomment the line below only after you've verified the migration worked
-- ALTER TABLE resumes DROP COLUMN company;

-- Note: Keep the company column for now to ensure backward compatibility
-- You can drop it later once you're confident everything works

