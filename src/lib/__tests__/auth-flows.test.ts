import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GENERIC_AUTH_ERROR, describeAuthError, isUnconfirmedEmail } from "@/lib/auth-errors";
import { landingFor, readJoinIntent } from "@/lib/auth-routing";
import { describeCashError, isCashNotReady } from "@/lib/cash";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

describe("sign-in errors are plain and never leak the service's own text", () => {
  test("known problems become one clear sentence each", () => {
    expect(describeAuthError(new Error("Invalid login credentials"))).toMatch(
      /email or password is not correct/,
    );
    expect(describeAuthError(new Error("Email not confirmed"))).toMatch(/confirm your email/);
    expect(describeAuthError(new Error("User already registered"))).toMatch(/already exists/);
    expect(describeAuthError(new Error("email rate limit exceeded"))).toMatch(/Too many tries/);
    expect(
      describeAuthError(
        new Error("For security purposes, you can only request this after 52 seconds."),
      ),
    ).toMatch(/Too many tries/);
    expect(describeAuthError(new Error("Password should be at least 6 characters."))).toMatch(
      /at least 8/,
    );
    expect(describeAuthError(new Error("Password is known to be weak and easy to guess"))).toMatch(
      /too easy to guess/,
    );
    expect(describeAuthError(new Error("Auth session missing!"))).toMatch(/link has expired/);
    expect(
      describeAuthError(new Error("otp_expired: Email link is invalid or has expired")),
    ).toMatch(/link has expired/);
    expect(describeAuthError(new Error("Failed to fetch"))).toMatch(/could not connect/);
    expect(describeAuthError(new Error("Signups not allowed for this instance"))).toMatch(
      /cannot create new accounts/,
    );
  });

  test("unknown or technical text is replaced, never shown", () => {
    for (const raw of [
      'duplicate key value violates unique constraint "users_email_key"',
      "permission denied for table user_roles",
      "",
      null,
      undefined,
    ]) {
      expect(describeAuthError(raw)).toBe(GENERIC_AUTH_ERROR);
    }
  });

  test("an unconfirmed email is recognised so the screen can offer to resend the link", () => {
    expect(isUnconfirmedEmail(new Error("Email not confirmed"))).toBe(true);
    expect(isUnconfirmedEmail(new Error("Invalid login credentials"))).toBe(false);
  });
});

describe("where a person lands after signing in", () => {
  const base = { isAdmin: false, isOperator: false, roles: ["customer"], intent: null } as const;

  test("the choice made when joining decides the first screen", () => {
    expect(landingFor({ ...base, intent: "shop" })).toBe("/operator/apply");
    expect(landingFor({ ...base, intent: "customer" })).toBe("/customer");
    expect(landingFor({ ...base, intent: null })).toBe("/onboarding");
  });

  test("a person who already has a role goes to that role's home, whatever they chose before", () => {
    expect(landingFor({ ...base, isAdmin: true, intent: "shop" })).toBe("/admin");
    expect(landingFor({ ...base, isOperator: true, intent: "customer" })).toBe(
      "/operator/dashboard",
    );
    expect(landingFor({ ...base, roles: ["customer", "operator_owner"], intent: "shop" })).toBe(
      "/customer",
    );
  });

  test("only the two known choices are read from the account", () => {
    expect(readJoinIntent({ joined_as: "shop" })).toBe("shop");
    expect(readJoinIntent({ joined_as: "customer" })).toBe("customer");
    expect(readJoinIntent({ joined_as: "admin" })).toBeNull();
    expect(readJoinIntent({ joined_as: { x: 1 } })).toBeNull();
    expect(readJoinIntent(null)).toBeNull();
    expect(readJoinIntent("shop")).toBeNull();
  });

  test("the choice never grants access: it is not read anywhere that checks permissions", () => {
    for (const f of ["src/hooks/use-auth.ts", "src/routes/_authenticated/route.tsx"]) {
      expect(read(f)).not.toMatch(/joined_as|readJoinIntent/);
    }
  });
});

describe("the join and sign-in screen", () => {
  const page = read("src/routes/auth.tsx");

  test("when the email must be confirmed first, the person is told what to do, not bounced", () => {
    expect(page).toMatch(/if \(!data\.session\)/);
    expect(page).toContain("Check your email.");
    expect(page).toContain("Send the link again");
    expect(page).toContain("auth.resend");
  });

  test("the choice between needing cash and owning a shop is saved on the account", () => {
    expect(page).toMatch(/joined_as: intent/);
    expect(page).toContain("I need cash");
    expect(page).toContain("I own a shop");
  });

  test("links from the public page can open straight on sign-up, for a customer or a shop", () => {
    expect(page).toMatch(/search\.mode === "signup"/);
    expect(page).toMatch(/search\.as === "shop"/);
  });

  test("it does not ask a customer for ID-style details just to join", () => {
    expect(page).not.toMatch(/As on your ID/i);
  });

  test("errors go through the plain-language mapper", () => {
    expect(page).toContain("describeAuthError(");
    expect(page).not.toMatch(/setError\(msg\)|setError\(err\.message\)/);
  });

  test("the password can be shown, and the email field is set up for phones", () => {
    expect(page).toContain('"Show"');
    expect(page).toContain('inputMode="email"');
    expect(page).toContain('autoCapitalize="none"');
  });
});

describe("password reset", () => {
  const page = read("src/routes/reset-password.tsx");

  test("handles an expired or used link, and the recovery event whichever way the link arrives", () => {
    expect(page).toContain("PASSWORD_RECOVERY");
    expect(page).toMatch(/error_code=/);
    expect(page).toContain("has expired or was already used");
  });

  test("does not reveal whether an email has an account", () => {
    expect(page).toContain("If that email has an account");
    expect(page).not.toMatch(/setErr\(error\.message\)/);
  });

  test("after changing the password the person can carry on into the app", () => {
    expect(page).toContain("Continue");
    expect(page).toMatch(/navigate\(\{ to: "\/home"/);
  });
});

describe("the app never reads as switched off", () => {
  const screens = [
    "src/routes/index.tsx",
    "src/routes/__root.tsx",
    "src/routes/auth.tsx",
    "src/routes/reset-password.tsx",
    "src/routes/_authenticated/onboarding.tsx",
    "src/routes/_authenticated/customer.tsx",
    "src/routes/_authenticated/cash.tsx",
    "src/routes/_authenticated/operator.dashboard.tsx",
    "src/components/ShareJoinLink.tsx",
  ];

  test("no screen says it is not open, not available yet, or coming soon", () => {
    for (const f of screens) {
      expect(read(f)).not.toMatch(/not open|coming soon|not available yet|launching soon/i);
    }
  });

  test("when the cash service is not switched on, the customer is welcomed, not shown an error", () => {
    const closed = describeCashError("rail_unavailable");
    expect(isCashNotReady(closed)).toBe(true);
    expect(closed).toMatch(/as soon as one is ready/);
    expect(isCashNotReady("Something went wrong. Please try again.")).toBe(false);
    const cash = read("src/routes/_authenticated/cash.tsx");
    expect(cash).toContain("isCashNotReady(");
    expect(cash).toContain("You are in.");
    expect(cash).toContain("Early access");
  });

  test("the share link only opens the join page and promises nothing", () => {
    const share = read("src/components/ShareJoinLink.tsx");
    expect(share).toContain("/auth?mode=signup");
    expect(share).not.toMatch(/earn|income|guarantee|R\d/i);
  });
});
