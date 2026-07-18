import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

    await supabase.from("verification_reviews").insert({
      business_id: data.business_id,
      reviewer_id: userId,
      from_status: current.application_status,
      to_status: data.decision,
      decision_note: data.note || null,
    });

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_role: role,
      action: `operator.review.${data.decision}`,
      entity_type: "operator_business",
      entity_id: data.business_id,
      metadata: { note: data.note ?? null },
    });

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

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_role: "super_admin",
      action: "role.granted",
      entity_type: "user",
      entity_id: data.target_user_id,
      metadata: { role: data.role },
    });

    return { ok: true };
  });
