import type { Database } from "@/integrations/supabase/types";

export type OperatorApplicationStatus = Database["public"]["Enums"]["operator_application_status"];

/**
 * States an applicant may edit/resubmit from. Anything else (submitted,
 * under_review, site_verification_required, approved, rejected, suspended,
 * deactivated) rejects the write server-side -- this is what closes C-03
 * (rejected/suspended operators overwriting their application to
 * self-reinstate) at the application-logic layer, independent of the
 * column-level DB grant that closes it at the data layer.
 */
const APPLICANT_EDITABLE_STATUSES: ReadonlySet<OperatorApplicationStatus> = new Set([
  "draft",
  "info_requested",
]);

/**
 * `current` is undefined when creating a brand new application (no existing
 * row yet) -- always allowed. Otherwise the applicant may only continue
 * editing while the business is in an applicant-editable state.
 */
export function applicantCanEdit(current: OperatorApplicationStatus | undefined): boolean {
  if (current === undefined) return true;
  return APPLICANT_EDITABLE_STATUSES.has(current);
}

/**
 * Admin-initiated review transitions, via reviewOperatorApplication.
 * Deliberately permissive within the "review family" (submitted/
 * under_review/info_requested/site_verification_required) to keep the
 * existing admin UI's approve/reject/request-info/site-visit/suspend
 * buttons usable from the states reviewers actually encounter, while still
 * rejecting the genuinely invalid edges: nothing may be actioned from
 * `draft` (must be submitted by the applicant first), and `deactivated` is
 * terminal.
 *
 * Founder governance decisions (see docs/STAGE1_SECURITY_REMEDIATION_REPORT.md):
 * - `rejected` is terminal for the existing application record. No admin
 *   transition is reachable from `rejected` through this function or any
 *   other -- not back to under_review, not to approved. A future
 *   reapplication must create a new application record (or a formally
 *   versioned one referencing the rejected record), never reopen this one.
 *   This remediation does not build that reapplication flow.
 * - `suspended -> approved` (reinstatement) is deliberately NOT reachable
 *   through this general-purpose map/function at all, for any role. Only
 *   super_admin may reinstate, through the dedicated reinstateOperator
 *   function (admin.functions.ts), which enforces a mandatory written
 *   reason, an actor-eligibility check (see isReinstatementActorEligible),
 *   and its own audit trail. reviewOperatorApplication -- callable by
 *   ops_admin -- must never be able to independently restore access.
 */
const ADMIN_ALLOWED_TRANSITIONS: Readonly<
  Record<OperatorApplicationStatus, readonly OperatorApplicationStatus[]>
> = {
  draft: [],
  submitted: [
    "under_review",
    "info_requested",
    "site_verification_required",
    "approved",
    "rejected",
  ],
  under_review: ["info_requested", "site_verification_required", "approved", "rejected"],
  info_requested: ["under_review"],
  site_verification_required: ["under_review", "approved", "rejected"],
  approved: ["suspended", "deactivated"],
  rejected: [],
  suspended: ["deactivated"],
  deactivated: [],
};

export function isValidAdminTransition(
  from: OperatorApplicationStatus,
  to: OperatorApplicationStatus,
): boolean {
  return ADMIN_ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedAdminTransitionsFrom(
  from: OperatorApplicationStatus,
): readonly OperatorApplicationStatus[] {
  return ADMIN_ALLOWED_TRANSITIONS[from] ?? [];
}

/**
 * suspended -> approved is only ever reachable through reinstateOperator,
 * never through isValidAdminTransition/reviewOperatorApplication (see
 * above). Kept as its own named check, not folded into the general map, so
 * the one-edge special case stays self-documenting and independently
 * testable.
 */
export function canReinstateFrom(status: OperatorApplicationStatus): boolean {
  return status === "suspended";
}

/**
 * The reinstating actor must not be the suspended business's owner or any
 * current/former operator_staff member of it -- a super_admin who also
 * happens to be a member of the business being reinstated must not be able
 * to approve their own (or their business's) reinstatement. `staffUserIds`
 * should include every operator_staff row for the business regardless of
 * `active`, since the check is about relationship to the business, not
 * current operational status.
 */
export function isReinstatementActorEligible(params: {
  actorUserId: string;
  businessOwnerId: string;
  businessStaffUserIds: readonly string[];
}): boolean {
  if (params.actorUserId === params.businessOwnerId) return false;
  if (params.businessStaffUserIds.includes(params.actorUserId)) return false;
  return true;
}
