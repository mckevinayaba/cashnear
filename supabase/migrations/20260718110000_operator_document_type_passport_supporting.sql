-- Release-correction fix: the Permanent Residence Permit applicant's
-- optional secondary-passport upload and a "business structure: Other"
-- applicant's business-proof upload both reused doc_type 'other'. Since
-- uploadOperatorDocument deletes every existing row for a given
-- (business_id, doc_type) pair before inserting a replacement, an
-- applicant who is BOTH a PRP holder AND has business_structure 'other'
-- would have one of the two uploads silently delete the other. Giving the
-- PRP optional-passport upload its own doc_type removes the collision
-- entirely, rather than relying on the two conditions never coinciding.
--
-- ALTER TYPE ... ADD VALUE must be isolated in its own migration/transaction,
-- separate from any statement that uses the new value (matches the pattern
-- already used for 'immigration_status' in
-- 20260718100100_operator_document_type_immigration_status.sql).

ALTER TYPE public.document_type ADD VALUE 'passport_supporting';
