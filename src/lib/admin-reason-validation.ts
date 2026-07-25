/**
 * Client-side mirror of the server-side reason requirement
 * (admin.functions.ts REASON_REQUIRED_DECISIONS / MIN_REASON_LENGTH) --
 * purely for immediate UI feedback (disabling submit, showing a hint).
 * The server independently re-validates and is the actual enforcement
 * point; this never substitutes for it.
 */
export const MIN_REASON_LENGTH = 10;

export function isReasonRequired(decision: string): boolean {
  return decision === "rejected" || decision === "suspended";
}

export function isReasonValid(decision: string, reason: string): boolean {
  if (!isReasonRequired(decision)) return true;
  return reason.trim().length >= MIN_REASON_LENGTH;
}
