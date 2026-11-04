import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Minimal public health endpoint for uptime monitoring. Deliberately
 * reports only: reachability, a build/version identifier if one is
 * configured, a timestamp, and whether Supabase itself is reachable --
 * never a DB URL, project ref, key, table name, row count, or stack
 * trace. On any internal failure this still returns a plain "error"
 * body rather than leaking exception details.
 */

async function checkSupabaseReachable(): Promise<"reachable" | "unreachable" | "not_configured"> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return "not_configured";

  try {
    // GoTrue's own health endpoint -- a standard, documented, unauthenticated
    // Supabase Auth route meant exactly for this kind of check. It confirms
    // the configured project is actually reachable without touching any
    // application table.
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "reachable" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const supabase = await checkSupabaseReachable();
          const status = supabase === "unreachable" ? "degraded" : "ok";
          return Response.json(
            {
              status,
              version: process.env.APP_VERSION ?? "unknown",
              timestamp: new Date().toISOString(),
              supabase,
            },
            { status: status === "ok" ? 200 : 503 },
          );
        } catch {
          return Response.json(
            { status: "error", timestamp: new Date().toISOString() },
            { status: 503 },
          );
        }
      },
    },
  },
});
