-- Found during staging verification (docs/STAGING_DATABASE_VERIFICATION_REPORT.md):
-- the original Stage 1 migration granted only SELECT on pilot_configuration
-- to `authenticated` (20260718061518...sql), while its own RLS policy
-- ("Super admin writes pilot config") is declared FOR ALL and requires
-- has_role(auth.uid(), 'super_admin'). Without INSERT/UPDATE/DELETE at the
-- table-grant level, that policy was unreachable via the client for
-- anyone -- including a genuine super_admin -- since Postgres checks the
-- table-level GRANT before RLS ever evaluates. This is an under-permissive
-- gap (nothing could write pilot_configuration except service_role), not a
-- security regression, but it means the RLS policy's stated intent was
-- never actually reachable. Grant matches what the existing policy already
-- gates; no policy change needed.

GRANT INSERT, UPDATE, DELETE ON public.pilot_configuration TO authenticated;
