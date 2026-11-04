/**
 * Mobile-number normalisation and validation, dependency-free and SSR-safe
 * (pure string logic, no DOM/browser API) -- deliberately not using a phone
 * number library, since the accepted-format list here is small and explicit
 * enough that a regex-based approach is simpler and equally reliable.
 *
 * Policy: accept a South African local number, a South African number
 * already in (or missing only the leading +) international form, or any
 * other number given with an explicit "+" country code. Nationality is
 * never inferred from the number -- a customer can be lawfully present in
 * South Africa and hold a foreign mobile number, or vice versa. Only the
 * three conventional shapes below are recognised; anything else must be
 * given with an explicit "+" so it is never guessed at.
 */

export const MOBILE_NUMBER_HELPER_TEXT =
  "Use a South African or international number, for example +27 82 123 4567.";
export const MOBILE_NUMBER_ERROR =
  "Enter a valid mobile number, including the country code for international numbers.";

const SA_LOCAL = /^0[6-8][0-9]{8}$/; // e.g. 0821234567
const SA_WITHOUT_PLUS = /^27[6-8][0-9]{8}$/; // e.g. 27821234567
const INTERNATIONAL = /^\+[1-9][0-9]{7,14}$/; // E.164-shaped: + then 8-15 digits total

export type MobileNumberResult =
  | { value: string; error?: undefined }
  | { value?: undefined; error: string };

/**
 * Strips spaces and hyphens, validates the result, and normalises South
 * African local/without-plus forms to a consistent "+27..." shape. Any
 * other accepted number is returned exactly as given (with its own
 * "+" country code), never reshaped, since we have no basis to know its
 * correct local dialling convention.
 */
export function normalizeMobileNumber(raw: string): MobileNumberResult {
  const cleaned = raw.trim().replace(/[\s-]/g, "");

  if (!cleaned) return { error: MOBILE_NUMBER_ERROR };
  if (!/^[+0-9]+$/.test(cleaned)) return { error: MOBILE_NUMBER_ERROR };

  if (SA_LOCAL.test(cleaned)) return { value: `+27${cleaned.slice(1)}` };
  if (SA_WITHOUT_PLUS.test(cleaned)) return { value: `+${cleaned}` };
  if (INTERNATIONAL.test(cleaned)) return { value: cleaned };

  return { error: MOBILE_NUMBER_ERROR };
}

/** True if the raw input normalises to a valid mobile number. */
export function isValidMobileNumber(raw: string): boolean {
  return normalizeMobileNumber(raw).value !== undefined;
}
