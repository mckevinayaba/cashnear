import { describe, test, expect } from "bun:test";
import {
  IDENTITY_DOCUMENT_TYPES,
  BUSINESS_STRUCTURE_TYPES,
  requiresImmigrationStatusDocument,
  getBusinessProofRequirement,
  getRequiredDocuments,
  getCompletionChecklist,
  isApplicationComplete,
  type IdentityDocumentType,
  type BusinessStructureType,
  type ChecklistBusinessFields,
} from "@/lib/operator-document-requirements";

const COMPLETE_BUSINESS: ChecklistBusinessFields = {
  legal_name: "Test Spaza (Pty) Ltd",
  trading_name: "Test Spaza",
  business_type: "spaza_shop",
  street_address: "1 Test Street",
  suburb: "Testville",
  city: "Johannesburg",
  province: "gauteng",
  postal_code: "2000",
  representative_name: "Jane Applicant",
  representative_id_number: "9001015800081",
  representative_mobile: "+27821234567",
  representative_email: "jane@example.test",
};

const INCOMPLETE_BUSINESS: ChecklistBusinessFields = {
  ...COMPLETE_BUSINESS,
  legal_name: null,
};

describe("requiresImmigrationStatusDocument — only passport holders need a separate status document", () => {
  test("South African ID path: no immigration-status document required", () => {
    expect(requiresImmigrationStatusDocument("sa_id")).toBe(false);
  });
  test("passport path: immigration-status document required", () => {
    expect(requiresImmigrationStatusDocument("passport")).toBe(true);
  });
  test("asylum-seeker path: the permit itself is the status evidence, no separate document required", () => {
    expect(requiresImmigrationStatusDocument("asylum_permit")).toBe(false);
  });
  test("refugee path: the permit itself is the status evidence, no separate document required", () => {
    expect(requiresImmigrationStatusDocument("refugee_permit")).toBe(false);
  });
  test("permanent-residence path: the permit itself is the status evidence, no separate document required", () => {
    expect(requiresImmigrationStatusDocument("permanent_residence_permit")).toBe(false);
  });
});

describe("getBusinessProofRequirement — every structure requires some business proof", () => {
  test("no structure selected yet: null (nothing to ask for)", () => {
    expect(getBusinessProofRequirement(null)).toBeNull();
  });

  test("registered company: business_registration doc type, required", () => {
    const req = getBusinessProofRequirement("registered_company");
    expect(req?.docType).toBe("business_registration");
    expect(req?.manualReview).toBe(false);
  });
  test("close corporation: business_registration doc type", () => {
    expect(getBusinessProofRequirement("close_corporation")?.docType).toBe("business_registration");
  });
  test("cooperative: business_registration doc type", () => {
    expect(getBusinessProofRequirement("cooperative")?.docType).toBe("business_registration");
  });

  test("partnership: requires proof (not the old no-proof-required default) via business_registration doc type", () => {
    const req = getBusinessProofRequirement("partnership");
    expect(req).not.toBeNull();
    expect(req?.docType).toBe("business_registration");
    expect(req?.label).toBe("Proof of partnership or business");
    expect(req?.manualReview).toBe(false);
  });

  test("sole trader: requires alternative trading proof (not the old no-proof-required default), never a CIPC-style label", () => {
    const req = getBusinessProofRequirement("sole_trader");
    expect(req).not.toBeNull();
    expect(req?.label).not.toMatch(/CIPC/i);
    expect(req?.label).not.toMatch(/registration/i);
    expect(req?.why).toMatch(/CIPC/i); // explains a CIPC doc is NOT required, doesn't demand one
  });

  test("other structure: requires proof, flagged for manual review, uses the 'other' doc type", () => {
    const req = getBusinessProofRequirement("other");
    expect(req).not.toBeNull();
    expect(req?.docType).toBe("other");
    expect(req?.manualReview).toBe(true);
  });

  test("every real business structure requires some proof -- none return null", () => {
    for (const structure of BUSINESS_STRUCTURE_TYPES) {
      expect(getBusinessProofRequirement(structure)).not.toBeNull();
    }
  });
});

