import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for a real bug found during authenticated
// staging QA: TanStack Router's dot-file convention makes admin.tsx the
// parent of admin.customers.tsx/admin.operators.tsx/admin.audit.tsx, and
// admin.operators.tsx the parent of admin.operators.$id.tsx. A parent route
// component that doesn't render <Outlet /> silently keeps showing its own
// content underneath a child route -- the URL, title, and beforeLoad guard
// all update correctly, but the child's UI never appears. This has no DOM
// test environment in this repo, so it's checked structurally like
// document-access.test.ts.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("admin layout routes render an Outlet for their file-based children", () => {
  test("admin.tsx (parent of customers/operators/audit) renders Outlet", () => {
    const src = read("src/routes/_authenticated/admin.tsx");
    expect(src).toContain("Outlet");
  });

  test("admin.operators.tsx (parent of operators.$id) renders Outlet", () => {
    const src = read("src/routes/_authenticated/admin.operators.tsx");
    expect(src).toContain("Outlet");
  });

  test("the admin dashboard and operator queue moved to index routes, not the layout files", () => {
    // The dashboard/queue UI must live where TanStack Router actually
    // renders it for the exact parent path (the index route), not in the
    // layout file itself -- otherwise this test's Outlet assertions above
    // would trivially pass while the real content still never renders.
    expect(read("src/routes/_authenticated/admin.index.tsx")).toContain("AdminHome");
    expect(read("src/routes/_authenticated/admin.operators.index.tsx")).toContain("AdminOperators");
  });
});
