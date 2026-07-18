-- C-01 remediation: customers could self-approve their own KYC verification
-- because "Customer updates own record" only checked row ownership, not
-- which columns changed. Restrict direct table UPDATE to genuinely
-- self-service columns; every privileged column becomes writable only via
-- SECURITY DEFINER / service-role paths (submitCustomerVerification,
-- reviewCustomerVerification).

REVOKE UPDATE ON public.customer_profiles FROM authenticated;

GRANT UPDATE (saved_suburb, notes) ON public.customer_profiles TO authenticated;

COMMENT ON COLUMN public.customer_profiles.verification_status IS
  'Admin/service-role only. Set via submitCustomerVerification (always to pending) or reviewCustomerVerification (admin decisions). Not directly updatable by authenticated (see column GRANTs).';
COMMENT ON COLUMN public.customer_profiles.reviewed_by IS 'Admin/service-role only.';
COMMENT ON COLUMN public.customer_profiles.reviewed_at IS 'Admin/service-role only.';
COMMENT ON COLUMN public.customer_profiles.review_notes IS 'Admin/service-role only.';