describe("getRequiredDocuments — per-identity-path document card lists", () => {
  test("South African ID path: identity + the 3 always-required docs, no immigration-status card", () => {
    const docs = getRequiredDocuments({ identityType: "sa_id", businessStructure: "sole_trader" });
    const keys = docs.map((d) => d.key);
    expect(keys).toContain("identity");
    expect(keys).not.toContain("immigration_status");
    expect(keys).toContain("proof_of_address");
    expect(keys).toContain("terminal_proof");
    expect(keys).toContain("premises_photo");
  });

  test("passport path: includes the separate immigration-status document card with manual-review wording, no approval guarantee implied", () => {
    const docs = getRequiredDocuments({
      identityType: "passport",
      businessStructure: "sole_trader",
    });
    const immigration = docs.find((d) => d.key === "immigration_status");
    expect(immigration).toBeDefined();
    expect(immigration?.required).toBe(true);
    expect(immigration?.docType).toBe("immigration_status");
    expect(immigration?.why).toMatch(/check whether/i);
    expect(immigration?.why).not.toMatch(/guarantee|approved automatically|will be approved/i);
  });

  test("asylum-seeker path: no separate immigration-status card", () => {
    const docs = getRequiredDocuments({
      identityType: "asylum_permit",
      businessStructure: "sole_trader",
    });
    expect(docs.find((d) => d.key === "immigration_status")).toBeUndefined();
  });

  test("refugee path: no separate immigration-status card", () => {
    const docs = getRequiredDocuments({
      identityType: "refugee_permit",
      businessStructure: "sole_trader",
    });
    expect(docs.find((d) => d.key === "immigration_status")).toBeUndefined();
  });

  test("permanent-residence path: no separate immigration-status card, but an optional secondary passport card with its own doc type", () => {
    const docs = getRequiredDocuments({
      identityType: "permanent_residence_permit",
      businessStructure: "sole_trader",
    });
    expect(docs.find((d) => d.key === "immigration_status")).toBeUndefined();
    const optionalPassport = docs.find((d) => d.key === "prp_passport_optional");
    expect(optionalPassport).toBeDefined();
    expect(optionalPassport?.required).toBe(false);
    // Must NOT be "other" -- that doc type is also used by the "Other"
    // business structure's business-proof card, and uploadOperatorDocument
    // replaces every row of a given doc_type, so two different cards
    // sharing "other" would silently delete each other's upload.
    expect(optionalPassport?.docType).toBe("passport_supporting");
  });

  test("PRP optional-passport doc type never collides with the 'Other' business structure's business-proof doc type", () => {
    const docs = getRequiredDocuments({
      identityType: "permanent_residence_permit",
      businessStructure: "other",
    });
    const passportCard = docs.find((d) => d.key === "prp_passport_optional");
    const businessCard = docs.find((d) => d.key === "business_document");
    expect(passportCard?.docType).not.toBe(businessCard?.docType);
  });

  test("business-proof requirement is reflected in the card's `required` flag and varies by structure -- never absent once a structure is chosen", () => {
    const soleTrader = getRequiredDocuments({
      identityType: "sa_id",
      businessStructure: "sole_trader",
    });
    const partnership = getRequiredDocuments({
      identityType: "sa_id",
      businessStructure: "partnership",
    });
    const other = getRequiredDocuments({ identityType: "sa_id", businessStructure: "other" });
    const company = getRequiredDocuments({
      identityType: "sa_id",
      businessStructure: "registered_company",
    });

    for (const docs of [soleTrader, partnership, other, company]) {
      const card = docs.find((d) => d.key === "business_document");
      expect(card).toBeDefined();
      expect(card?.required).toBe(true);
    }
  });

  test("no business structure chosen yet: business-proof card present but not required", () => {
    const docs = getRequiredDocuments({ identityType: "sa_id", businessStructure: null });
    const card = docs.find((d) => d.key === "business_document");
    expect(card?.required).toBe(false);
  });

  test("every identity document type produces a non-empty document list", () => {
    for (const identityType of IDENTITY_DOCUMENT_TYPES) {
      const docs = getRequiredDocuments({ identityType, businessStructure: "sole_trader" });
      expect(docs.length).toBeGreaterThan(0);
    }
  });

  test("every business structure type is a valid input (no throw)", () => {
    for (const businessStructure of BUSINESS_STRUCTURE_TYPES) {
      expect(() =>
        getRequiredDocuments({ identityType: "sa_id", businessStructure }),
      ).not.toThrow();
    }
  });
});

