-- Shared fixtures and role-impersonation helpers for the SQL test scripts
-- in this directory. Not executed as a standalone file -- `\ir` it from
-- each test script (see run_all.sql).

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  SET LOCAL ROLE authenticated;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.as_service_role() RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  SET LOCAL ROLE service_role;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.fail(p_message text) RETURNS void AS $$
BEGIN
  RAISE EXCEPTION 'FAIL - %', p_message;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.pass(p_message text) RETURNS void AS $$
BEGIN
  RAISE NOTICE 'PASS - %', p_message;
END;
$$ LANGUAGE plpgsql;

-- Minimal auth.users fixture rows. Real signup goes through GoTrue, which
-- populates many more columns, but RLS/FK purposes only need id/email/role
-- to be present and consistent.
CREATE OR REPLACE FUNCTION pg_temp.seed_user(p_id uuid, p_email text) RETURNS void AS $$
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, crypt('test-password-not-real', gen_salt('bf')),
    now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;
