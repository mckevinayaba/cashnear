import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeActivity,
  firstNameOf,
  formatWhen,
  greetingFor,
  initialsOf,
  type CashHistoryItem,
} from "@/lib/cash";
import { isNavActive, navItemsFor, navModeFor } from "@/lib/nav";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

describe("the app's main buttons", () => {
  test("a customer gets four: Home, Get cash, Activity, Account, with Get cash as the main one", () => {
    const items = navItemsFor("customer");
    expect(items.map((i) => i.label)).toEqual(["Home", "Get cash", "Activity", "Account"]);
    expect(items.filter((i) => i.primary).map((i) => i.label)).toEqual(["Get cash"]);
  });

  test("a shop gets its own: Cash desk and Account", () => {
    const items = navItemsFor("shop");
    expect(items.map((i) => i.label)).toEqual(["Cash desk", "Account"]);
    expect(items[0].to).toBe("/operator/dashboard");
  });

  test("every button has a plain name, because a picture alone is not enough", () => {
    for (const mode of ["customer", "shop"] as const)
      for (const item of navItemsFor(mode)) expect(item.label.length).toBeGreaterThan(2);
  });

  test("shop screens show the shop's buttons; the shared account screen follows who the person is", () => {
    expect(navModeFor({ pathname: "/operator/dashboard", isOperator: true })).toBe("shop");
    expect(navModeFor({ pathname: "/account", isOperator: true })).toBe("shop");
    expect(navModeFor({ pathname: "/account", isOperator: false })).toBe("customer");
    expect(navModeFor({ pathname: "/cash", isOperator: true })).toBe("customer");
    expect(navModeFor({ pathname: "/customer", isOperator: false })).toBe("customer");
  });

  test("the active button is the page you are on, and never one that only starts with the same letters", () => {
    expect(isNavActive("/cash", "/cash")).toBe(true);
    expect(isNavActive("/cash/extra", "/cash")).toBe(true);
    expect(isNavActive("/customer", "/cash")).toBe(false);
    expect(isNavActive("/cashier", "/cash")).toBe(false);
    expect(isNavActive("/account", "/customer")).toBe(false);
  });
});

