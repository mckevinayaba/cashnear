/**
 * Where a signed-in person lands. The choice they made when joining ("I need
 * cash" or "I own a shop") is kept on their account, so it survives the
 * confirmation email, a different phone, or a closed tab. It only decides which
 * screen they see first. It never grants access to anything.
 */

export type JoinIntent = "customer" | "shop";

export function readJoinIntent(metadata: unknown): JoinIntent | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).joined_as;
  return value === "shop" || value === "customer" ? value : null;
}

export type Landing =
  | "/admin"
  | "/operator/dashboard"
  | "/operator/apply"
  | "/customer"
  | "/onboarding";

export function landingFor(args: {
  isAdmin: boolean;
  isOperator: boolean;
  roles: readonly string[];
  intent: JoinIntent | null;
}): Landing {
  if (args.isAdmin) return "/admin";
  if (args.isOperator) return "/operator/dashboard";
  const customerOnly = args.roles.length === 1 && args.roles[0] === "customer";
  if (customerOnly) {
    if (args.intent === "shop") return "/operator/apply";
    if (args.intent === "customer") return "/customer";
    return "/onboarding";
  }
  return "/customer";
}
