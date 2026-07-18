-- H-02 remediation: the audit_logs INSERT policy constrained actor_id but
-- not actor_role/action/entity_type/metadata, so any authenticated user
-- could write a fabricated record (e.g. actor_role: 'super_admin'). Make
-- audit_logs append-only and trusted: no direct table INSERT for
-- `authenticated`; the only write path is a SECURITY DEFINER function that
-- derives actor identity and role exclusively from the server-verified
-- session, never from a caller-supplied value.

REVOKE INSERT ON public.audit_logs FROM authenticated;
DROP POLICY IF EXISTS "Authenticated inserts audit log for self" ON public.audit_logs;

-- UPDATE/DELETE were never granted to authenticated (only SELECT, then
-- INSERT which is now revoked above) -- confirmed unchanged: ordinary users
-- still cannot update or delete audit rows.

CREATE OR REPLACE FUNCTION public.log_audit_event(
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
  -- trusted from a parameter -- this is the actual anti-forgery property.
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

-- Safe to expose broadly: the function can only ever attribute an entry to
-- the true caller and their real role, never to someone else.
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, text, jsonb) TO authenticated;
