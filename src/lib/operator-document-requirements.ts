import type { Database } from "@/integrations/supabase/types";

export type IdentityDocumentType = Database["public"]["Enums"]["identity_document_type"];
export type BusinessStructureType = Database["public"]["Enums"]["business_structure_type"];
export type OperatorDocumentType = Database["public"]["Enums"]["document_type"];

export const IDENTITY_DOCUMENT_TYPES: readonly IdentityDocumentType[] = [
  "sa_id",
  "passport",
  "asylum_permit",
  "refugee_permit",
  "permanent_residence_permit",
];

export const IDENTITY_DOCUMENT_LABELS: Record<IdentityDocumentType, string> = {
  sa_id: "South African ID",
  passport: "Passport",
  asylum_permit: "Asylum Seeker Permit",
  refugee_permit: "Refugee ID or Refugee Permit",
  permanent_residence_permit: "Permanent Residence Permit",
};

export const BUSINESS_STRUCTURE_TYPES: readonly BusinessStructureType[] = [
  "sole_trader",
  "registered_company",
  "close_corporation",
  "partnership",
  "cooperative",
  "other",
];

export const BUSINESS_STRUCTURE_LABELS: Record<BusinessStructureType, string> = {
  sole_trader: "Sole trader",
  registered_company: "Registered company",
  close_corporation: "Close corporation",
  partnership: "Partnership",
  cooperative: "Cooperative",
  other: "Other",
};

/**
 * Only passport holders need a separate immigration-status document
 * (e.g. a work or business visa) in addition to their primary identity
 * document. Every other non-SA-ID type -- asylum permit, refugee
 * document, permanent residence permit -- is itself the status evidence,
 * per the identity-document field spec this was built against.
 */
export function requiresImmigrationStatusDocument(identityType: IdentityDocumentType): boolean {
  return identityType === "passport";
}

export interface BusinessProofRequirement {
  docType: OperatorDocumentType;
  label: string;
  why: string;
  /** Not a schema field -- a UI-only signal that this evidence type is too
   * varied to auto-validate, so the reviewer should look at it by hand
   * rather than treat its mere presence as sufficient. */
  manualReview: boolean;
}

/**
 * Founder-corrected policy: every business structure requires at least one
 * piece of business proof -- what differs is which evidence is requested
 * and accepted, never whether proof is required at all. A sole trader with
 * no CIPC registration still needs alternative evidence that the business
 * trades (never a formal registration document, which would wrongly
 * exclude unincorporated traders); a partnership needs its agreement or
 * equivalent evidence; a registered company/CC/cooperative needs its
 * registration document; "Other" needs some business evidence flagged for
 * manual review since it doesn't fit a known category. Returns null only
 * when no structure has been chosen yet (nothing to ask for).
 */
export function getBusinessProofRequirement(
  structure: BusinessStructureType | null,
): BusinessProofRequirement | null {
  switch (structure) {
    case null:
      return null;
    case "registered_company":
    case "close_corporation":
    case "cooperative":
      return {
        docType: "business_registration",
        label: "Business registration document",
        why: "This confirms the business is registered.",
        manualReview: false,
      };
    case "partnership":
      return {
        docType: "business_registration",
        label: "Proof of partnership or business",
        why: "Upload your partnership agreement or another document showing that the business operates.",
        manualReview: false,
      };
    case "sole_trader":
      return {
        docType: "business_registration",
        label: "Proof that your business trades",
        why: "For example: a trading permit, lease, municipal document, supplier invoice, bank document, or another document showing the business operates. You do not need a CIPC registration if your business is not a registered company.",
        manualReview: false,
      };
    case "other":
      return {
        docType: "other",
        label: "Proof of your business",
        why: "Upload a document showing how your business operates. We check this by hand because your business type is set to 'Other'.",
        manualReview: true,
      };
  }
}

export interface RequiredDocument {
  /** Stable UI key -- distinct from docType because one docType (id_document) can back more than one card. */
  key: string;
  docType: OperatorDocumentType;
  label: string;
  why: string;
  required: boolean;
}

/**
 * The per-document-card list for the "What we need from you" upload
 * section. Always includes the four documents required of every
 * applicant, plus a business-proof card once a business structure has
 * been chosen (its label/why/docType vary by structure, but some
 * business-proof document is always required -- see
 * getBusinessProofRequirement); conditionally includes the
 * immigration-status document (passport only) and the optional
 * secondary-passport card (permanent residence permit only).
 */
