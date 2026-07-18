-- H-01 remediation: migration 20260718061532 revoked EXECUTE on has_role,
-- is_admin, is_business_member, and handle_new_user from
-- PUBLIC/anon/authenticated. RLS policy evaluation runs as the querying
-- role and requires EXECUTE on any function a policy branch calls,
-- independent of SECURITY DEFINER (which only changes whose privileges the
-- function body runs WITH, not whether it may be called at all). Every
-- non-owner RLS branch that reaches has_role/is_admin/is_business_member
-- (staff reads, admin reads via the RLS-scoped client, super_admin writes,
-- the verification_reviews insert inside reviewOperatorApplication) would
-- raise permission-denied instead of a clean allow/deny for `authenticated`.
--
-- Re-grant exactly the three functions RLS policies depend on. Deliberately
-- NOT re-granting handle_new_user: it is an AFTER INSERT ON auth.users
-- trigger function, invoked by the trigger manager rather than by direct
-- client SQL, so the revoke on it is harmless and should stay in place (no
-- one should ever be able to call it directly via RPC). Also deliberately
-- NOT re-granting to anon/PUBLIC: every policy that calls these functions is
-- scoped `TO authenticated`, so anon never needs to invoke them.
--
-- Residual, explicitly accepted risk: re-granting EXECUTE to `authenticated`
-- also makes these callable directly via supabase.rpc(), which is a bounded,
-- low-severity role-probing surface (boolean result, requires an
-- already-known target UUID, no enumeration). The fully robust fix (moving
-- these into a non-API-exposed schema) requires rewriting every policy that
-- references them by qualified name and is out of this remediation's scope;
-- see docs/STAGE1_SECURITY_REMEDIATION_PLAN.md (H-01) and the completion
-- report for the reasoning.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO authenticated;
