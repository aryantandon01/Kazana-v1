-- RLS policies for countries, companies, and universities (lookup tables)
-- Run this in Supabase SQL Editor after enabling RLS on these tables.
-- These policies allow anyone (including anonymous) to READ data for dropdowns.
-- Write operations are not granted; use Supabase dashboard or service role for admin updates.

-- COUNTRIES: allow public read
CREATE POLICY "Allow public read on countries"
  ON countries
  FOR SELECT
  USING (true);

-- COMPANIES: allow public read
CREATE POLICY "Allow public read on companies"
  ON companies
  FOR SELECT
  USING (true);

-- UNIVERSITIES: allow public read
CREATE POLICY "Allow public read on universities"
  ON universities
  FOR SELECT
  USING (true);
