import { describe, test, expect } from "bun:test";
import { canSubmitAction } from "@/components/admin/ConfirmActionDialog";

// Proves duplicate-submission prevention and reason-required gating at the
// logic level: the confirm button in ConfirmActionDialog is wired directly
// to this function's return value.

describe("canSubmitAction", () => {
  test("disabled while a request is already in flight (prevents duplicate submission)", () => {
    expect(canSubmitAction({ reason: "", busy: true })).toBe(false);
    expect(
      canSubmitAction({ reason: "a sufficiently long reason", busy: true, requireReason: true }),
    ).toBe(false);
  });

  test("enabled with no reason requirement and not busy", () => {
    expect(canSubmitAction({ reason: "", busy: false })).toBe(true);
  });

  test("disabled when a reason is required but empty", () => {
    expect(canSubmitAction({ reason: "", busy: false, requireReason: true })).toBe(false);
  });

  test("disabled when a reason is required but too short", () => {
    expect(canSubmitAction({ reason: "short", busy: false, requireReason: true })).toBe(false);
  });

  test("enabled when a reason is required and meets the minimum length", () => {
    expect(canSubmitAction({ reason: "a".repeat(10), busy: false, requireReason: true })).toBe(
      true,
    );
  });

  test("respects a custom minimum length", () => {
    expect(
      canSubmitAction({ reason: "abcde", busy: false, requireReason: true, minReasonLength: 5 }),
    ).toBe(true);
    expect(
      canSubmitAction({ reason: "abcd", busy: false, requireReason: true, minReasonLength: 5 }),
    ).toBe(false);
  });
});
