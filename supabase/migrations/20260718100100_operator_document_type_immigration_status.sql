-- Adds the one new document_type enum value needed for the operator
-- verification completion: the separate immigration-status document
-- (e.g. work/business visa) that passport-holding representatives must
-- upload in addition to their passport itself. Kept as its own migration
-- file, deliberately not combined with anything that uses this value in
-- the same file -- Postgres does not allow a newly added enum value to be
-- referenced by a statement in the same transaction that added it.
--
-- All other identity documents (SA ID, passport itself, asylum permit,
-- refugee document, permanent residence permit) reuse the existing
-- 'id_document' value, since they all represent "the applicant's primary
-- identity/status document" -- no new value needed for those.

ALTER TYPE public.document_type ADD VALUE 'immigration_status';
