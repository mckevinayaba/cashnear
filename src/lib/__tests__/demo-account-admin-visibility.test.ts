import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard: demo accounts must be visibly distinguishable
// in every admin surface that lists them, and excluded from the operational
// counts on the admin overview.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("demo accounts are distinguishable in admin and excluded from operational counts", () => {
  test("admin.customers.tsx badges the demo customer in both the list and the review dialog", () => {
    const src = read("src/routes/_authenticated/admin.customers.tsx");
    expect(src).toContain("DEMO_CUSTOMER_USER_ID");
    expect(src).toMatch(/c\.user_id === DEMO_CUSTOMER_USER_ID/);
  });

  test("admin.operators.index.tsx badges the demo operator in the queue list", () => {
    const src = read("src/routes/_authenticated/admin.operators.index.tsx");
    expect(src).toContain("DEMO_OPERATOR_OWNER_USER_ID");
    expect(src).toMatch(/b\.owner_id === DEMO_OPERATOR_OWNER_USER_ID/);
  });

  test("admin.operators.$id.tsx badges the demo operator on its detail/review page", () => {
    const src = read("src/routes/_authenticated/admin.operators.$id.tsx");
    expect(src).toContain("DEMO_OPERATOR_OWNER_USER_ID");
  });

  test("admin.index.tsx excludes both demo accounts from every operational count query", () => {
    const src = read("src/routes/_authenticated/admin.index.tsx");
    // Operator counts: excluded via the demo operator's owner id.
    expect(src).toMatch(/\.neq\("owner_id", DEMO_OPERATOR_OWNER_USER_ID\)/);
    // Customer counts: excluded via the demo customer's user id.
    expect(src).toMatch(/\.neq\("user_id", DEMO_CUSTOMER_USER_ID\)/);
  });
});
