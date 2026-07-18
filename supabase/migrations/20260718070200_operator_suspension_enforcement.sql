-- C-04 remediation: suspending/rejecting/deactivating an operator business
-- never revoked staff access, and a suspended/deactivated owner could still
-- upload or delete documents. Model A (see remediation plan): user_roles
-- stays a historical record; effective access is enforced via
-- operator_staff.active + operator_businesses.application_status.

-- 1. Trigger: keep operator_staff.active in sync with business status.
-- Fires regardless of which code path changes application_status (server
-- function or a future direct service-role update), not just
-- reviewOperatorApplication today.
CREATE OR REPLACE FUNCTION public.sync_operator_staff_on_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.application_status IN ('suspended', 'deactivated', 'rejected')
     AND OLD.application_status IS DISTINCT FROM NEW.application_status THEN
    UPDATE public.operator_staff SET active = false
      WHERE business_id = NEW.id AND active = true;
  ELSIF NEW.application_status = 'approved' AND OLD.application_status = 'suspended' THEN
    UPDATE public.operator_staff SET active = true
      WHERE business_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operator_businesses_status_sync ON public.operator_businesses;
CREATE TRIGGER trg_operator_businesses_status_sync
  AFTER UPDATE OF application_status ON public.operator_businesses
  FOR EACH ROW EXECUTE FUNCTION public.sync_operator_staff_on_status_change();

-- 2. One-time backfill: existing suspended/deactivated/rejected businesses
-- (if any already exist in this project) get their staff deactivated now,
-- not just on the next future transition.
UPDATE public.operator_staff s SET active = false
  FROM public.operator_businesses b
  WHERE s.business_id = b.id
    AND b.application_status IN ('suspended', 'deactivated', 'rejected')
    AND s.active = true;

-- 3. Document upload/delete (the one owner-only *write* action that exists
-- in Stage 1 today) must stop working while suspended/deactivated. Read
-- access is intentionally left unchanged so a suspended owner can still see
-- what was submitted.
DROP POLICY IF EXISTS "Owner uploads documents" ON public.operator_documents;
CREATE POLICY "Owner uploads documents" ON public.operator_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.operator_businesses b
      WHERE b.id = business_id
        AND b.owner_id = auth.uid()
        AND b.application_status NOT IN ('suspended', 'deactivated')
    )
  );

DROP POLICY IF EXISTS "Owner deletes documents" ON public.operator_documents;
CREATE POLICY "Owner deletes documents" ON public.operator_documents
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operator_businesses b
      WHERE b.id = business_id
        AND b.owner_id = auth.uid()
        AND b.application_status NOT IN ('suspended', 'deactivated')
    )
  );