describe("getCompletionChecklist / isApplicationComplete — required-document completeness", () => {
  test("nothing uploaded, no identity/structure chosen yet: everything missing (except business document, not-needed)", () => {
    const checklist = getCompletionChecklist({
      business: INCOMPLETE_BUSINESS,
      identityType: null,
      businessStructure: null,
      uploadedDocTypes: [],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "identity")?.status).toBe("missing");
    expect(checklist.find((i) => i.key === "business_document")?.status).toBe("not_needed");
  });

  test("sole trader is incomplete without alternative trading proof (corrected policy -- sole trader is no longer exempt)", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "sole_trader",
      uploadedDocTypes: ["id_document", "proof_of_address", "terminal_proof", "premises_photo"],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "business_document")?.status).toBe("missing");
  });

  test("sole trader complete once alternative trading proof (business_registration doc type) is uploaded", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "sole_trader",
      uploadedDocTypes: [
        "id_document",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "business_registration",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(true);
  });

  test("partnership is incomplete without its proof (corrected policy -- partnership is no longer exempt)", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "partnership",
      uploadedDocTypes: ["id_document", "proof_of_address", "terminal_proof", "premises_photo"],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "business_document")?.status).toBe("missing");
  });

  test("partnership complete once its proof (business_registration doc type) is uploaded", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "partnership",
      uploadedDocTypes: [
        "id_document",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "business_registration",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(true);
  });

  test("'Other' structure is incomplete without its business-proof document", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "other",
      uploadedDocTypes: ["id_document", "proof_of_address", "terminal_proof", "premises_photo"],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "business_document")?.status).toBe("missing");
  });

  test("'Other' structure complete once its business-proof document ('other' doc type) is uploaded", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "other",
      uploadedDocTypes: [
        "id_document",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "other",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(true);
  });

  test("missing-document submission rejection: a registered company missing its business-registration doc is incomplete", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "registered_company",
      uploadedDocTypes: ["id_document", "proof_of_address", "terminal_proof", "premises_photo"],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "business_document")?.status).toBe("missing");
  });

  test("complete once the business-registration document is also uploaded", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "registered_company",
      uploadedDocTypes: [
        "id_document",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "business_registration",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(true);
  });

  test("passport applicant missing the immigration-status document is incomplete even with every other document uploaded", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "passport",
      businessStructure: "sole_trader",
      uploadedDocTypes: [
        "id_document",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "business_registration",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "identity")?.status).toBe("missing");
  });

  test("passport applicant complete once both the passport and the immigration-status document are uploaded", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "passport",
      businessStructure: "sole_trader",
      uploadedDocTypes: [
        "id_document",
        "immigration_status",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "business_registration",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(true);
  });

  test("incomplete business details block completion even when every document is uploaded", () => {
    const checklist = getCompletionChecklist({
      business: INCOMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "sole_trader",
      uploadedDocTypes: [
        "id_document",
        "proof_of_address",
        "terminal_proof",
        "premises_photo",
        "business_registration",
      ],
    });
    expect(isApplicationComplete(checklist)).toBe(false);
    expect(checklist.find((i) => i.key === "business_details")?.status).toBe("missing");
  });

  test("applicant checklist rendering: never exposes a raw enum -- every status is one of the three plain values", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "registered_company",
      uploadedDocTypes: [],
    });
    for (const item of checklist) {
      expect(["done", "missing", "not_needed"]).toContain(item.status);
      // Labels are the plain human strings from the task spec, not enum keys.
      expect(item.label).not.toMatch(/_/);
    }
  });

  test("applicant checklist rendering: exactly the six rows the spec calls for, in order", () => {
    const checklist = getCompletionChecklist({
      business: COMPLETE_BUSINESS,
      identityType: "sa_id",
      businessStructure: "sole_trader",
      uploadedDocTypes: [],
    });
    expect(checklist.map((i) => i.label)).toEqual([
      "Business details",
      "Your identity",
      "Shop address",
      "Card machine",
      "Shop photo",
      "Business document",
    ]);
  });
});
