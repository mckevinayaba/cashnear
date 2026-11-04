/**
 * Turns whatever the sign-in service says into a short sentence a person can
 * act on. Raw service text is never shown: it is often technical, and some of
 * it would tell a stranger whether an email already has an account.
 */

export const GENERIC_AUTH_ERROR = "We could not do that. Please try again.";

export function describeAuthError(raw: unknown): string {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  const m = text.toLowerCase();
  if (!m) return GENERIC_AUTH_ERROR;

  if (m.includes("invalid login credentials"))
    return "Your email or password is not correct. Try again, or reset your password.";
  if (m.includes("email not confirmed"))
    return "Please confirm your email first. We sent you a link. Check your spam folder too.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "An account with this email already exists. Sign in instead.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return "Too many tries. Please wait a few minutes and try again.";
  if (m.includes("easy to guess") || m.includes("pwned") || m.includes("weak"))
    return "That password is too easy to guess. Choose a different one.";
  if (m.includes("same password") || m.includes("different from the old"))
    return "Choose a password you have not used before.";
  if (m.includes("password should be") || m.includes("password must be"))
    return "Your password must be at least 8 characters.";
  if (m.includes("session missing") || m.includes("expired") || m.includes("invalid token"))
    return "This link has expired or was already used. Ask for a new one.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "We cannot create new accounts right now. Please try again soon, or email support@cashnear.co.";
  if (m.includes("invalid") && m.includes("email")) return "Enter a valid email address.";
  if (
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("load failed") ||
    m.includes("supabase")
  )
    return "We could not connect. Check your internet and try again.";

  return GENERIC_AUTH_ERROR;
}

/** True when the service says the person must confirm their email before signing in. */
export function isUnconfirmedEmail(raw: unknown): boolean {
  const text = raw instanceof Error ? raw.message : typeof raw === "string" ? raw : "";
  return text.toLowerCase().includes("email not confirmed");
}
