
-- storage.objects policies for operator-documents bucket
-- Path convention: {business_id}/{doc_type}/{filename}

CREATE POLICY "Owner uploads to own business folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'operator-documents'
  AND EXISTS (
    SELECT 1 FROM public.operator_businesses b
    WHERE b.id::text = (storage.foldername(name))[1]
      AND b.owner_id = auth.uid()
  )
);

CREATE POLICY "Owner reads own business files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND (
    EXISTS (
      SELECT 1 FROM public.operator_businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = auth.uid()
    )
    OR public.is_admin(auth.uid())
  )
);

CREATE POLICY "Owner deletes own business files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'operator-documents'
  AND EXISTS (
    SELECT 1 FROM public.operator_businesses b
    WHERE b.id::text = (storage.foldername(name))[1]
      AND b.owner_id = auth.uid()
  )
);
