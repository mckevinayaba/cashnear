import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const verificationSchema = z.object({
  full_legal_name: z.string().trim().min(2).max(200),
  mobile_number: z
    .string()
    .trim()
    .regex(/^(\+?27|0)[6-8][0-9]{8}$/, "Enter a valid South African mobile number."),
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

    // verification_status (and the identity fields alongside it) are
    // admin/service-role only columns as of migration 20260718070000 --
    // authenticated no longer has direct column UPDATE on them. This write
    // always sets "pending", never an attacker-controlled value; routing it
    // through the service role is what actually makes that column
    // writable at all now, consistent with the DB-level lockdown.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