describe("the shell: bottom buttons on a phone, a side bar on a computer", () => {
  const nav = read("src/components/ds/AppNav.tsx");
  const shell = read("src/components/ds/AppShell.tsx");

  test("the bottom buttons are for phones only, the side bar for computers only", () => {
    expect(nav).toMatch(/fixed inset-x-0 bottom-0[^"]*lg:hidden/);
    expect(nav).toMatch(/hidden[^"]*lg:flex/);
  });

  test("every button shows its name as text, marks the current page, and is a big target", () => {
    expect(nav).toContain("{item.label}");
    expect(nav).toContain("aria-current");
    expect(nav).toContain('aria-label="Main"');
    expect(nav).toMatch(/min-h-\[64px\]/);
  });

  test("the pictures are drawn in the app, not taken from an icon library", () => {
    expect(nav).not.toMatch(/lucide-react|react-icons|@tabler|heroicons|fontawesome/i);
    expect(nav).toContain("function Glyph");
  });

  test("the shell shows the buttons unless a screen asks it not to, and makes room for the side bar", () => {
    expect(shell).toContain("const withNav = !hideNav");
    expect(shell).toContain("lg:pl-[248px]");
    expect(shell).toContain("<AppNav />");
  });

  test("the whole signed-in app shares one look, applied once by the shell", () => {
    expect(shell).toContain("useApplyTheme()");
    expect(read("src/hooks/use-shop-theme.ts")).toContain("useSyncExternalStore");
    for (const f of [
      "src/routes/_authenticated/cash.tsx",
      "src/routes/_authenticated/customer.tsx",
      "src/routes/_authenticated/activity.tsx",
    ])
      expect(read(f)).not.toContain("useApplyTheme");
  });

  test("app screens show the buttons; sign-in, forms and onboarding do not", () => {
    for (const f of [
      "src/routes/_authenticated/customer.tsx",
      "src/routes/_authenticated/cash.tsx",
      "src/routes/_authenticated/activity.tsx",
      "src/routes/_authenticated/account.tsx",
      "src/routes/_authenticated/operator.dashboard.tsx",
    ])
      expect(read(f)).not.toMatch(/<AppShell[^>]*hideNav/);
    for (const f of [
      "src/routes/auth.tsx",
      "src/routes/reset-password.tsx",
      "src/routes/_authenticated/onboarding.tsx",
      "src/routes/_authenticated/operator.apply.tsx",
    ])
      expect(read(f)).toMatch(/<AppShell hideNav/);
  });

  test("the account screen has the look switch, help, rules and sign out", () => {
    const account = read("src/routes/_authenticated/account.tsx");
    expect(account).toContain("Daylight");
    expect(account).toContain("mailto:support@cashnear.co");
    expect(account).toContain("/legal/terms");
    expect(account).toContain("/legal/privacy");
    expect(account).toContain("Sign out");
  });
});

describe("activity: plain words for how each request ended", () => {
  const item = (over: Partial<CashHistoryItem>): CashHistoryItem => ({
    id: "x",
    status: "completed",
    amount_cents: 20000,
    created_at: "2026-11-04T10:00:00Z",
    completed_at: null,
    closed_reason: null,
    shop_name: "Mama Thandi's Spaza",
    ...over,
  });

  test("every status has an everyday sentence and a tone", () => {
    const expected: Record<string, [string, string]> = {
      completed: ["You got your cash", "success"],
      awaiting_shop: ["Waiting for the shop", "warn"],
      held: ["Cash kept for you", "warn"],
      awaiting_confirmation: ["Waiting for you to confirm", "warn"],
      disputed: ["We are looking into it", "warn"],
      needs_review: ["We are looking into it", "warn"],
      cancelled: ["You cancelled", "muted"],
      declined: ["The shop could not help", "muted"],
    };
    for (const [status, [outcome, tone]] of Object.entries(expected)) {
      const out = describeActivity(item({ status: status as CashHistoryItem["status"] }));
      expect(out).toEqual({ outcome, tone: tone as "success" | "warn" | "muted" });
    }
  });

  test("an expired request says whether the shop or the clock was the reason", () => {
    expect(
      describeActivity(item({ status: "expired", closed_reason: "shop_no_response" })).outcome,
    ).toBe("The shop did not answer");
    expect(
      describeActivity(item({ status: "expired", closed_reason: "hold_window_passed" })).outcome,
    ).toBe("Time ran out");
  });

  test("dates read as 'Today', 'Yesterday' or a short date, on a 24-hour clock", () => {
    const now = new Date(2026, 10, 4, 15, 0);
    expect(formatWhen(new Date(2026, 10, 4, 9, 5).toISOString(), now)).toBe("Today, 09:05");
    expect(formatWhen(new Date(2026, 10, 3, 14, 20).toISOString(), now)).toBe("Yesterday, 14:20");
    expect(formatWhen(new Date(2026, 9, 21, 8, 0).toISOString(), now)).toBe("21 Oct");
    expect(formatWhen(new Date(2025, 11, 30, 8, 0).toISOString(), now)).toBe("30 Dec 2025");
    expect(formatWhen(null, now)).toBe("");
    expect(formatWhen("not a date", now)).toBe("");
  });

  test("the greeting follows the time of day", () => {
    expect(greetingFor(6)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good afternoon");
    expect(greetingFor(18)).toBe("Good evening");
    expect(greetingFor(2)).toBe("Good evening");
  });

  test("names and badge letters cope with missing or odd input", () => {
    expect(firstNameOf("Thandi Dlamini")).toBe("Thandi");
    expect(firstNameOf("  ")).toBe("");
    expect(firstNameOf(null)).toBe("");
    expect(initialsOf("Thandi Dlamini")).toBe("TD");
    expect(initialsOf("sipho.nkosi@example.com")).toBe("SN");
    expect(initialsOf("")).toBe("C");
    expect(initialsOf(undefined)).toBe("C");
  });
});

describe("the home and activity screens", () => {
  const home = read("src/routes/_authenticated/customer.tsx");
  const activity = read("src/routes/_authenticated/activity.tsx");

  test("home offers quick amounts that open the cash screen with that amount chosen", () => {
    expect(home).toContain("search={{ amount: c }}");
    expect(read("src/routes/_authenticated/cash.tsx")).toContain("validateSearch");
  });

  test("home welcomes people when cash is not switched on yet, instead of showing an error", () => {
    expect(home).toContain("isCashNotReady(");
    expect(home).toContain("You are in.");
  });

  test("home keeps a request that is still going at the top", () => {
    expect(home).toContain("myActiveCashRequest()");
    expect(home).toContain("In progress");
  });

  test("activity explains an empty history kindly and offers a way to get cash", () => {
    expect(activity).toContain("Nothing here yet.");
    expect(activity).toContain("cashMyHistory(");
    expect(activity).toContain("Get cash");
  });

  test("neither screen reads as switched off", () => {
    for (const src of [home, activity])
      expect(src).not.toMatch(/not open|coming soon|not available yet/i);
  });

  test("a shop with no photo never shows someone else's picture in its place", () => {
    const photo = read("src/components/cash/ShopfrontPhoto.tsx");
    expect(photo).not.toMatch(/@\/assets|\.jpg|\.png/);
    expect(photo).toMatch(/if \(!url \|\| failed\) return null/);
  });
});
