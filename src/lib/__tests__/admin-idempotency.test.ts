import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for a real gap found during authenticated
// staging QA: a rapid double-click fired two POST requests to
// reviewCustomerVerification, and only client-side busy-state disabling
// stood between that and a duplicate mutation / duplicate audit_logs row.
// The server must be the source of truth for idempotency, not the client.
// This repo has no DB test harness for bun:test (the SQL suite covers live
// DB behaviour separately, see supabase/tests/), so -- like
// document-access.test.ts -- this checks the source directly for the
// early-return no-op guard, keyed on comparing the current status to the
// requested one before any write happens.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("admin review functions are idempotent against duplicate submissions", () => {
  const src = read("src/lib/admin.functions.ts");

  test("reviewOperatorApplication short-circuits when already at the target status", () => {
    const fn = extractFunctionBody(src, "reviewOperatorApplication");
    expect(fn).toMatch(/current\.application_status\s*===\s*data\.decision/);
    // The idempotency check must come before the mutating .update() write,
    // not after -- otherwise it can't prevent the duplicate write. (Not
    // indexOf("supabaseAdmin") -- that client is also imported earlier, for
    // the per-admin rate limit check, so its first mention alone no longer
    // marks where the write itself begins.)
    const guardIndex = fn.search(/current\.application_status\s*===\s*data\.decision/);
    const updateIndex = fn.search(/\.update\(\{/);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(updateIndex);
  });

  test("reviewCustomerVerification short-circuits when already at the target status", () => {
    const fn = extractFunctionBody(src, "reviewCustomerVerification");
    expect(fn).toMatch(/current\.verification_status\s*===\s*data\.decision/);
    const guardIndex = fn.search(/current\.verification_status\s*===\s*data\.decision/);
    const updateIndex = fn.search(/\.update\(\{/);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(updateIndex);
  });

  test("the idempotent no-op path does not touch verification_reviews or audit_logs", () => {
    // A narrower slice: from the guard's `return` to the mutating write
    // shouldn't reach into the mutation/audit code that follows it.
    const fn = extractFunctionBody(src, "reviewOperatorApplication");
    const guardBlock = fn.slice(
      fn.search(/current\.application_status\s*===\s*data\.decision/),
      fn.search(/\.update\(\{/),
    );
    expect(guardBlock).not.toContain("verification_reviews");
    expect(guardBlock).not.toContain("log_audit_event");
  });
});

/** Grabs the source from `export const <name> = createServerFn(` up to the matching closing `});`. */
function extractFunctionBody(src: string, name: string): string {
  const start = src.indexOf(`export const ${name} = createServerFn(`);
  expect(start).toBeGreaterThan(-1);
  const nextExport = src.indexOf("\nexport const ", start + 1);
  return nextExport === -1 ? src.slice(start) : src.slice(start, nextExport);
}
