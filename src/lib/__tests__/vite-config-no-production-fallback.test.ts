import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard. vite.config.ts once hardcoded a real production
// Supabase URL and anon key as fallback values, so a staging or preview build
// with a missing env var would silently connect to production.
//
// The fix is "no fallback, ever". It is NOT "throw at config load": Lovable's
// managed build wraps this config and injects env after it loads, so throwing
// here broke managed builds (see AGENTS.md). The config warns instead, and the
// Supabase client fails loudly the first time it is used without values.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("vite.config.ts has no production Supabase fallback", () => {
  const src = read("vite.config.ts");

  test("does not contain the previously-hardcoded production project ref", () => {
    expect(src).not.toContain("cfwylchvtfwtqhfwoefm");
  });

  test("does not contain a hardcoded JWT-shaped fallback key literal", () => {
    // A real anon key is a three-dot-separated base64url JWT; a hardcoded
    // literal of that shape anywhere in this file is exactly the pattern
    // being guarded against, whatever project it happens to belong to.
    expect(src).not.toMatch(
      /["']eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}["']/,
    );
  });

  test("hardcodes no Supabase URL of any project", () => {
    expect(src).not.toMatch(/[a-z0-9]{20}\.supabase\.co/);
  });
});

describe("a missing Supabase variable is reported without breaking managed builds", () => {
  const src = read("vite.config.ts");

  test("the config warns instead of throwing at load time", () => {
    expect(src).toContain("console.warn(");
    expect(src).not.toContain("throw new Error(");
  });

  test("the warning names the missing variables but never prints a value", () => {
    const warn = src.slice(src.indexOf("console.warn("));
    expect(warn).toContain("missingVars.join");
    expect(warn).not.toMatch(/env\.VITE_SUPABASE|process\.env/);
  });

  test("the Supabase client still fails loudly at runtime when values are absent", () => {
    const client = read("src/integrations/supabase/client.ts");
    expect(client).toContain("Missing Supabase environment variable(s)");
    expect(client).toMatch(/throw new Error\(message\)/);
  });

  test("the rule is recorded for future contributors", () => {
    expect(read("AGENTS.md")).toMatch(/vite\.config\.ts must never throw on missing Supabase env/);
  });
});
