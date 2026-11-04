import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isValidAdminTransition,
  canReinstateFrom,
  isReinstatementActorEligible,
} from "@/lib/operator-application-state";
import { enforceRateLimit } from "@/lib/rate-limit";
import type { Database } from "@/integrations/supabase/types";

// Shared across every admin mutation below -- generous enough not to
// disrupt a normal admin working through a review queue, while still
// bounding a compromised session or buggy/scripted client. Keyed on the
// acting admin's own userId, not IP (unreliable behind Lovable/Supabase).
const ADMIN_MUTATION_RATE_LIMIT = { maxAttempts: 60, windowSeconds: 600 };

const REASON_REQUIRED_DECISIONS = new Set(["rejected", "suspended"]);
const MIN_REASON_LENGTH = 10;

const decisionSchema = z
  .object({
    business_id: z.string().uuid(),
    decision: z.enum([
      "approved",
      "rejected",
      "info_requested",
      "site_verification_required",
      "under_review",
      "suspended",
      "deactivated",
    ]),
    note: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (
      REASON_REQUIRED_DECISIONS.has(val.decision) &&
      (!val.note || val.note.trim().length < MIN_REASON_LENGTH)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: `A written reason (at least ${MIN_REASON_LENGTH} characters) is required to reject or suspend an application.`,
      });
    }
  });

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("ops_admin") && !roles.includes("super_admin")) {
    throw new Error("Forbidden");
  }
  return roles.includes("super_admin") ? "super_admin" : "ops_admin";
}

/** Admin: record a verification decision on an operator application. */
export const reviewOperatorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => decisionSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "admin_mutation", userId, ADMIN_MUTATION_RATE_LIMIT);

    const { data: current, error: readErr } = await supabase
      .from("operator_businesses")
      .select("id, application_status")
      .eq("id", data.business_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Business not found");

    // Idempotency: the server is the source of truth for duplicate
    // submissions (double-click, retried request, etc.) -- a repeat call
    // requesting the status the business is already at is a safe no-op,
    // not a second mutation, second verification_reviews row, or second
    // audit_logs entry. Client-side busy-state disabling alone cannot be
    // relied on to prevent this (confirmed during authenticated staging
    // QA: a scripted rapid double-click fired two requests).
    if (current.application_status === data.decision) {
      return { ok: true, status: data.decision, alreadyApplied: true as const };
    }

    if (!isValidAdminTransition(current.application_status, data.decision)) {
      throw new Error(
        `Cannot move an application from "${current.application_status}" to "${data.decision}".`,
      );
    }

    const nowIso = new Date().toISOString();

    const { error: updErr } = await supabaseAdmin
      .from("operator_businesses")
      .update({
        application_status: data.decision,
        reviewed_at: nowIso,
        reviewed_by: userId,
        review_notes: data.note || null,
      })
      .eq("id", data.business_id);
    if (updErr) throw new Error(updErr.message);

    // operator_staff.active is kept in sync with application_status by the
    // trg_operator_businesses_status_sync trigger (migration 20260718070200,
    // refined by 20260718080000) -- suspension/deactivation/rejection
    // revokes staff access immediately, regardless of which code path
    // changed the status. This function can never reach suspended ->
    // approved (see isValidAdminTransition) -- reinstatement is
    // super_admin-only, through reinstateOperator below.

    const { error: reviewErr } = await supabase.from("verification_reviews").insert({
      business_id: data.business_id,
      reviewer_id: userId,
      from_status: current.application_status,
      to_status: data.decision,
      decision_note: data.note || null,
    });
    if (reviewErr) throw new Error(reviewErr.message);

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: `operator.review.${data.decision}`,
      p_entity_type: "operator_business",
      p_entity_id: data.business_id,
      p_metadata: { note: data.note ?? null, from_status: current.application_status },
    });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true, status: data.decision };
  });

const reinstateSchema = z.object({
  business_id: z.string().uuid(),
  reason: z.string().trim().min(10, "A written reinstatement reason is required.").max(2000),
});

/**
 * Super-admin only: reinstate a suspended operator. Founder governance
 * decision (docs/STAGE1_SECURITY_REMEDIATION_REPORT.md) -- an ops_admin may
 * review and recommend but may not independently restore access, so this
 * is a separate, more strictly gated function rather than a branch of
 * reviewOperatorApplication (which ops_admin can call, and which can never
 * reach suspended -> approved at all, see isValidAdminTransition).
 */
