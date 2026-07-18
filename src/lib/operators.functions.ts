import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const applicationSchema = z.object({
  business_id: z.string().uuid().optional(),
  legal_name: z.string().trim().min(2).max(200),
  trading_name: z.string().trim().min(2).max(200),
  business_type: z.string().trim().min(2).max(120),
  registration_number: z.string().trim().max(80).optional().or(z.literal("")),
  tax_number: z.string().trim().max(80).optional().or(z.literal("")),
  years_operating: z.number().int().min(0).max(200).optional(),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  street_address: z.string().trim().min(3).max(200),
  suburb: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  province: z.enum([
    "gauteng",
    "western_cape",
    "kwazulu_natal",
    "eastern_cape",
    "free_state",
    "limpopo",
    "mpumalanga",
    "north_west",
    "northern_cape",
  ]),
  postal_code: z.string().trim().min(4).max(10),
  premises_type: z.string().trim().max(80).optional().or(z.literal("")),
  terminal_provider: z
    .enum(["yoco", "ikhokha", "fnb", "standard_bank", "nedbank", "absa", "kazang", "flash", "other"])
    .optional(),
  terminal_model: z.string().trim().max(120).optional().or(z.literal("")),
  representative_name: z.string().trim().min(2).max(200),
  representative_id_number: z.string().trim().min(6).max(30),
  representative_mobile: z.string().trim().min(6).max(20),
  representative_email: z.string().trim().email().max(255),
  representative_relationship: z.string().trim().max(120).optional().or(z.literal("")),
  agreements_accepted: z.boolean().refine((v) => v === true, "Agreements must be accepted."),
  submit: z.boolean().default(false),
});

export type OperatorApplicationInput = z.infer<typeof applicationSchema>;

/**
 * Create/update operator business record and optionally submit for review.
 * Also grants the caller the `operator_owner` role (via service role) so they
 * gain access to their operator dashboard.
 */
export const upsertOperatorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => applicationSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { submit, agreements_accepted, business_id, ...fields } = data;

    const record = {
      owner_id: userId,
      legal_name: fields.legal_name,
      trading_name: fields.trading_name,
      business_type: fields.business_type,
      registration_number: fields.registration_number || null,
      tax_number: fields.tax_number || null,
      years_operating: fields.years_operating ?? null,
      description: fields.description || null,
      street_address: fields.street_address,
      suburb: fields.suburb,
      city: fields.city,
      province: fields.province,
      postal_code: fields.postal_code,
      premises_type: fields.premises_type || null,
      terminal_provider: fields.terminal_provider ?? null,
      terminal_model: fields.terminal_model || null,
      representative_name: fields.representative_name,
      representative_id_number: fields.representative_id_number,
      representative_mobile: fields.representative_mobile,
      representative_email: fields.representative_email,
      representative_relationship: fields.representative_relationship || null,
      agreements_accepted_at: agreements_accepted ? new Date().toISOString() : null,
      application_status: submit ? ("submitted" as const) : ("draft" as const),
      submitted_at: submit ? new Date().toISOString() : null,
    };

    let businessId = business_id;
    if (businessId) {
      const { error } = await supabase
        .from("operator_businesses")
        .update(record)
        .eq("id", businessId)
        .eq("owner_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("operator_businesses")
        .insert(record)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      businessId = inserted.id;
    }

    // Grant operator_owner role via service role.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "operator_owner", granted_by: userId },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );

    // Register owner in staff table
    await supabaseAdmin
      .from("operator_staff")
      .upsert(
        { business_id: businessId, user_id: userId, role: "operator_owner", active: true },
        { onConflict: "business_id,user_id", ignoreDuplicates: true },
      );

    // Audit
    await supabase.from("audit_logs").insert({
      actor_id: userId,
      actor_role: "operator_owner",
      action: submit ? "operator.application.submitted" : "operator.application.saved",
      entity_type: "operator_business",
      entity_id: businessId,
    });

    return { business_id: businessId, status: record.application_status };
  });
