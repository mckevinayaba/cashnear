import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for a real gap found during authenticated
// staging QA: the customer verification review dialog was a hand-rolled
// `<div className="fixed inset-0 ...">` overlay with no role="dialog", no
// aria-modal, no focus trap, no initial focus, and Escape did not close
// it. It's now built on the same Radix Dialog primitive as
// ConfirmActionDialog, which provides all of that for free. This repo has
// no DOM test environment for bun:test, so -- like document-access.test.ts
// -- this checks the source directly rather than rendering.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("the customer review dialog uses the accessible Radix Dialog primitive", () => {
  const src = read("src/routes/_authenticated/admin.customers.tsx");

  test("imports Dialog/DialogContent/DialogTitle from the shared ui/dialog wrapper", () => {
    expect(src).toMatch(/from ["']@\/components\/ui\/dialog["']/);
    expect(src).toContain("DialogContent");
    expect(src).toContain("DialogTitle");
  });

  test("every rendered dialog has a DialogTitle (Radix requires this for aria-labelledby)", () => {
    const dialogContentCount = (src.match(/<DialogContent\b/g) ?? []).length;
    const dialogTitleCount = (src.match(/<DialogTitle\b/g) ?? []).length;
    expect(dialogContentCount).toBeGreaterThan(0);
    expect(dialogTitleCount).toBeGreaterThanOrEqual(dialogContentCount);
  });

  test("the old hand-rolled fixed-overlay pattern is gone", () => {
    expect(src).not.toMatch(/fixed inset-0[^"]*bg-black\/60/);
  });

  test("dialog visibility is controlled (open/onOpenChange), not conditionally mounted", () => {
    // A conditionally-mounted dialog (`{selected ? <Dialog/> : null}`) can't
    // play Radix's close/focus-restore lifecycle correctly -- open state
    // must be a prop Radix's Root controls, not whether the tree exists.
    expect(src).toMatch(/<Dialog\s+open=\{/);
    expect(src).toMatch(/onOpenChange=\{/);
  });
});
