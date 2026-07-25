import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isAuthorizedAdmin, type AppRole } from "@/lib/admin-authorization";

export type { AppRole };
export { isAuthorizedAdmin };

async function getSessionRoles(): Promise<{ userId: string; roles: AppRole[] } | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return null;
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id);
  if (error) throw error;
  return { userId: session.user.id, roles: (roleRows ?? []).map((r) => r.role as AppRole) };
}

/**
 * beforeLoad guard for admin routes -- runs before the route renders, not
 * after a first paint, and redirects safely rather than showing protected
 * content momentarily. This is a UX-layer safeguard for render timing: the
 * actual security boundary remains server-side (every admin mutation
 * independently re-derives the caller's role via assertAdmin) and at the
 * database layer (RLS on every table these pages read). This guard reads
 * the same user_roles source of truth those already check -- it does not
 * duplicate or replace that enforcement, only moves the UI-level check
 * earlier in the route lifecycle.
 */
export async function requireAdminBeforeLoad(opts?: { requireSuperAdmin?: boolean }) {
  const session = await getSessionRoles();
  if (!session) {
    throw redirect({ to: "/auth" });
  }
  if (!isAuthorizedAdmin(session.roles, opts)) {
    throw redirect({ to: "/access-denied" });
  }
  return { userId: session.userId, roles: session.roles };
}
