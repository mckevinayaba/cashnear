-- H-03: both storage buckets must exist, be private, and carry the
-- intended size/MIME limits purely as a result of replaying committed
-- migrations against a fresh database -- no manual dashboard setup.

BEGIN;
\ir _helpers.sql

DO $$
DECLARE
  v_bucket record;
BEGIN
  SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'operator-documents';
  IF NOT FOUND THEN
    PERFORM pg_temp.fail('operator-documents bucket does not exist after migration replay');
  ELSIF v_bucket.public IS TRUE THEN
    PERFORM pg_temp.fail('operator-documents bucket is public');
  ELSIF v_bucket.file_size_limit IS DISTINCT FROM 10485760 THEN
    PERFORM pg_temp.fail('operator-documents file_size_limit is not the expected 10 MiB');
  ELSE
    PERFORM pg_temp.pass('operator-documents bucket exists, is private, 10 MiB limit');
  END IF;

  SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'customer-documents';
  IF NOT FOUND THEN
    PERFORM pg_temp.fail('customer-documents bucket does not exist after migration replay');
  ELSIF v_bucket.public IS TRUE THEN
    PERFORM pg_temp.fail('customer-documents bucket is public');
  ELSIF v_bucket.file_size_limit IS DISTINCT FROM 10485760 THEN
    PERFORM pg_temp.fail('customer-documents file_size_limit is not the expected 10 MiB');
  ELSE
    PERFORM pg_temp.pass('customer-documents bucket exists, is private, 10 MiB limit');
  END IF;

  IF (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'operator-documents')
      @> ARRAY['application/pdf']::text[] THEN
    PERFORM pg_temp.pass('operator-documents allows application/pdf as expected');
  ELSE
    PERFORM pg_temp.fail('operator-documents allowed_mime_types missing application/pdf');
  END IF;

  -- Policy existence (created in migrations 3-4, unaffected by this
  -- remediation, re-asserted here for reproducibility confidence).
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('Owner uploads to own business folder', 'Owner reads own business files', 'Owner deletes own business files')) = 3
  THEN
    PERFORM pg_temp.pass('operator-documents storage.objects policies are present');
  ELSE
    PERFORM pg_temp.fail('one or more operator-documents storage.objects policies are missing');
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('Customers upload own docs', 'Customers read own docs', 'Customers update own docs')) = 3
  THEN
    PERFORM pg_temp.pass('customer-documents storage.objects policies are present');
  ELSE
    PERFORM pg_temp.fail('one or more customer-documents storage.objects policies are missing');
  END IF;
END $$;

ROLLBACK;
