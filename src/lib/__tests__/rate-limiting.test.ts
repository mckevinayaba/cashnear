import { describe, test, expect, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enforceRateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function extractFunctionBody(src: string, name: string): string {
  const start = src.indexOf(`export const ${name} = createServerFn(`);
  expect(start).toBeGreaterThan(-1);
  const nextExport = src.indexOf("\nexport const ", start + 1);
  return nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);
}

function fakeSupabaseAdmin(result: { data?: boolean; error?: { message: string } | null }) {
  return {
    rpc: mock(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  } as unknown as Parameters<typeof enforceRateLimit>[0];
}

describe("enforceRateLimit", () => {
  test("allows the call through when the RPC reports under the limit", async () => {
    const supabaseAdmin = fakeSupabaseAdmin({ data: true });
    await expect(
      enforceRateLimit(supabaseAdmin, "some_bucket", "user-1", {
        maxAttempts: 5,
        windowSeconds: 60,
      }),
    ).resolves.toBeUndefined();
  });

  test("throws the plain-language rate-limit message once the RPC reports the limit is reached", async () => {
    const supabaseAdmin = fakeSupabaseAdmin({ data: false });
    await expect(
      enforceRateLimit(supabaseAdmin, "some_bucket", "user-1", {
        maxAttempts: 5,
        windowSeconds: 60,
      }),
    ).rejects.toThrow(RATE_LIMIT_MESSAGE);
  });

  test("does not reveal internal details in the thrown message", () => {
    expect(RATE_LIMIT_MESSAGE).not.toMatch(/supabase|sql|table|bucket/i);
  });

  test("propagates a genuine RPC/database error distinctly from a rate-limit denial", async () => {
    const supabaseAdmin = fakeSupabaseAdmin({ error: { message: "connection reset" } });
    await expect(
      enforceRateLimit(supabaseAdmin, "some_bucket", "user-1", {
        maxAttempts: 5,
        windowSeconds: 60,
      }),
    ).rejects.toThrow("connection reset");
  });

  test("calls the check_rate_limit RPC with the exact bucket/identifier/limit given", async () => {
    const rpc = mock(async () => ({ data: true, error: null }));
    const supabaseAdmin = { rpc } as unknown as Parameters<typeof enforceRateLimit>[0];
    await enforceRateLimit(supabaseAdmin, "customer_verification_submit", "user-42", {
      maxAttempts: 5,
      windowSeconds: 600,
    });
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_bucket: "customer_verification_submit",
      p_identifier: "user-42",
      p_max_attempts: 5,
      p_window_seconds: 600,
    });
  });
});

describe("rate limiting is wired into every sensitive server function ahead of its write", () => {
  test("submitCustomerVerification enforces a rate limit before the upsert", () => {
    const fn = extractFunctionBody(
      read("src/lib/customer.functions.ts"),
      "submitCustomerVerification",
    );
    const limitIndex = fn.indexOf("enforceRateLimit(");
    const writeIndex = fn.search(/\.upsert\(/);
    expect(limitIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeLessThan(writeIndex);
  });

  test("updateCustomerDocumentPath enforces a rate limit before persisting the new path", () => {
    const fn = extractFunctionBody(
      read("src/lib/customer.functions.ts"),
      "updateCustomerDocumentPath",
    );
    const limitIndex = fn.indexOf("enforceRateLimit(");
    const writeIndex = fn.search(/\.upsert\(/);
    expect(limitIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeLessThan(writeIndex);
  });

  test("upsertOperatorApplication enforces a rate limit before writing business content", () => {
    const fn = extractFunctionBody(
      read("src/lib/operators.functions.ts"),
      "upsertOperatorApplication",
    );
    const limitIndex = fn.indexOf("enforceRateLimit(");
    const writeIndex = fn.search(/contentFields/);
    expect(limitIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(limitIndex).toBeLessThan(writeIndex);
  });

  test("every admin mutation enforces a rate limit before its write", () => {
    const src = read("src/lib/admin.functions.ts");
    for (const name of [
      "reviewOperatorApplication",
      "reinstateOperator",
      "reviewCustomerVerification",
      "grantUserRole",
    ]) {
      const fn = extractFunctionBody(src, name);
      const limitIndex = fn.indexOf("enforceRateLimit(");
      const writeIndex = fn.search(/\.update\(\{|\.upsert\(/);
      expect(limitIndex).toBeGreaterThan(-1);
      expect(writeIndex).toBeGreaterThan(-1);
      expect(limitIndex).toBeLessThan(writeIndex);
    }
  });
});

describe("check_rate_limit database function (migration 20260726130000)", () => {
  const migration = read("supabase/migrations/20260726130000_rate_limiting.sql");

  test("defines the rate_limit_hits table with RLS enabled and no client grants", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.rate_limit_hits");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toMatch(/REVOKE ALL ON public\.rate_limit_hits FROM authenticated, anon/);
  });

  test("check_rate_limit is not directly callable by authenticated or anon clients", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.check_rate_limit\([^)]*\) FROM authenticated, anon/,
    );
    // Never explicitly granted back to a client-facing role anywhere in the file.
    expect(migration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.check_rate_limit.*TO (authenticated|anon)/,
    );
  });

  test("operator document uploads (a direct client insert, not a server function) are gated by a DB trigger", () => {
    expect(migration).toContain("CREATE TRIGGER trg_operator_documents_rate_limit");
    expect(migration).toMatch(/BEFORE INSERT ON public\.operator_documents/);
  });
});
