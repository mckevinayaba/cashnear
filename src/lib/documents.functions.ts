import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const ALLOWED_BUCKETS = new Set(["operator-documents", "customer-documents"]);
const SIGNED_URL_TTL_SECONDS = 120;

const signedUrlSchema = z.object({
  bucket: z.enum(["operator-documents", "customer-documents"]),
  path: z.string().trim().min(1).max(500),
});

async function assertAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  if (!roles.includes("ops_admin") && !roles.includes("super_admin")) {
    throw new Error("Forbidden");
  }
}

/**
 * Admin-only: generate a short-lived signed URL to view a private document
 * (an operator's uploaded business document, or a customer's ID/selfie).
 * Never returns a permanent public URL, never exposes the service-role key
 * to the browser -- the signed URL itself is the only thing that crosses
 * the network, and it expires in SIGNED_URL_TTL_SECONDS.
 *
 * Storage RLS already permits an admin to read any object in either bucket
 * directly (both buckets' SELECT policies OR-in is_admin(auth.uid())), so
 * this function's only real job is deriving that authorization server-side
 * from the verified session -- not inventing new access that RLS doesn't
 * already grant.
 */
export const getSignedDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => signedUrlSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    if (!ALLOWED_BUCKETS.has(data.bucket)) {
      throw new Error("Unsupported bucket.");
    }
    // Defence in depth against a path that tries to climb out of its
    // bucket via traversal segments -- Storage itself wouldn't resolve
    // these, but reject outright rather than rely on that alone.
    if (data.path.includes("..")) {
      throw new Error("Invalid document path.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrl(data.path, SIGNED_URL_TTL_SECONDS);
    if (error) throw new Error(error.message);
    if (!signed?.signedUrl) throw new Error("Could not generate a signed URL for this document.");

    return { url: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
  });
