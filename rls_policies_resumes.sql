-- RLS policies for the resumes table
-- Run this in Supabase SQL Editor ONLY IF you have enabled RLS on the resumes table.
-- Without these, the Discover page will show no rows and login may affect what you can do.

-- Allow anyone (including anonymous) to read all resumes for the Discover page
CREATE POLICY "Allow public read on resumes"
  ON resumes
  FOR SELECT
  USING (true);

-- Allow signed-in users to insert their own resume
CREATE POLICY "Users can insert own resume"
  ON resumes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update only their own resumes
CREATE POLICY "Users can update own resume"
  ON resumes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete only their own resumes
CREATE POLICY "Users can delete own resume"
  ON resumes
  FOR DELETE
  USING (auth.uid() = user_id);
