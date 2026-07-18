-- C-02 remediation: operators could self-approve their own business
-- application because "Owner updates business" only checked row ownership,
-- not which columns changed. Restrict direct table UPDATE to applicant-
-- editable business fields; status/review fields become writable only via
-- service-role paths (upsertOperatorApplication's validated transition,
-- reviewOperatorApplication).

REVOKE UPDATE ON public.operator_businesses FROM authenticated;

GRANT UPDATE (
  legal_name, trading_name, business_type, registration_number, tax_number,
  years_operating, description, street_address, suburb, city, province,
  postal_code, gps_lat, gps_lng, premises_type, terminal_provider,
  terminal_model, estimated_mdr, representative_name, representative_id_number,
  representative_mobile, representative_email, representative_relationship,
  opening_hours, max_transaction_amount, agreements_accepted_at
) ON public.operator_businesses TO authenticated;

COMMENT ON COLUMN public.operator_businesses.application_status IS
  'Admin/service-role only. Set via upsertOperatorApplication (validated transition, draft/submitted only) or reviewOperatorApplication (admin decisions). Not directly updatable by authenticated (see column GRANTs).';
COMMENT ON COLUMN public.operator_businesses.submitted_at IS 'Admin/service-role only.';
COMMENT ON COLUMN public.operator_businesses.reviewed_at IS 'Admin/service-role only.';
COMMENT ON COLUMN public.operator_businesses.reviewed_by IS 'Admin/service-role only.';
COMMENT ON COLUMN public.operator_businesses.review_notes IS 'Admin/service-role only.';
