import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for the public /health endpoint. Live-verified
// separately in the browser (see the implementation report) -- this locks
// down the properties that matter for a public, unauthenticated route:
// never leaking internal details, and never using the service-role key.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("/health endpoint", () => {
  const src = read("src/routes/health.ts");

  test("is registered at /health with a GET handler", () => {
    expect(src).toContain('createFileRoute("/health")');
    expect(src).toMatch(/GET:\s*async/);
  });

  test("reports only status/version/timestamp/supabase -- never DB internals", () => {
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/customer_profiles|operator_businesses|operator_documents/);
    expect(src).not.toMatch(/\.stack\b/);
  });

  test("never echoes a raw error message or exception detail into the response", () => {
    // The catch branches must return a fixed, generic body -- not `String(err)`,
    // `err.message`, or similar.
    expect(src).not.toMatch(/catch\s*\(\s*(err|error|e)\s*\)\s*\{[^}]*\1/s);
  });

  test('fails to "not_configured" rather than throwing when Supabase env vars are absent', () => {
    expect(src).toContain('"not_configured"');
    expect(src).toMatch(/if\s*\(\s*!url\s*\|\|\s*!key\s*\)/);
  });

  test("degraded/unreachable Supabase still returns a non-200 status, not a silent 200", () => {
    expect(src).toMatch(/status:\s*status\s*===\s*"ok"\s*\?\s*200\s*:\s*503/);
  });
});
