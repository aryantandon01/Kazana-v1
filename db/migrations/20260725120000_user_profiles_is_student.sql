-- Student flag for match eligibility (intern vs entry+ gating)

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_student boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_profiles.is_student IS
  'When true, only intern/new-grad/entry jobs can match. When false, internships never match.';
