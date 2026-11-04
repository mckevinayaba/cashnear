
-- Enums
-- Made idempotent (Nov 2026): these types are also created by
-- 20260718100000_operator_identity_document_fields.sql, so replaying the
-- chain on a fresh database failed here. No effect on databases that already
-- applied this file.
DO $$ BEGIN
  CREATE TYPE public.identity_document_type AS ENUM (
    'sa_id','passport','asylum_permit','refugee_permit','permanent_residence_permit'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.business_structure_type AS ENUM (
    'sole_trader','registered_company','close_corporation','partnership','cooperative','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend document_type enum
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'immigration_status';
ALTER TYPE public.document_type ADD VALUE IF NOT EXISTS 'passport_supporting';

-- New columns on operator_businesses
ALTER TABLE public.operator_businesses
  ADD COLUMN IF NOT EXISTS business_structure public.business_structure_type,
  ADD COLUMN IF NOT EXISTS representative_id_type public.identity_document_type,
  ADD COLUMN IF NOT EXISTS representative_id_country text,
  ADD COLUMN IF NOT EXISTS representative_id_expiry date,
  ADD COLUMN IF NOT EXISTS representative_immigration_status_type text,
  ADD COLUMN IF NOT EXISTS representative_immigration_status_number text,
  ADD COLUMN IF NOT EXISTS representative_immigration_status_expiry date;

-- Audit event RPC
-- Dropped first because CREATE OR REPLACE cannot change a return type, and the
-- hardened version from 20260718070400 returns audit_logs, not uuid. The
-- hardened version is restored by the next hardening migration.
DROP FUNCTION IF EXISTS public.log_audit_event(text, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_id uuid;
BEGIN
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_actor LIMIT 1;
  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (v_actor, v_role, p_action, p_entity_type, p_entity_id, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb) TO authenticated, service_role;
