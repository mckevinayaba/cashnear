import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidAdminTransition } from "@/lib/operator-application-state";

const decisionSchema = z.object({
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
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
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

    const { data: current, error: readErr } = await supabase
      .from("operator_businesses")
      .select("id, application_status")
      .eq("id", data.business_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Business not found");

    if (!isValidAdminTransition(current.application_status, data.decision)) {
      throw new Error(
        `Cannot move an application from "${current.application_status}" to "${data.decision}".`,
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    // trg_operator_businesses_status_sync trigger (migration
    // 20260718070200) -- suspension/deactivation/rejection revokes staff
    // access immediately, and suspended -> approved reinstatement restores
    // it, regardless of which code path changed the status.

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

const customerDecisionSchema = z.object({
  customer_user_id: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "suspended", "pending"]),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
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

    const { data: current, error: readErr } = await supabase
      .from("customer_profiles")
      .select("user_id, verification_status")
      .eq("user_id", data.customer_user_id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!current) throw new Error("Customer profile not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
      p_metadata: { note: data.note ?? null, from_status: current.verification_status, reviewer_role: role },
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
