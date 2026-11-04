-- Follow-ups found while building a real-Postgres test harness (Nov 2026).
--
-- 1. check_rate_limit() was only REVOKEd from `authenticated`/`anon` in
--    20260726130000. Supabase grants new public functions to its API roles by
--    default, and Postgres also grants EXECUTE to PUBLIC, so any signed-in user
--    could still call it directly with someone else's user id and exhaust that
--    person's bucket (a lockout against, e.g., their verification submission).
--    Revoke from PUBLIC too, and grant only the service role explicitly.
--
-- 2. The Lovable-generated 20260726122730 replaced the hardened
--    log_audit_event from 20260718070400 with a weaker one that takes an
--    arbitrary first user_roles row as the actor role (so a super_admin who
--    also holds `customer` can be logged as `customer`) and accepts any action
--    string. Restore the hardened version.

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INT, INT) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_operator_document_rate_limit() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.log_audit_event(text, text, text, jsonb);
CREATE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role public.app_role;
  v_row public.audit_logs;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'log_audit_event requires an authenticated caller';
  END IF;

  IF p_action IS NULL OR p_action !~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$' THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;
  IF p_entity_type IS NULL OR length(trim(p_entity_type)) = 0 THEN
    RAISE EXCEPTION 'Invalid entity_type';
  END IF;

  -- Actor role is derived from the caller's real user_roles rows, never
  -- trusted from a parameter -- this is the anti-forgery property.
  SELECT role INTO v_actor_role FROM public.user_roles
    WHERE user_id = v_actor_id AND role = 'super_admin' LIMIT 1;
  IF v_actor_role IS NULL THEN
    SELECT role INTO v_actor_role FROM public.user_roles
      WHERE user_id = v_actor_id AND role = 'ops_admin' LIMIT 1;
  END IF;
  IF v_actor_role IS NULL THEN
    SELECT role INTO v_actor_role FROM public.user_roles
      WHERE user_id = v_actor_id
        AND role IN ('operator_owner', 'operator_manager', 'operator_cashier')
      ORDER BY role LIMIT 1;
  END IF;
  IF v_actor_role IS NULL THEN
    v_actor_role := 'customer';
  END IF;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (v_actor_id, v_actor_role, p_action, p_entity_type, p_entity_id, p_metadata)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb) TO authenticated;
