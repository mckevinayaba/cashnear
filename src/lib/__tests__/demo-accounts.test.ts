import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEMO_CUSTOMER_USER_ID,
  DEMO_OPERATOR_OWNER_USER_ID,
  isDemoUserId,
} from "@/lib/demo-accounts";

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

describe("demo-accounts allow-list", () => {
  test("isDemoUserId recognises exactly the two known demo ids and nothing else", () => {
    expect(isDemoUserId(DEMO_CUSTOMER_USER_ID)).toBe(true);
    expect(isDemoUserId(DEMO_OPERATOR_OWNER_USER_ID)).toBe(true);
    expect(isDemoUserId("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isDemoUserId("")).toBe(false);
  });
});

describe("resetDemoAccount is safely scoped (demo-admin.functions.ts)", () => {
  const src = read("src/lib/demo-admin.functions.ts");
  const fn = extractFunctionBody(src, "resetDemoAccount");

  test("takes a fixed target enum, never a client-supplied user id", () => {
    expect(src).toMatch(/z\.object\(\{\s*target:\s*z\.enum\(\["customer", "operator"\]\)/);
    expect(fn).not.toMatch(/target_user_id|user_id:\s*data\./);
  });

  test("requires super_admin before doing anything", () => {
    const guardIndex = fn.indexOf("assertSuperAdmin(");
    const writeIndex = fn.search(/\.delete\(\)/);
    expect(guardIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(writeIndex);
  });

  test("refuses to target the calling admin's own account", () => {
    expect(fn).toMatch(/userId === targetUserId/);
    expect(fn).toContain("Demo controls cannot target your own account.");
  });

  test("resolves the target through the hardcoded demo-account constants only", () => {
    expect(fn).toMatch(/DEMO_CUSTOMER_USER_ID\s*:\s*DEMO_OPERATOR_OWNER_USER_ID/);
  });

  test("is rate-limited like every other admin mutation", () => {
    expect(fn).toContain("enforceRateLimit(");
  });

  test("audit-logs the reset", () => {
    expect(fn).toContain("p_action: `demo.reset.${data.target}`");
  });
});

describe("DemoControls UI never accepts an arbitrary user id from the client", () => {
  const src = read("src/routes/_authenticated/admin.index.tsx");

  test('the reset call only ever sends target: "customer" | "operator"', () => {
    expect(src).toMatch(/reset\(\{\s*data:\s*\{\s*target:\s*pending\s*\}\s*\}\)/);
  });

  test("demo controls are rendered only for super_admin", () => {
    expect(src).toMatch(/auth\.hasRole\("super_admin"\)\s*\?\s*<DemoControls/);
  });
});
