-- Level + country on interview reports (Share Interview Experience fields).
-- level: company level band of the role interviewed for (L1–L9), mirroring the
--        resume forms (AddResume/EditResume) so the vocabulary stays consistent.
-- country: country where the interview took place (matches countries.name).

ALTER TABLE interview_reports
  ADD COLUMN IF NOT EXISTS level TEXT
    CHECK (level IS NULL OR level IN ('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9')),
  ADD COLUMN IF NOT EXISTS country TEXT;

COMMENT ON COLUMN interview_reports.level IS
  'Company level band of the role interviewed for (L1–L9).';
COMMENT ON COLUMN interview_reports.country IS
  'Country where the interview took place (countries.name).';
