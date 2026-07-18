-- C-04: suspending a business must immediately cut staff access
-- (trg_operator_businesses_status_sync) and block the owner's remaining
-- operational write (document upload/delete), while the owner can still
-- read their own status. Reinstatement (suspended -> approved) restores it.

BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_business uuid;
BEGIN
  PERFORM pg_temp.seed_user(v_owner, 'suspend-owner@example.test');
  PERFORM pg_temp.seed_user(v_staff, 'suspend-staff@example.test');

  PERFORM pg_temp.as_service_role();
  INSERT INTO public.operator_businesses (owner_id, legal_name, trading_name, application_status)
    VALUES (v_owner, 'Suspend Test Biz', 'STB', 'approved') RETURNING id INTO v_business;
  INSERT INTO public.operator_staff (business_id, user_id, role, active)
    VALUES (v_business, v_owner, 'operator_owner', true);
  INSERT INTO public.operator_staff (business_id, user_id, role, active)
    VALUES (v_business, v_staff, 'operator_manager', true);

  -- Sanity: staff can see the business while approved and active.
  PERFORM pg_temp.as_user(v_staff);
  IF EXISTS (SELECT 1 FROM public.operator_businesses WHERE id = v_business) THEN
    PERFORM pg_temp.pass('staff can read the business while approved and active');
  ELSE
    PERFORM pg_temp.fail('staff could not read the business before suspension (test fixture problem)');
  END IF;

  -- Suspend as service role (mirrors reviewOperatorApplication).
  PERFORM pg_temp.as_service_role();
  UPDATE public.operator_businesses SET application_status = 'suspended' WHERE id = v_business;

  -- Trigger effect: operator_staff.active flipped to false for this business.
  IF EXISTS (SELECT 1 FROM public.operator_staff WHERE business_id = v_business AND active = true) THEN
    PERFORM pg_temp.fail('operator_staff rows were not deactivated by the suspension trigger');
  ELSE
    PERFORM pg_temp.pass('suspension trigger deactivated all operator_staff rows for the business');
  END IF;

  -- Staff (non-owner) immediately loses read access.
  PERFORM pg_temp.as_user(v_staff);
  IF EXISTS (SELECT 1 FROM public.operator_businesses WHERE id = v_business) THEN
    PERFORM pg_temp.fail('suspended-business staff can still read the business');
  ELSE
    PERFORM pg_temp.pass('suspended-business staff can no longer read the business (is_business_member gated on active)');
  END IF;

  -- Owner still sees their own business (status visibility preserved)...
  PERFORM pg_temp.as_user(v_owner);
  IF EXISTS (SELECT 1 FROM public.operator_businesses WHERE id = v_business AND application_status = 'suspended') THEN
    PERFORM pg_temp.pass('suspended owner can still read their own business to see the suspended status');
  ELSE
    PERFORM pg_temp.fail('suspended owner lost read access entirely (unintended -- should still see status)');
  END IF;

  -- ...but cannot upload a document while suspended (operational action blocked).
  BEGIN
    INSERT INTO public.operator_documents (business_id, uploaded_by, doc_type, storage_path)
      VALUES (v_business, v_owner, 'other', v_business::text || '/other/test.pdf');
    PERFORM pg_temp.fail('suspended owner was able to upload a document');
  EXCEPTION WHEN insufficient_privilege OR others THEN
    -- RLS violations on INSERT surface as a policy-check failure, not
    -- necessarily insufficient_privilege; either way, zero rows must exist.
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.operator_documents WHERE business_id = v_business) THEN
    PERFORM pg_temp.fail('a document row was inserted despite the business being suspended');
  ELSE
    PERFORM pg_temp.pass('suspended owner is blocked from uploading documents (RLS status gate)');
  END IF;

  -- Reinstatement (admin-only, suspended -> approved) restores staff access.
  PERFORM pg_temp.as_service_role();
  UPDATE public.operator_businesses SET application_status = 'approved' WHERE id = v_business;

  IF EXISTS (SELECT 1 FROM public.operator_staff WHERE business_id = v_business AND active = false) THEN
    PERFORM pg_temp.fail('reinstatement did not reactivate operator_staff rows');
  ELSE
    PERFORM pg_temp.pass('reinstatement (suspended -> approved) reactivated operator_staff rows');
  END IF;

  PERFORM pg_temp.as_user(v_staff);
  IF EXISTS (SELECT 1 FROM public.operator_businesses WHERE id = v_business) THEN
    PERFORM pg_temp.pass('reinstated staff can read the business again');
  ELSE
    PERFORM pg_temp.fail('reinstated staff still cannot read the business');
  END IF;
END $$;

ROLLBACK;
