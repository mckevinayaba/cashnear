import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit";
import { DEMO_CUSTOMER_USER_ID, DEMO_OPERATOR_OWNER_USER_ID } from "@/lib/demo-accounts";
import type { Database } from "@/integrations/supabase/types";

const resetTargetSchema = z.object({ target: z.enum(["customer", "operator"]) });

async function assertSuperAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("super_admin")) {
    throw new Error("Only super_admin can use the demo reset controls.");
  }
}

/**
 * Founder-only demo reset. Deliberately takes a fixed `target` enum, never
 * a client-supplied user id -- the two accounts this can ever touch are the
 * hardcoded DEMO_CUSTOMER_USER_ID / DEMO_OPERATOR_OWNER_USER_ID constants
 * (see demo-accounts.ts), so there is no code path from a client request to
 * an arbitrary/real user's data. Restores each account to the same blank
 * state a brand-new sign-up would be in, so a founder demo can be repeated
 * without leftover data (or leftover storage objects) from the last run.
 */
export const resetDemoAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => resetTargetSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertSuperAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "admin_mutation", userId, {
      maxAttempts: 60,
      windowSeconds: 600,
    });

    const targetUserId =
      data.target === "customer" ? DEMO_CUSTOMER_USER_ID : DEMO_OPERATOR_OWNER_USER_ID;

    // Defense in depth: structurally this can never be true (the two demo
    // ids are fixed constants, never the calling admin's own id), but a
    // super-admin must never be able to run demo controls against
    // themselves, so this is checked explicitly rather than assumed.
    if (userId === targetUserId) {
      throw new Error("Demo controls cannot target your own account.");
    }

    if (data.target === "customer") {
      const { data: profile, error: readErr } = await supabaseAdmin
        .from("customer_profiles")
        .select("id_document_path, selfie_path")
        .eq("user_id", DEMO_CUSTOMER_USER_ID)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);

      const paths = [profile?.id_document_path, profile?.selfie_path].filter(
        (p): p is string => !!p,
      );
      if (paths.length > 0) {
        await supabaseAdmin.storage.from("customer-documents").remove(paths);
      }

      const { error: delErr } = await supabaseAdmin
        .from("customer_profiles")
        .delete()
        .eq("user_id", DEMO_CUSTOMER_USER_ID);
      if (delErr) throw new Error(delErr.message);
    } else {
      const { data: businesses, error: bizErr } = await supabaseAdmin
        .from("operator_businesses")
        .select("id")
        .eq("owner_id", DEMO_OPERATOR_OWNER_USER_ID);
      if (bizErr) throw new Error(bizErr.message);

      const businessIds = (businesses ?? []).map((b) => b.id);
      if (businessIds.length > 0) {
        const { data: docs, error: docsErr } = await supabaseAdmin
          .from("operator_documents")
          .select("storage_path")
          .in("business_id", businessIds);
        if (docsErr) throw new Error(docsErr.message);

        const paths = (docs ?? []).map((d) => d.storage_path).filter(Boolean);
        if (paths.length > 0) {
          await supabaseAdmin.storage.from("operator-documents").remove(paths);
        }

        // operator_documents, operator_staff, and verification_reviews rows
        // for these businesses cascade-delete via their business_id FK
        // (ON DELETE CASCADE, migration 20260718061518).
        const { error: delErr } = await supabaseAdmin
          .from("operator_businesses")
          .delete()
          .in("id", businessIds);
        if (delErr) throw new Error(delErr.message);
      }

      // Clear the operator_owner role grant too, so the account is back to
      // exactly the state a brand-new sign-up would be in.
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", DEMO_OPERATOR_OWNER_USER_ID)
        .eq("role", "operator_owner");
    }

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: `demo.reset.${data.target}`,
      p_entity_type: "demo_account",
      p_entity_id: targetUserId,
    });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true, target: data.target };
  });
