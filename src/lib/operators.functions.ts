import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicantCanEdit } from "@/lib/operator-application-state";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  requiresImmigrationStatusDocument,
  getCompletionChecklist,
  isApplicationComplete,
} from "@/lib/operator-document-requirements";

const applicationSchema = z
  .object({
    business_id: z.string().uuid().optional(),
    legal_name: z.string().trim().min(2).max(200),
    trading_name: z.string().trim().min(2).max(200),
    business_type: z.string().trim().min(2).max(120),
    business_structure: z.enum([
      "sole_trader",
      "registered_company",
      "close_corporation",
      "partnership",
      "cooperative",
      "other",
    ]),
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
    // Generic identity number field, reused across every identity_document_type
    // (SA ID number / passport number / permit number) -- deliberately no
    // format-specific regex here, since a 13-digit-SA-ID pattern would
    // reject every foreign-national document type. Format plausibility is
    // the field's own min/max length only.
    representative_id_type: z.enum([
      "sa_id",
      "passport",
      "asylum_permit",
      "refugee_permit",
      "permanent_residence_permit",
    ]),
    representative_id_number: z.string().trim().min(4).max(30),
    representative_id_country: z.string().trim().max(120).optional().or(z.literal("")),
    representative_id_expiry: z.string().trim().max(20).optional().or(z.literal("")),
    representative_immigration_status_type: z.string().trim().max(200).optional().or(z.literal("")),
    representative_immigration_status_number: z
      .string()
      .trim()
      .max(80)
      .optional()
      .or(z.literal("")),
    representative_immigration_status_expiry: z
      .string()
      .trim()
      .max(20)
      .optional()
      .or(z.literal("")),
    // No SA-only format restriction -- length bounds only, wide enough for
    // international numbers with a country code (e.g. +44 7911 123456).
    // No normalisation standard exists in this project yet; stored as
    // entered. See implementation report for the customer-flow SA-only
    // regex flagged as a separate, unrelated review item.
    representative_mobile: z.string().trim().min(6).max(25),
    representative_email: z.string().trim().email().max(255),
    representative_relationship: z.string().trim().max(120).optional().or(z.literal("")),
    agreements_accepted: z.boolean().refine((v) => v === true, "Agreements must be accepted."),
    submit: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (requiresImmigrationStatusDocument(val.representative_id_type)) {
      if (!val.representative_immigration_status_type?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["representative_immigration_status_type"],
          message: "Tell us what document shows you may work or run a business in South Africa.",
        });
      }
      if (!val.representative_immigration_status_number?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["representative_immigration_status_number"],
          message: "Enter the document number.",
        });
      }
      if (!val.representative_immigration_status_expiry?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["representative_immigration_status_expiry"],
          message: "Enter the expiry date.",
        });
      }
    }
  });

export type OperatorApplicationInput = z.infer<typeof applicationSchema>;

/**
 * Create/update operator business record and optionally submit for review.
 * Also grants the caller the `operator_owner` role (via service role) so they
 * gain access to their operator dashboard.
 */
export const upsertOperatorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => {
    const result = applicationSchema.safeParse(raw);
    if (!result.success) {
      // The default createServerFn error path serializes the whole ZodError
      // (a JSON array of every issue) into the client-side Error's message,
      // which the UI would otherwise render verbatim -- surface just the
      // first plain-language issue instead, matching every other error
      // shown on this form.
      const first = result.error.issues[0];
      throw new Error(first?.message ?? "Please check the highlighted fields and try again.");
    }
    return result.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { submit, agreements_accepted, business_id, ...fields } = data;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await enforceRateLimit(supabaseAdmin, "operator_application_upsert", userId, {
      maxAttempts: 20,
      windowSeconds: 600,
    });

    // Applicant-editable business content only. application_status,
    // submitted_at, reviewed_at, reviewed_by, review_notes are excluded here
    // by design -- migration 20260718070100 revokes column-level UPDATE on
    // them for `authenticated`, so a raw table write to these columns fails
    // at the database layer regardless of what this function does. The
    // status transition itself is handled separately below, through the
    // service-role client, only after validating it against the current
    // state (C-03).
    const contentFields = {
      legal_name: fields.legal_name,
      trading_name: fields.trading_name,
      business_type: fields.business_type,
      business_structure: fields.business_structure,
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
      representative_id_type: fields.representative_id_type,
      representative_id_number: fields.representative_id_number,
      representative_id_country: fields.representative_id_country || null,
      representative_id_expiry: fields.representative_id_expiry || null,
      representative_immigration_status_type: fields.representative_immigration_status_type || null,
      representative_immigration_status_number:
        fields.representative_immigration_status_number || null,
      representative_immigration_status_expiry:
        fields.representative_immigration_status_expiry || null,
      representative_mobile: fields.representative_mobile,
      representative_email: fields.representative_email,
      representative_relationship: fields.representative_relationship || null,
      agreements_accepted_at: agreements_accepted ? new Date().toISOString() : null,
    };

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
      // insert never needs to set it explicitly. owner_id is set only here,
      // on creation -- it is deliberately absent from contentFields since
      // `authenticated` was never granted column-level UPDATE on owner_id
      // (nor should it be: changing ownership of an existing application is
      // a different, more sensitive operation than editing its content).
      const { data: inserted, error } = await supabase
        .from("operator_businesses")
        .insert({ ...contentFields, owner_id: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      businessId = inserted.id;
    }

    // The server is the source of truth for submission completeness --
    // the client-side checklist is a UX convenience, not a substitute for
    // this check. A draft can be saved incomplete; a submission cannot.
    if (submit) {
      const { data: uploadedDocs, error: docsErr } = await supabase
        .from("operator_documents")
        .select("doc_type")
        .eq("business_id", businessId);
      if (docsErr) throw new Error(docsErr.message);

      const checklist = getCompletionChecklist({
        business: {
          legal_name: fields.legal_name,
          trading_name: fields.trading_name,
          business_type: fields.business_type,
          street_address: fields.street_address,
          suburb: fields.suburb,
          city: fields.city,
          province: fields.province,
          postal_code: fields.postal_code,
          representative_name: fields.representative_name,
          representative_id_number: fields.representative_id_number,
          representative_mobile: fields.representative_mobile,
          representative_email: fields.representative_email,
        },
        identityType: fields.representative_id_type,
        businessStructure: fields.business_structure,
        uploadedDocTypes: (uploadedDocs ?? []).map((d) => d.doc_type),
      });
      if (!isApplicationComplete(checklist)) {
        throw new Error("We still need some documents. Check the list above.");
      }
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