export const reinstateOperator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => reinstateSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    if (role !== "super_admin") {
      throw new Error("Only super_admin can reinstate a suspended operator.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "admin_mutation", userId, ADMIN_MUTATION_RATE_LIMIT);

    const { data: business, error: readErr } = await supabase
      .from("operator_businesses")
      .select("id, owner_id, application_status")
      .eq("id", data.business_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!business) throw new Error("Business not found");

    if (!canReinstateFrom(business.application_status)) {
      throw new Error(
        `Cannot reinstate a business that is currently "${business.application_status}" (only suspended businesses can be reinstated).`,
      );
    }

    const { data: staffRows, error: staffErr } = await supabase
      .from("operator_staff")
      .select("user_id")
      .eq("business_id", data.business_id);
    if (staffErr) throw new Error(staffErr.message);

    const eligible = isReinstatementActorEligible({
      actorUserId: userId,
      businessOwnerId: business.owner_id,
      businessStaffUserIds: (staffRows ?? []).map((r) => r.user_id),
    });
    if (!eligible) {
      throw new Error(
        "You cannot reinstate a business you own or are a staff member of. Ask another super_admin to review this case.",
      );
    }

    const nowIso = new Date().toISOString();

    const { error: updErr } = await supabaseAdmin
      .from("operator_businesses")
      .update({
        application_status: "approved",
        reviewed_at: nowIso,
        reviewed_by: userId,
        review_notes: data.reason,
      })
      .eq("id", data.business_id);
    if (updErr) throw new Error(updErr.message);

    // trg_operator_businesses_status_sync (migration 20260718080000)
    // reactivates only the operator_staff rows this suspension itself
    // deactivated -- not every inactive row on the business.

    const { error: reviewErr } = await supabase.from("verification_reviews").insert({
      business_id: data.business_id,
      reviewer_id: userId,
      from_status: business.application_status,
      to_status: "approved",
      decision_note: data.reason,
    });
    if (reviewErr) throw new Error(reviewErr.message);

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: "operator.reinstated",
      p_entity_type: "operator_business",
      p_entity_id: data.business_id,
      p_metadata: { reason: data.reason, from_status: business.application_status },
    });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true, status: "approved" as const };
  });

const customerDecisionSchema = z
  .object({
    customer_user_id: z.string().uuid(),
    decision: z.enum(["approved", "rejected", "suspended", "pending"]),
    note: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (
      REASON_REQUIRED_DECISIONS.has(val.decision) &&
      (!val.note || val.note.trim().length < MIN_REASON_LENGTH)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: `A written reason (at least ${MIN_REASON_LENGTH} characters) is required to reject or suspend a verification.`,
      });
    }
  });

/**
 * Admin: record a KYC verification decision on a customer profile. This is
 * the only path (besides submitCustomerVerification, which only ever sets
 * "pending") that may write customer_profiles.verification_status /
 * reviewed_at / reviewed_by / review_notes -- migration
 * 20260718070000 revokes direct column UPDATE on these for `authenticated`.
 */
export const reviewCustomerVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => customerDecisionSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "admin_mutation", userId, ADMIN_MUTATION_RATE_LIMIT);

    const { data: current, error: readErr } = await supabase
      .from("customer_profiles")
      .select("user_id, verification_status")
      .eq("user_id", data.customer_user_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Customer profile not found");

    // Idempotency: same rationale as reviewOperatorApplication above -- a
    // repeat call requesting the status the profile is already at is a
    // safe no-op, not a second update or a second audit_logs entry.
    if (current.verification_status === data.decision) {
      return { ok: true, status: data.decision, alreadyApplied: true as const };
    }

    const { error: updErr } = await supabaseAdmin
      .from("customer_profiles")
      .update({
        verification_status: data.decision,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        review_notes: data.note || null,
      })
      .eq("user_id", data.customer_user_id);
    if (updErr) throw new Error(updErr.message);

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: `customer.verification.${data.decision}`,
      p_entity_type: "customer_profile",
      p_entity_id: data.customer_user_id,
      p_metadata: {
        note: data.note ?? null,
        from_status: current.verification_status,
        reviewer_role: role,
      },
    });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true, status: data.decision };
  });

const grantSchema = z.object({
  target_user_id: z.string().uuid(),
  role: z.enum(["ops_admin", "super_admin", "operator_owner"]),
});

/** Super-admin only: grant an admin/operator role to another user. */
export const grantUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => grantSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await assertAdmin(supabase, userId);
    if (role !== "super_admin") throw new Error("Only super_admin can grant roles.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "admin_mutation", userId, ADMIN_MUTATION_RATE_LIMIT);

    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: data.target_user_id, role: data.role, granted_by: userId },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: "role.granted",
      p_entity_type: "user",
      p_entity_id: data.target_user_id,
      p_metadata: { role: data.role },
    });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true };
  });
