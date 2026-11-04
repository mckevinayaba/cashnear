import { supabase } from "@/integrations/supabase/client";
import type { AdminRequestRow, AdminShopRow, AdminSummary } from "@/lib/cash-admin";

/**
 * Thin wrappers over the team's management functions. Who may call them is
 * decided in the database: anyone who is not an admin is refused there.
 */

function fail(message: string): never {
  if (message === "forbidden") throw new Error("You do not have access to this.");
  if (message === "invalid_status") throw new Error("That status is not one we know.");
  throw new Error("We could not load this. Please try again.");
}

export async function adminSummary(days: number): Promise<AdminSummary> {
  const { data, error } = await supabase.rpc("cash_admin_summary", { p_days: days });
  if (error) fail(error.message);
  return data as unknown as AdminSummary;
}

export async function adminShops(days: number): Promise<AdminShopRow[]> {
  const { data, error } = await supabase.rpc("cash_admin_shops", { p_days: days });
  if (error) fail(error.message);
  return data as unknown as AdminShopRow[];
}

export interface LedgerFilters {
  status: string | null;
  search: string | null;
  from: string | null;
}

export async function adminLedger(
  f: LedgerFilters & { limit: number; offset: number; exportIt?: boolean },
): Promise<{ total: number; rows: AdminRequestRow[] }> {
  const { data, error } = await supabase.rpc("cash_admin_requests", {
    p_status: f.status as string,
    p_search: f.search as string,
    p_from: f.from as string,
    p_limit: f.limit,
    p_offset: f.offset,
    p_export: f.exportIt ?? false,
  });
  if (error) fail(error.message);
  return data as unknown as { total: number; rows: AdminRequestRow[] };
}
