-- H-02: audit_logs must be append-only and trusted. No direct table
-- INSERT/UPDATE/DELETE for `authenticated`; the only write path
-- (log_audit_event) always attributes the true caller and a server-derived
-- role, never a client-supplied one.

BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  v_customer uuid := gen_random_uuid();
  v_super_admin uuid := gen_random_uuid();
  v_row_id uuid;
BEGIN
  PERFORM pg_temp.seed_user(v_customer, 'h02-customer@example.test');
  PERFORM pg_temp.seed_user(v_super_admin, 'h02-superadmin@example.test');

  -- 1. Ordinary user cannot forge a fake admin action via direct INSERT.
  PERFORM pg_temp.as_user(v_customer);
  BEGIN
    INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id)
      VALUES (v_customer, 'super_admin', 'role.granted', 'user', v_customer::text);
    PERFORM pg_temp.fail('customer was able to INSERT a forged audit_logs row directly');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('direct INSERT into audit_logs is blocked for authenticated (no grant)');
  END;

  -- 2. Ordinary user cannot update or delete existing rows.
  PERFORM pg_temp.as_service_role();
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id)
    VALUES (v_super_admin, 'super_admin', 'pilot_configuration.updated', 'pilot_configuration', 'seed')
    RETURNING id INTO v_row_id;

  PERFORM pg_temp.as_user(v_customer);
  BEGIN
    UPDATE public.audit_logs SET action = 'tampered' WHERE id = v_row_id;
    PERFORM pg_temp.fail('customer was able to UPDATE an existing audit_logs row');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('audit_logs rows cannot be updated by authenticated');
  END;
  BEGIN
    DELETE FROM public.audit_logs WHERE id = v_row_id;
    PERFORM pg_temp.fail('customer was able to DELETE an existing audit_logs row');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('audit_logs rows cannot be deleted by authenticated');
  END;

  -- 3. log_audit_event() always attributes the real caller, ignoring any
  -- attempt to pretend to be someone else -- there is no actor_id
  -- parameter at all, by construction.
  PERFORM pg_temp.as_user(v_customer);
  PERFORM public.log_audit_event('customer.verification.submitted', 'customer_profile', v_customer::text, NULL);
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE actor_id = v_customer AND actor_role = 'customer' AND action = 'customer.verification.submitted'
  ) THEN
    PERFORM pg_temp.pass('log_audit_event attributes actor_id/actor_role from the real session, not a parameter');
  ELSE
    PERFORM pg_temp.fail('log_audit_event did not write the expected attributed row');
  END IF;

  -- 4. Invalid action shape is rejected (basic validation). The exception
  -- handler's only job is to stop the expected rejection from aborting the
  -- script -- it must never also swallow a FAIL, so the actual assertion
  -- happens in the unguarded IF below, not inside this BEGIN/EXCEPTION block
  -- (a bare "WHEN OTHERS" around a fail() call would swallow the fail()
  -- itself, since it's just another exception, and silently report PASS).
  DECLARE
    v_accepted boolean := false;
  BEGIN
    BEGIN
      PERFORM public.log_audit_event('not a valid action', 'x', NULL, NULL);
      v_accepted := true;
    EXCEPTION WHEN OTHERS THEN
      v_accepted := false;
    END;
    IF v_accepted THEN
      PERFORM pg_temp.fail('log_audit_event accepted a malformed action string');
    ELSE
      PERFORM pg_temp.pass('log_audit_event rejects a malformed action string');
    END IF;
  END;

  -- 5. A real privileged action (super_admin role grant) still produces a
  -- genuine, correctly-attributed audit entry.
  PERFORM pg_temp.as_user(v_super_admin);
  PERFORM public.log_audit_event('role.granted', 'user', v_customer::text, jsonb_build_object('role', 'ops_admin'));
  IF EXISTS (
    SELECT 1 FROM public.audit_logs WHERE actor_id = v_super_admin AND action = 'role.granted' AND entity_id = v_customer::text
  ) THEN
    PERFORM pg_temp.pass('a real privileged action produces a correctly-attributed audit record');
  ELSE
    PERFORM pg_temp.fail('privileged action audit record missing');
  END IF;
END $$;

ROLLBACK;
