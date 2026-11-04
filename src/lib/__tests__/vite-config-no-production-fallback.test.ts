import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard: vite.config.ts previously hardcoded a real
// production Supabase URL and anon/publishable key as fallback values, so a
// staging/preview build with a missing env var would silently connect to
// production instead of failing. This checks the actual config source so it
// works without needing a DOM/build test environment (config-loading
// side-effects like `throw` at module scope don't lend themselves to a
// simple bun:test import).

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

  test("throws when a required Supabase env var is missing, instead of falling back", () => {
    expect(src).toMatch(/if\s*\(\s*missingVars\.length\s*>\s*0\s*\)/);
    expect(src).toContain("throw new Error(");
  });

  test("checks both VITE_SUPABASE_URL/SUPABASE_URL and the publishable key before proceeding", () => {
    expect(src).toMatch(/!supabaseUrl/);
    expect(src).toMatch(/!supabasePublishableKey/);
  });

  test("the thrown message names the missing variables but never a secret value", () => {
    const match = src.match(/throw new Error\(\s*`([^`]*)/);
    expect(match).not.toBeNull();
    const messageTemplate = match?.[1] ?? "";
    expect(messageTemplate).toContain("Missing required environment variable");
    expect(messageTemplate).not.toMatch(/eyJ|supabase\.co\/|service_role/i);
  });
});
