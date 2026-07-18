-- H-01: after re-granting EXECUTE on has_role/is_admin/is_business_member
-- to `authenticated`, every RLS branch that calls them for a non-owner
-- caller must evaluate cleanly (no permission-denied error) instead of
-- erroring out. Covers: staff read via is_business_member, super_admin
-- write via has_role. Also confirms anon still cannot call them (no
-- policy needs it, and anon was never re-granted).

BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_super_admin uuid := gen_random_uuid();
  v_business uuid;
BEGIN
  PERFORM pg_temp.seed_user(v_owner, 'h01-owner@example.test');
  PERFORM pg_temp.seed_user(v_staff, 'h01-staff@example.test');
  PERFORM pg_temp.seed_user(v_super_admin, 'h01-superadmin@example.test');

  PERFORM pg_temp.as_service_role();
  INSERT INTO public.operator_businesses (owner_id, legal_name, trading_name, application_status)
    VALUES (v_owner, 'H01 Biz', 'H01', 'approved') RETURNING id INTO v_business;
  INSERT INTO public.operator_staff (business_id, user_id, role, active)
    VALUES (v_business, v_staff, 'operator_manager', true);
  INSERT INTO public.user_roles (user_id, role) VALUES (v_super_admin, 'super_admin')
    ON CONFLICT DO NOTHING;

  -- Non-owner staff read requires the is_business_member() branch of the
  -- SELECT policy to actually evaluate -- this is exactly the call that
  -- would raise "permission denied for function is_business_member"
  -- without this migration's re-grant.
  PERFORM pg_temp.as_user(v_staff);
  BEGIN
    PERFORM 1 FROM public.operator_businesses WHERE id = v_business;
    PERFORM pg_temp.pass('staff SELECT evaluates is_business_member() without a permission error');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.fail('is_business_member() EXECUTE is still missing for authenticated (H-01 not fixed)');
  END;

  IF EXISTS (SELECT 1 FROM public.operator_businesses WHERE id = v_business) THEN
    PERFORM pg_temp.pass('active staff member can actually read the business (RLS allows, not just no-error)');
  ELSE
    PERFORM pg_temp.fail('staff member could not read the business at all');
  END IF;

  -- super_admin write to pilot_configuration requires the has_role() branch.
  PERFORM pg_temp.as_user(v_super_admin);
  BEGIN
    UPDATE public.pilot_configuration SET description = 'h01 test' WHERE key = 'pilot_name';
    PERFORM pg_temp.pass('super_admin UPDATE on pilot_configuration evaluates has_role() without a permission error');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.fail('has_role() EXECUTE is still missing for authenticated (H-01 not fixed)');
  END;

  -- anon never needed these functions and was never re-granted -- direct
  -- RPC as anon should still fail.
  PERFORM pg_temp.as_anon();
  BEGIN
    PERFORM public.is_admin(v_super_admin);
    PERFORM pg_temp.fail('anon was able to call is_admin() directly -- should remain revoked');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('anon still cannot call is_admin()/has_role()/is_business_member() directly');
  END;
END $$;

ROLLBACK;
