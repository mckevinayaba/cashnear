import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MOBILE_NUMBER_ERROR, normalizeMobileNumber } from "@/lib/phone-number";
import { enforceRateLimit } from "@/lib/rate-limit";

const verificationSchema = z.object({
  full_legal_name: z.string().trim().min(2).max(200),
  // Accepts South African local/international numbers and any other
  // international number given with an explicit "+" country code --
  // nationality is never inferred from the number itself (see
  // src/lib/phone-number.ts). Normalized to a consistent international
  // form before storage regardless of which accepted shape was submitted.
  mobile_number: z
    .string()
    .trim()
    .transform((val, ctx) => {
      const result = normalizeMobileNumber(val);
      if (result.error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MOBILE_NUMBER_ERROR });
        return z.NEVER;
      }
      return result.value;
    }),
  id_document_type: z.enum(["sa_id", "passport", "asylum", "refugee"]),
  id_document_number: z.string().trim().min(6).max(30),
  id_document_path: z.string().trim().min(3).max(500),
  selfie_path: z.string().trim().min(3).max(500).optional().or(z.literal("")),
  consent: z.boolean().refine((v) => v === true, "Consent is required."),
});

/** Submit a customer verification application for manual review. */
export const submitCustomerVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => verificationSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "customer_verification_submit", userId, {
      maxAttempts: 5,
      windowSeconds: 600,
    });

    // verification_status (and the identity fields alongside it) are
    // admin/service-role only columns as of migration 20260718070000 --
    // authenticated no longer has direct column UPDATE on them. This write
    // always sets "pending", never an attacker-controlled value; routing it
    // through the service role is what actually makes that column
    // writable at all now, consistent with the DB-level lockdown.
    const { error } = await supabaseAdmin.from("customer_profiles").upsert(
      {
        user_id: userId,
        full_legal_name: data.full_legal_name,
        mobile_number: data.mobile_number,
        id_document_type: data.id_document_type,
        id_document_number: data.id_document_number,
        id_document_path: data.id_document_path,
        selfie_path: data.selfie_path || null,
        consent_accepted_at: nowIso,
        submitted_at: nowIso,
        verification_status: "pending",
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: "customer.verification.submitted",
      p_entity_type: "customer_profile",
      p_entity_id: userId,
      p_metadata: { id_document_type: data.id_document_type },
    });
    if (auditErr) throw new Error(auditErr.message);

    return { ok: true };
  });

const documentPathSchema = z.object({
  kind: z.enum(["id", "selfie"]),
  path: z.string().trim().min(3).max(500),
});

/**
 * Persists a newly uploaded document's storage path to the caller's own
 * customer record immediately, rather than only at final submission --
 * this is what lets a replacement made before submitting (or a
 * resubmission after rejection) reliably find and clean up the previous
 * object instead of leaving it orphaned in storage indefinitely.
 *
 * id_document_path/selfie_path are admin/service-role-only columns
 * (migration 20260718070000, same C-01 column lockdown as
 * verification_status), so this write must go through the service role
 * even though the caller is only ever persisting their own upload.
 * Returns the path that was on record before this call, if any, so the
 * client can safely delete that old object only after this succeeds.
 */
export const updateCustomerDocumentPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => documentPathSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const column = data.kind === "id" ? "id_document_path" : "selfie_path";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "customer_document_upload", userId, {
      maxAttempts: 20,
      windowSeconds: 600,
    });

    const { data: existing, error: readErr } = await supabase
      .from("customer_profiles")
      .select(column)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const writeErr = await (
      data.kind === "id"
        ? supabaseAdmin
            .from("customer_profiles")
            .upsert({ user_id: userId, id_document_path: data.path }, { onConflict: "user_id" })
        : supabaseAdmin
            .from("customer_profiles")
            .upsert({ user_id: userId, selfie_path: data.path }, { onConflict: "user_id" })
    ).then((r) => r.error);
    if (writeErr) throw new Error(writeErr.message);

    const previousPath = existing
      ? ((existing as Record<string, string | null>)[column] ?? null)
      : null;
    return { previousPath };
  });
