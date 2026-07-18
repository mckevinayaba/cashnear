-- H-03 remediation: neither storage bucket (operator-documents,
-- customer-documents) was ever created in a committed migration -- the RLS
-- policies in migrations 3-4 assumed the buckets already existed, privately,
-- with sane upload limits, but none of that was reproducible from version
-- control. A fresh environment created purely by replaying migrations had
-- no buckets at all until someone manually recreated them.
--
-- ON CONFLICT DO UPDATE makes this idempotent and self-correcting: safe to
-- run against a fresh project (creates the buckets) or the existing live
-- project (re-asserts the intended config without touching already-stored
-- objects, since only bucket-level metadata changes, not contents).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'operator-documents',
    'operator-documents',
    false,
    10485760, -- 10 MiB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  ),
  (
    'customer-documents',
    'customer-documents',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
