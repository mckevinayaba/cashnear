-- Operator verification completion (Stage 1 gap closure): the applicant-
-- facing registration form had no document upload path and only a single
-- generic "SA ID number" field, with no way to represent a foreign
-- national's identity/immigration-status documents. This migration adds
-- the structured columns needed to support South African ID, passport,
-- asylum seeker permit, refugee ID/permit, and permanent residence permit
-- applicants, plus a business-structure field to drive conditional
-- document requirements (e.g. business registration document only for
-- registered companies/CCs/cooperatives, not sole traders).
--
-- Additive only: new enum types, new nullable columns on the existing
-- operator_businesses table. No existing column, constraint, or row is
-- touched. Existing rows simply have NULL in the new columns until the
-- applicant (re-)submits.

CREATE TYPE public.identity_document_type AS ENUM (
  'sa_id',
  'passport',
  'asylum_permit',
  'refugee_permit',
  'permanent_residence_permit'
);

CREATE TYPE public.business_structure_type AS ENUM (
  'sole_trader',
  'registered_company',
  'close_corporation',
  'partnership',
  'cooperative',
  'other'
);

ALTER TABLE public.operator_businesses
  ADD COLUMN representative_id_type public.identity_document_type,
  ADD COLUMN representative_id_country TEXT,
  ADD COLUMN representative_id_expiry DATE,
  ADD COLUMN representative_immigration_status_type TEXT,
  ADD COLUMN representative_immigration_status_number TEXT,
  ADD COLUMN representative_immigration_status_expiry DATE,
  ADD COLUMN business_structure public.business_structure_type;

COMMENT ON COLUMN public.operator_businesses.representative_id_type IS
  'Which identity document the representative uses. Drives which fields/documents the applicant-facing form requires -- see src/lib/operator-document-requirements.ts.';
COMMENT ON COLUMN public.operator_businesses.representative_id_country IS
  'Country of issue (passport) or country of origin (asylum/refugee/permanent residence). Not applicable for sa_id.';
COMMENT ON COLUMN public.operator_businesses.representative_id_expiry IS
  'Expiry date of the primary identity document. May be null where the document type has no expiry (e.g. some refugee documents).';
COMMENT ON COLUMN public.operator_businesses.representative_immigration_status_type IS
  'Free-text description of the separate immigration-status document (e.g. work/business visa) required only for passport holders -- the actual permitted category list is a founder/legal decision, not encoded here (see docs).';
COMMENT ON COLUMN public.operator_businesses.representative_immigration_status_number IS
  'Document number of the separate immigration-status document (passport holders only).';
COMMENT ON COLUMN public.operator_businesses.representative_immigration_status_expiry IS
  'Expiry date of the separate immigration-status document (passport holders only).';
COMMENT ON COLUMN public.operator_businesses.business_structure IS
  'Legal structure of the business (sole trader, registered company, etc). Distinct from the free-text business_type field (which describes the kind of business, e.g. "spaza shop") -- business_structure is what drives whether a business-registration document is required.';

-- C-02's column-level UPDATE grant (migration 20260718070100) must be
-- extended to cover these new applicant-editable fields, or an applicant
-- editing their draft would silently fail to save them (INSERT already
-- works table-wide; only UPDATE is column-restricted). GRANT UPDATE
-- (columns) is additive -- this does not reset or replace the existing
-- column grant list.
GRANT UPDATE (
  representative_id_type, representative_id_country, representative_id_expiry,
  representative_immigration_status_type, representative_immigration_status_number,
  representative_immigration_status_expiry, business_structure
) ON public.operator_businesses TO authenticated;
