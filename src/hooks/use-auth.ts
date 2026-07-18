import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  roles: AppRole[];
}

/**
 * useAuth — reactive Supabase session + role cache.
 * Roles are read from `public.user_roles` (RLS scopes to the caller).
 *
 * `isOperator` reflects role possession only (used for client-side routing
 * convenience) -- it does NOT mean the operator's business is approved or
 * currently active. Never gate a security-relevant decision on `isOperator`
 * alone; effective operator access additionally depends on
 * `operator_businesses.application_status` and `operator_staff.active`,
 * enforced at the RLS/server layer (see is_business_member and
 * trg_operator_businesses_status_sync).
 */
export function useAuth(): AuthState & {
  hasRole: (r: AppRole) => boolean;
  isAdmin: boolean;
  isOperator: boolean;
} {
  const [state, setState] = useState<AuthState>({
    loading: true,
    session: null,
    user: null,
    roles: [],
  });

  useEffect(() => {
    let cancelled = false;

    const applySession = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) setState({ loading: false, session: null, user: null, roles: [] });
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      if (cancelled) return;
      setState({
        loading: false,
        session,
        user: session.user,
        roles: (data ?? []).map((r) => r.role as AppRole),
      });
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const hasRole = (r: AppRole) => state.roles.includes(r);
  return {
    ...state,
    hasRole,
    isAdmin: hasRole("ops_admin") || hasRole("super_admin"),
    isOperator:
      hasRole("operator_owner") || hasRole("operator_manager") || hasRole("operator_cashier"),
  };
}
