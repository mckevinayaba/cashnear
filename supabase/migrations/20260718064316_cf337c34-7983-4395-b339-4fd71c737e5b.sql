
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS full_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS mobile_number TEXT,
  ADD COLUMN IF NOT EXISTS id_document_type TEXT,
  ADD COLUMN IF NOT EXISTS id_document_number TEXT,
  ADD COLUMN IF NOT EXISTS id_document_path TEXT,
  ADD COLUMN IF NOT EXISTS selfie_path TEXT,
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

DROP POLICY IF EXISTS "Customers upload own docs" ON storage.objects;
CREATE POLICY "Customers upload own docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'customer-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Customers read own docs" ON storage.objects;
CREATE POLICY "Customers read own docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Customers update own docs" ON storage.objects;
CREATE POLICY "Customers update own docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'customer-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
