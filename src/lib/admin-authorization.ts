import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * Pure, dependency-free authorization check -- given a role list, does it
 * satisfy admin (or super_admin-specifically) access? Deliberately kept
 * free of any Supabase client import (unlike admin-route-guard.ts, which
 * wraps this for actual route use) so it can be unit-tested without
 * pulling in the real client and its DOM-fetch-typed dependencies.
 */
export function isAuthorizedAdmin(
  roles: readonly AppRole[],
  opts?: { requireSuperAdmin?: boolean },
): boolean {
  if (opts?.requireSuperAdmin) return roles.includes("super_admin");
  return roles.includes("ops_admin") || roles.includes("super_admin");
}
