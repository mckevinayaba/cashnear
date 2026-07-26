import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicantCanEdit } from "@/lib/operator-application-state";

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
    .enum([
      "yoco",
      "ikhokha",
      "fnb",
      "standard_bank",
      "nedbank",
      "absa",
      "kazang",
      "flash",
      "other",
    ])
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

    // Applicant-editable business content only. application_status,
    // submitted_at, reviewed_at, reviewed_by, review_notes are excluded here
    // by design -- migration 20260718070100 revokes column-level UPDATE on
    // them for `authenticated`, so a raw table write to these columns fails
    // at the database layer regardless of what this function does. The
    // status transition itself is handled separately below, through the
    // service-role client, only after validating it against the current
    // state (C-03).
    const contentFields = {
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
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let businessId = business_id;
    if (businessId) {
      // Ownership-checked read of current status before allowing any write.
      // RLS additionally scopes this to the caller's own business; a
      // business_id belonging to another operator returns no row here, so
      // "change another operator's application" fails before any write is
      // attempted, not just at the eventual .eq("owner_id", ...) filter.
      const { data: existing, error: readErr } = await supabase
        .from("operator_businesses")
        .select("id, application_status")
        .eq("id", businessId)
        .eq("owner_id", userId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!existing) throw new Error("Business not found.");

      if (!applicantCanEdit(existing.application_status)) {
        throw new Error(
          `This application cannot be edited while it is "${existing.application_status}". ` +
            "Contact CashNear operations if you believe this is a mistake.",
        );
      }

      const { error } = await supabase
        .from("operator_businesses")
        .update(contentFields)
        .eq("id", businessId)
        .eq("owner_id", userId);
      if (error) throw new Error(error.message);
    } else {
      // application_status defaults to 'draft' at the database level; the
      // insert never needs to set it explicitly.
      const { data: inserted, error } = await supabase
        .from("operator_businesses")
        .insert(contentFields)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      businessId = inserted.id;
    }

    const nextStatus = submit ? ("submitted" as const) : ("draft" as const);
    const { error: statusErr } = await supabaseAdmin
      .from("operator_businesses")
      .update({
        application_status: nextStatus,
        submitted_at: submit ? new Date().toISOString() : null,
      })
      .eq("id", businessId);
    if (statusErr) throw new Error(statusErr.message);

    // Grant operator_owner role via service role.
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

    const { error: auditErr } = await supabase.rpc("log_audit_event", {
      p_action: submit ? "operator.application.submitted" : "operator.application.saved",
      p_entity_type: "operator_business",
      p_entity_id: businessId,
    });
    if (auditErr) throw new Error(auditErr.message);

    return { business_id: businessId, status: nextStatus };
  });
