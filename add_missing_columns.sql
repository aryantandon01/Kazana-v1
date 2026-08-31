-- Add missing columns to resumes table
-- Run this in your Supabase SQL Editor

-- Add years_of_experience column if it doesn't exist
ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS years_of_experience INTEGER;

-- Add university column if it doesn't exist
ALTER TABLE resumes 
ADD COLUMN IF NOT EXISTS university TEXT;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'resumes' 
AND column_name IN ('years_of_experience', 'university')
ORDER BY column_name;