export function getRequiredDocuments(params: {
  identityType: IdentityDocumentType | null;
  businessStructure: BusinessStructureType | null;
}): RequiredDocument[] {
  const { identityType, businessStructure } = params;
  const docs: RequiredDocument[] = [];

  docs.push({
    key: "identity",
    docType: "id_document",
    label: identityType ? IDENTITY_DOCUMENT_LABELS[identityType] : "Identity document",
    why: "We need this to know who you are.",
    required: true,
  });

  if (identityType && requiresImmigrationStatusDocument(identityType)) {
    docs.push({
      key: "immigration_status",
      docType: "immigration_status",
      label: "Proof you may work or run a business in South Africa",
      why: "We will check whether your permit or visa allows you to work or run a business in South Africa.",
      required: true,
    });
  }

  docs.push({
    key: "proof_of_address",
    docType: "proof_of_address",
    label: "Proof of business address",
    why: "This shows where your shop is.",
    required: true,
  });

  docs.push({
    key: "terminal_proof",
    docType: "terminal_proof",
    label: "Card machine proof",
    why: "Upload a clear photo of your card machine.",
    required: true,
  });

  docs.push({
    key: "premises_photo",
    docType: "premises_photo",
    label: "Shop photo",
    why: "Upload a clear photo showing the front of your shop.",
    required: true,
  });

  const businessProof = getBusinessProofRequirement(businessStructure);
  docs.push({
    key: "business_document",
    docType: businessProof?.docType ?? "business_registration",
    label: businessProof?.label ?? "Business proof",
    why: businessProof?.why ?? "Choose your business structure above to see what to upload.",
    required: businessProof !== null,
  });

  // Permanent residence holders may optionally add a passport for faster
  // identity matching -- kept optional, not made mandatory, pending any
  // future founder/legal review. Uses its own doc_type (not "other") so it
  // never collides with the "Other" business structure's own "other"-typed
  // business-proof upload for the same applicant -- uploadOperatorDocument
  // replaces every existing row for a (business_id, doc_type) pair, so two
  // different cards sharing one doc_type would silently overwrite each other.
  if (identityType === "permanent_residence_permit") {
    docs.push({
      key: "prp_passport_optional",
      docType: "passport_supporting",
      label: "Passport (if you have one)",
      why: "We may ask for your passport if we need it to match your identity details.",
      required: false,
    });
  }

  return docs;
}

export type ChecklistStatus = "done" | "missing" | "not_needed";

export interface ChecklistItem {
  key: string;
  label: string;
  status: ChecklistStatus;
}

export interface ChecklistBusinessFields {
  legal_name: string | null;
  trading_name: string | null;
  business_type: string | null;
  street_address: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  representative_name: string | null;
  representative_id_number: string | null;
  representative_mobile: string | null;
  representative_email: string | null;
}

/**
 * The coarse "Your application" summary checklist -- a smaller set of
 * rows than the per-document card list, since a few document cards
 * bundle into a single checklist row (e.g. the identity document plus,
 * for passport holders, the separate immigration-status document both
 * roll up into a single "Your identity" row). Represents submission
 * completeness only, not administrator approval -- see isApplicationComplete.
 */
export function getCompletionChecklist(params: {
  business: ChecklistBusinessFields;
  identityType: IdentityDocumentType | null;
  businessStructure: BusinessStructureType | null;
  uploadedDocTypes: readonly OperatorDocumentType[];
}): ChecklistItem[] {
  const { business, identityType, businessStructure, uploadedDocTypes } = params;
  const has = (t: OperatorDocumentType) => uploadedDocTypes.includes(t);

  const businessDetailsDone = Boolean(
    business.legal_name &&
    business.trading_name &&
    business.business_type &&
    business.street_address &&
    business.suburb &&
    business.city &&
    business.province &&
    business.postal_code &&
    business.representative_name &&
    business.representative_id_number &&
    business.representative_mobile &&
    business.representative_email,
  );

  const identityDone = identityType
    ? has("id_document") &&
      (!requiresImmigrationStatusDocument(identityType) || has("immigration_status"))
    : false;

  const businessProof = getBusinessProofRequirement(businessStructure);

  return [
    {
      key: "business_details",
      label: "Business details",
      status: businessDetailsDone ? "done" : "missing",
    },
    {
      key: "identity",
      label: "Your identity",
      status: identityType ? (identityDone ? "done" : "missing") : "missing",
    },
    {
      key: "address",
      label: "Shop address",
      status: has("proof_of_address") ? "done" : "missing",
    },
    {
      key: "card_machine",
      label: "Card machine",
      status: has("terminal_proof") ? "done" : "missing",
    },
    {
      key: "shop_photo",
      label: "Shop photo",
      status: has("premises_photo") ? "done" : "missing",
    },
    {
      key: "business_document",
      label: "Business document",
      status: businessProof ? (has(businessProof.docType) ? "done" : "missing") : "not_needed",
    },
  ];
}

export function isApplicationComplete(items: readonly ChecklistItem[]): boolean {
  return items.every((i) => i.status !== "missing");
}
