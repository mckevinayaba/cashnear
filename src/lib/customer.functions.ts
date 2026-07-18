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

    const { error } = await supabase
      .from("customer_profiles")
      .upsert(
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

    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_role: "customer",
      action: "customer.verification.submitted",
      entity_type: "customer_profile",
      entity_id: userId,
      metadata: { id_document_type: data.id_document_type },
    });

    return { ok: true };
  });
