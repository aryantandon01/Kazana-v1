-- Lock down schema_migrations: internal migrate-runner table only.
-- Service role bypasses RLS; anon/authenticated get no policies → no access.

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- Explicit deny for non-service roles (defense in depth if grants exist)
REVOKE ALL ON TABLE schema_migrations FROM PUBLIC;
REVOKE ALL ON TABLE schema_migrations FROM anon, authenticated;
