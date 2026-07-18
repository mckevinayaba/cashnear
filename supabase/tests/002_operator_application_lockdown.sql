-- C-02: an operator must not be able to set their own application_status
-- (or reviewed_by/reviewed_at/review_notes) on their own business, must
-- still be able to edit ordinary business content, and must not be able to
-- touch another operator's business at all.

BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  v_owner_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_business_a uuid;
  v_business_b uuid;
BEGIN
  PERFORM pg_temp.seed_user(v_owner_a, 'owner-a@example.test');
  PERFORM pg_temp.seed_user(v_owner_b, 'owner-b@example.test');

  PERFORM pg_temp.as_service_role();
  INSERT INTO public.operator_businesses (owner_id, legal_name, trading_name, application_status)
    VALUES (v_owner_a, 'Owner A Spaza', 'A Spaza', 'draft') RETURNING id INTO v_business_a;
  INSERT INTO public.operator_businesses (owner_id, legal_name, trading_name, application_status)
    VALUES (v_owner_b, 'Owner B Spaza', 'B Spaza', 'draft') RETURNING id INTO v_business_b;

  -- 1. Owner A cannot self-approve their own business.
  PERFORM pg_temp.as_user(v_owner_a);
  BEGIN
    UPDATE public.operator_businesses SET application_status = 'approved' WHERE id = v_business_a;
    PERFORM pg_temp.fail('owner was able to UPDATE application_status directly');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('owner blocked from self-setting application_status (insufficient_privilege)');
  END;

  -- 2. Owner A cannot forge reviewer fields.
  BEGIN
    UPDATE public.operator_businesses SET reviewed_by = v_owner_a, reviewed_at = now(), review_notes = 'self-reviewed' WHERE id = v_business_a;
    PERFORM pg_temp.fail('owner was able to forge reviewer fields');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('owner blocked from forging reviewed_by/reviewed_at/review_notes');
  END;

  -- 3. Owner A CAN still edit ordinary business content.
  UPDATE public.operator_businesses SET description = 'Updated description', suburb = 'Soweto' WHERE id = v_business_a;
  PERFORM pg_temp.pass('owner can still edit business content fields directly');

  -- 4. Owner A cannot touch Owner B's business at all (RLS ownership, independent of the column grant).
  UPDATE public.operator_businesses SET description = 'hijacked' WHERE id = v_business_b;
  IF (SELECT description FROM public.operator_businesses WHERE id = v_business_b) IS DISTINCT FROM 'hijacked' THEN
    PERFORM pg_temp.pass('owner A cannot modify owner B''s business (RLS ownership check holds)');
  ELSE
    PERFORM pg_temp.fail('owner A was able to modify owner B''s business');
  END IF;

  -- 5. Admin path (service role, mirroring reviewOperatorApplication) still works.
  PERFORM pg_temp.as_service_role();
  UPDATE public.operator_businesses
    SET application_status = 'approved', reviewed_by = v_owner_a, reviewed_at = now()
    WHERE id = v_business_a;
  IF (SELECT application_status FROM public.operator_businesses WHERE id = v_business_a) = 'approved' THEN
    PERFORM pg_temp.pass('service-role admin path can still approve an operator business');
  ELSE
    PERFORM pg_temp.fail('service-role admin path did not apply the approval');
  END IF;
END $$;

ROLLBACK;
