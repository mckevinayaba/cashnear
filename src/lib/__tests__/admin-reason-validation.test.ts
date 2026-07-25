import { describe, test, expect } from "bun:test";
import { isReasonRequired, isReasonValid, MIN_REASON_LENGTH } from "@/lib/admin-reason-validation";

// Client-side mirror of the server-side reason requirement enforced in
// admin.functions.ts (REASON_REQUIRED_DECISIONS / MIN_REASON_LENGTH). This
// proves the UI's ConfirmActionDialog will correctly disable submission
// for reject/suspend without a meaningful reason -- the server
// independently re-validates and is the real enforcement point (see
// admin.functions.ts's decisionSchema.superRefine), but a UI that let a
// user submit an empty reason and then get a confusing server error would
// be a poor (and duplicate-submission-prone) experience.

describe("isReasonRequired", () => {
  test("rejected requires a reason", () => {
    expect(isReasonRequired("rejected")).toBe(true);
  });
  test("suspended requires a reason", () => {
    expect(isReasonRequired("suspended")).toBe(true);
  });
  for (const decision of [
    "approved",
    "under_review",
    "info_requested",
    "site_verification_required",
    "deactivated",
    "pending",
  ]) {
    test(`${decision} does not require a reason`, () => {
      expect(isReasonRequired(decision)).toBe(false);
    });
  }
});

describe("isReasonValid", () => {
  test("approval is always valid regardless of reason text", () => {
    expect(isReasonValid("approved", "")).toBe(true);
    expect(isReasonValid("approved", "x")).toBe(true);
  });

  test("rejection with an empty reason is invalid", () => {
    expect(isReasonValid("rejected", "")).toBe(false);
  });
  test("rejection with a too-short reason is invalid", () => {
    expect(isReasonValid("rejected", "short")).toBe(false);
    expect("short".length).toBeLessThan(MIN_REASON_LENGTH);
  });
  test("rejection with a reason at exactly the minimum length is valid", () => {
    const reason = "a".repeat(MIN_REASON_LENGTH);
    expect(isReasonValid("rejected", reason)).toBe(true);
  });
  test("rejection reason is trimmed before length-checking (whitespace-only doesn't count)", () => {
    expect(isReasonValid("rejected", " ".repeat(20))).toBe(false);
  });
  test("suspension follows the same rule as rejection", () => {
    expect(isReasonValid("suspended", "")).toBe(false);
    expect(isReasonValid("suspended", "a".repeat(MIN_REASON_LENGTH))).toBe(true);
  });
});
