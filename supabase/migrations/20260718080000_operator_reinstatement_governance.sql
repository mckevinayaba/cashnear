-- Founder governance decisions (docs/STAGE1_SECURITY_REMEDIATION_REPORT.md):
--
-- 1. Reinstatement (suspended -> approved) restores only the staff rows
--    THIS suspension event deactivated -- not every inactive row on the
--    business, some of which may have been deactivated for unrelated
--    reasons before the suspension happened. Track that with a new
--    timestamp column and use it as the reactivation predicate, replacing
--    the previous "reactivate everyone" behaviour from migration 070200.
--
-- 2. Rejection is terminal: no admin transition is reachable from
--    `rejected` anymore (enforced in operator-application-state.ts /
--    reviewOperatorApplication). No database change is required for that
--    half of the decision -- application_status was already writable only
--    through the service role (migration 070100), and the TS-level
--    transition map is the enforcement point for which transitions that
--    service-role path will actually perform.

ALTER TABLE public.operator_staff
  ADD COLUMN IF NOT EXISTS deactivated_by_suspension_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.sync_operator_staff_on_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.application_status IN ('suspended', 'deactivated', 'rejected')
     AND OLD.application_status IS DISTINCT FROM NEW.application_status THEN
    -- Only mark rows that were actually active at this moment as
    -- "deactivated by this event" -- rows already inactive for an unrelated
    -- reason are left exactly as they were, including their own history.
    UPDATE public.operator_staff SET active = false, deactivated_by_suspension_at = now()
      WHERE business_id = NEW.id AND active = true;
  ELSIF NEW.application_status = 'approved' AND OLD.application_status = 'suspended' THEN
    -- Reactivate only the rows this mechanism itself deactivated. A staff
    -- member who was removed for an unrelated reason before or during the
    -- suspension stays inactive; restoring them requires an explicit,
    -- separate staff-management action, not blanket reinstatement.
    UPDATE public.operator_staff SET active = true, deactivated_by_suspension_at = NULL
      WHERE business_id = NEW.id AND deactivated_by_suspension_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill: mark currently-inactive staff of currently-suspended/
-- deactivated/rejected businesses as suspension-caused, matching what the
-- 070200 backfill already established for `active`, so a future
-- reinstatement of any of these businesses correctly identifies which rows
-- to restore instead of treating all of them as pre-existing/unrelated.
UPDATE public.operator_staff s SET deactivated_by_suspension_at = now()
  FROM public.operator_businesses b
  WHERE s.business_id = b.id
    AND b.application_status IN ('suspended', 'deactivated', 'rejected')
    AND s.active = false
    AND s.deactivated_by_suspension_at IS NULL;
