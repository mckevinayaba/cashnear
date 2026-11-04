/**
 * Allow-list of synthetic demo accounts (staging), used to:
 *   - badge them as "Demo" in admin views instead of a real customer/operator
 *   - exclude them from operational counts on the admin overview
 *   - scope the founder-only demo reset action so it can only ever touch
 *     these two accounts, never an arbitrary client-supplied user id
 *
 * These are not real people. No production data, no real identity
 * documents. Credentials live only in the git-ignored
 * .env.demo-accounts.local file, never in source control.
 */
export const DEMO_CUSTOMER_USER_ID = "04e66a16-90df-46d9-9679-02b709f097c2";
export const DEMO_OPERATOR_OWNER_USER_ID = "fdaedf8e-e2b2-4e9b-a830-16d3e5fd81f9";

export function isDemoUserId(userId: string): boolean {
  return userId === DEMO_CUSTOMER_USER_ID || userId === DEMO_OPERATOR_OWNER_USER_ID;
}
