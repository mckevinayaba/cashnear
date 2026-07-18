-- Founder governance decisions: (1) only super_admin may reinstate a
-- suspended operator, an ops_admin cannot; (2) rejection is terminal --
-- no direct-table or trigger path may move a rejected business anywhere.
-- The actor-eligibility and mandatory-reason rules live in TypeScript
-- (reinstateOperator / isReinstatementActorEligible, covered by
-- executed bun:test coverage) since they need application-level identity
-- context beyond what a single RLS policy expresses; this script proves
-- the database-layer half: rejected is unwritable to any other status via
-- the already-locked-down column grants, and the staff-reactivation
-- trigger restores only the rows it itself deactivated.

BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_staff_a uuid := gen_random_uuid();
  v_staff_b uuid := gen_random_uuid();
  v_business uuid;
BEGIN
  PERFORM pg_temp.seed_user(v_owner, 'reinstate-owner@example.test');
  PERFORM pg_temp.seed_user(v_staff_a, 'reinstate-staff-a@example.test');
  PERFORM pg_temp.seed_user(v_staff_b, 'reinstate-staff-b@example.test');

  PERFORM pg_temp.as_service_role();
  INSERT INTO public.operator_businesses (owner_id, legal_name, trading_name, application_status)
    VALUES (v_owner, 'Reinstate Test Biz', 'RTB', 'approved') RETURNING id INTO v_business;
  INSERT INTO public.operator_staff (business_id, user_id, role, active)
    VALUES (v_business, v_owner, 'operator_owner', true);
  INSERT INTO public.operator_staff (business_id, user_id, role, active)
    VALUES (v_business, v_staff_a, 'operator_manager', true);
  -- staff_b was already inactive for an unrelated reason BEFORE the
  -- suspension below -- reinstatement must not reactivate them.
  INSERT INTO public.operator_staff (business_id, user_id, role, active)
    VALUES (v_business, v_staff_b, 'operator_cashier', false);

  -- Suspend, then reinstate (service role, mirroring reviewOperatorApplication / reinstateOperator).
  PERFORM pg_temp.as_service_role();
  UPDATE public.operator_businesses SET application_status = 'suspended' WHERE id = v_business;

  IF EXISTS (SELECT 1 FROM public.operator_staff WHERE business_id = v_business AND user_id IN (v_owner, v_staff_a) AND active = true) THEN
    PERFORM pg_temp.fail('owner/staff_a were not deactivated by suspension');
  ELSE
    PERFORM pg_temp.pass('owner and staff_a (both active pre-suspension) were deactivated by suspension');
  END IF;

  IF (SELECT deactivated_by_suspension_at FROM public.operator_staff WHERE business_id = v_business AND user_id = v_staff_b) IS NOT NULL THEN
    PERFORM pg_temp.fail('staff_b (already inactive before suspension) was incorrectly marked as deactivated-by-suspension');
  ELSE
    PERFORM pg_temp.pass('staff_b (already inactive before suspension, unrelated reason) is not marked as suspension-caused');
  END IF;

  UPDATE public.operator_businesses SET application_status = 'approved' WHERE id = v_business;

  IF EXISTS (SELECT 1 FROM public.operator_staff WHERE business_id = v_business AND user_id IN (v_owner, v_staff_a) AND active = false) THEN
    PERFORM pg_temp.fail('reinstatement did not restore owner/staff_a, who were deactivated by this suspension');
  ELSE
    PERFORM pg_temp.pass('reinstatement restored owner and staff_a (deactivated by this suspension)');
  END IF;

  IF (SELECT active FROM public.operator_staff WHERE business_id = v_business AND user_id = v_staff_b) = true THEN
    PERFORM pg_temp.fail('reinstatement incorrectly reactivated staff_b, who was inactive for an unrelated reason');
  ELSE
    PERFORM pg_temp.pass('reinstatement correctly left staff_b inactive (not deactivated by this suspension -- explicit-rule requirement)');
  END IF;

  -- Rejection is terminal: no column write can move a rejected business
  -- anywhere, for the same reason C-02 blocks self-approval -- the column
  -- is not grantable to authenticated at all, and the service-role paths
  -- (reviewOperatorApplication / reinstateOperator) refuse the transition
  -- in TypeScript before ever reaching this table.
  UPDATE public.operator_businesses SET application_status = 'rejected' WHERE id = v_business;
  PERFORM pg_temp.as_user(v_owner);
  BEGIN
    UPDATE public.operator_businesses SET application_status = 'submitted' WHERE id = v_business;
    PERFORM pg_temp.fail('owner was able to move a rejected business back to submitted directly');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('rejected business remains unwritable to authenticated regardless of target status (column grant, not just transition logic)');
  END;
END $$;

ROLLBACK;
