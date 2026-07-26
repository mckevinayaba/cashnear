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
 * Admin-initiated review transitions. Deliberately permissive within the
 * "review family" (submitted/under_review/info_requested/
 * site_verification_required) to keep the existing admin UI's
 * approve/reject/request-info/site-visit/suspend buttons usable from the
 * states reviewers actually encounter, while still rejecting the genuinely
 * invalid edges: nothing may be actioned from `draft` (must be submitted by
 * the applicant first), `deactivated` is terminal, and `approved` can only
 * be reached through a review state, never directly from `draft`/`rejected`/
 * `deactivated`. `suspended -> approved` (reinstatement) is intentionally
 * included and is the one edge the assessment specifically calls out as
 * "administrative reinstatement only" -- it is admin-only by construction
 * since this map is only consulted by the admin review function.
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
  rejected: ["under_review"],
  suspended: ["approved", "deactivated"],
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
