import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a few minutes and try again.";

/**
 * Server-side sliding-window rate limit, backed by the
 * check_rate_limit() Postgres function (migration 20260726130000).
 * Must be called with the service-role client -- check_rate_limit is
 * deliberately not GRANTed to authenticated/anon, so a client can never
 * pass an arbitrary identifier to inspect or exhaust another user's
 * bucket. `identifier` should always come from the caller's own verified
 * auth context (userId), never from client-supplied input.
 */
export async function enforceRateLimit(
  supabaseAdmin: SupabaseClient<Database>,
  bucket: string,
  identifier: string,
  limit: { maxAttempts: number; windowSeconds: number },
): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_bucket: bucket,
    p_identifier: identifier,
    p_max_attempts: limit.maxAttempts,
    p_window_seconds: limit.windowSeconds,
  });
  if (error) throw new Error(error.message);
  if (data === false) throw new Error(RATE_LIMIT_MESSAGE);
}
