-- C-01: a customer must not be able to set their own verification_status
-- (or reviewed_by/reviewed_at/review_notes), but must still be able to
-- update genuinely self-service columns (saved_suburb, notes). The admin
-- path (service-role write, as reviewCustomerVerification uses) must still
-- work and must still be auditable.

BEGIN;
\ir _helpers.sql

DO $$ DECLARE v_customer uuid := gen_random_uuid(); BEGIN
  PERFORM pg_temp.seed_user(v_customer, 'kyc-customer@example.test');

  -- 1. Customer cannot self-approve.
  PERFORM pg_temp.as_user(v_customer);
  BEGIN
    UPDATE public.customer_profiles SET verification_status = 'approved' WHERE user_id = v_customer;
    PERFORM pg_temp.fail('customer was able to UPDATE verification_status directly');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('customer blocked from self-setting verification_status (insufficient_privilege)');
  END;

  -- 2. Customer cannot clear a rejection / forge reviewer fields.
  BEGIN
    UPDATE public.customer_profiles
      SET verification_status = 'approved', reviewed_by = v_customer, reviewed_at = now(), review_notes = 'self-cleared'
      WHERE user_id = v_customer;
    PERFORM pg_temp.fail('customer was able to forge reviewer fields');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.pass('customer blocked from forging reviewed_by/reviewed_at/review_notes');
  END;

  -- 3. Customer CAN still update self-service fields.
  UPDATE public.customer_profiles SET saved_suburb = 'Rosebank', notes = 'call before 5pm' WHERE user_id = v_customer;
  PERFORM pg_temp.pass('customer can still update saved_suburb/notes directly');

  -- 4. Verify the row is unchanged for the locked fields.
  IF EXISTS (SELECT 1 FROM public.customer_profiles WHERE user_id = v_customer AND verification_status <> 'unverified') THEN
    PERFORM pg_temp.fail('verification_status changed despite blocked UPDATE attempts');
  ELSE
    PERFORM pg_temp.pass('verification_status remained unverified after blocked attempts');
  END IF;

  -- 5. Admin path (service role, mirroring reviewCustomerVerification) still works.
  PERFORM pg_temp.as_service_role();
  UPDATE public.customer_profiles
    SET verification_status = 'approved', reviewed_by = v_customer, reviewed_at = now(), review_notes = 'looks good'
    WHERE user_id = v_customer;
  IF (SELECT verification_status FROM public.customer_profiles WHERE user_id = v_customer) = 'approved' THEN
    PERFORM pg_temp.pass('service-role admin path can still approve a customer');
  ELSE
    PERFORM pg_temp.fail('service-role admin path did not apply the approval');
  END IF;

  -- 6. Trusted audit function attributes the real caller, not a spoofed one.
  -- The write happens as the customer (log_audit_event is SECURITY DEFINER,
  -- so it can insert regardless of the caller's own privileges); the
  -- verification read is done as service_role because audit_logs SELECT is
  -- correctly admin-only (see "Admins read audit logs" policy) -- reading
  -- back as the same non-admin customer would be blocked by that same
  -- control, which is the intended behavior, not a bug to work around.
  PERFORM pg_temp.as_user(v_customer);
  PERFORM public.log_audit_event('customer.verification.submitted', 'customer_profile', v_customer::text, NULL);
  PERFORM pg_temp.as_service_role();
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE entity_id = v_customer::text AND action = 'customer.verification.submitted' AND actor_id = v_customer
  ) THEN
    PERFORM pg_temp.pass('log_audit_event correctly attributes the real authenticated caller');
  ELSE
    PERFORM pg_temp.fail('log_audit_event did not write the expected row');
  END IF;
END $$;

ROLLBACK;
