import { describe, test, expect } from "bun:test";
import { normalizeMobileNumber, isValidMobileNumber } from "@/lib/phone-number";

describe("normalizeMobileNumber — South African local/international support, no nationality inference", () => {
  test("South African local format (0821234567) normalises to +27821234567", () => {
    expect(normalizeMobileNumber("0821234567")).toEqual({ value: "+27821234567" });
  });

  test("South African international format (+27821234567) is accepted as-is", () => {
    expect(normalizeMobileNumber("+27821234567")).toEqual({ value: "+27821234567" });
  });

  test("South African number missing only the leading + (27821234567) normalises to +27821234567", () => {
    expect(normalizeMobileNumber("27821234567")).toEqual({ value: "+27821234567" });
  });

  test("a valid foreign international number (e.g. a US number) is accepted and not reshaped", () => {
    expect(normalizeMobileNumber("+14155552671")).toEqual({ value: "+14155552671" });
  });

  test("another valid foreign international number (UK) is accepted", () => {
    expect(normalizeMobileNumber("+447911123456")).toEqual({ value: "+447911123456" });
  });

  test("spaces are stripped before validation", () => {
    expect(normalizeMobileNumber("+27 82 123 4567")).toEqual({ value: "+27821234567" });
  });

  test("hyphens are stripped before validation", () => {
    expect(normalizeMobileNumber("082-123-4567")).toEqual({ value: "+27821234567" });
  });

  test("too-short input is rejected", () => {
    const result = normalizeMobileNumber("+1234567");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  test("too-long input is rejected", () => {
    const result = normalizeMobileNumber("+123456789012345678");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  test("letters are rejected", () => {
    const result = normalizeMobileNumber("+27abc123456");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  test("malformed country code (a 0 immediately after +) is rejected, not guessed at", () => {
    const result = normalizeMobileNumber("+0821234567");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  test("empty input is rejected", () => {
    const result = normalizeMobileNumber("");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  test("a bare local-looking number without + or a recognised SA prefix is rejected, not assumed", () => {
    // e.g. a foreign local number given without its country code -- we
    // have no basis to guess which country's dialling convention applies.
    const result = normalizeMobileNumber("5551234567");
    expect(result.value).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  test("error message asks for a country code, never mentions South Africa exclusively", () => {
    const result = normalizeMobileNumber("abc");
    expect(result.error).not.toMatch(/south african/i);
    expect(result.error).toMatch(/country code/i);
  });

  test("isValidMobileNumber mirrors normalizeMobileNumber's acceptance", () => {
    expect(isValidMobileNumber("0821234567")).toBe(true);
    expect(isValidMobileNumber("+14155552671")).toBe(true);
    expect(isValidMobileNumber("not a number")).toBe(false);
    expect(isValidMobileNumber("+0821234567")).toBe(false);
  });
});
