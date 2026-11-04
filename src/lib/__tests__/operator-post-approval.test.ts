import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for the honest post-approval experience: an
// approved operator must never be told they are already live, must never be
// given a launch date, and must never see promised income/request volume.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("operator.dashboard.tsx post-approval experience", () => {
  const src = read("src/routes/_authenticated/operator.dashboard.tsx");

  test("shows the required heading and message for an approved business", () => {
    expect(src).toContain("Your business is approved");
    expect(src).toContain(
      "Cash requests are not open yet. We are preparing the first group of CashNear",
    );
    expect(src).toContain("will contact you before requests begin");
  });

  test("shows application-approved and documents-accepted confirmations", () => {
    expect(src).toMatch(/Application approved/);
    expect(src).toMatch(/Documents accepted/);
  });

  test("explains what happens next and how CashNear will make contact", () => {
    expect(src).toMatch(/What happens next/);
    // Tolerant of line wraps in the JSX source.
    expect(src).toMatch(/contact you using\s+the details on your application/);
  });

  test("gives a support contact for questions or updating details on file", () => {
    expect(src).toContain("mailto:support@cashnear.co");
  });

  test("never invents a launch date, promised income, or claims the business is already live", () => {
    expect(src).not.toMatch(
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+202\d\b/,
    );
    expect(src).not.toMatch(/\bR\d/); // no Rand amounts / promised earnings figures
    expect(src).not.toMatch(/you('re| are) now live|start earning|first request/i);
  });

  test('the approved branch is keyed strictly off application_status === "approved"', () => {
    expect(src).toMatch(/business\.application_status === "approved"/);
  });
});
