/**
 * The buttons at the foot of the app (and in the side bar on a computer).
 * Which ones show depends on who is using it: a customer, or a shop.
 */

export type NavMode = "customer" | "shop";
export type NavGlyph = "home" | "cash" | "activity" | "account" | "desk";

export interface NavItem {
  to: "/customer" | "/cash" | "/activity" | "/account" | "/operator/dashboard";
  label: string;
  glyph: NavGlyph;
  /** The one action most people come to the app for. It is drawn stronger than the rest. */
  primary?: boolean;
}

const CUSTOMER_ITEMS: readonly NavItem[] = [
  { to: "/customer", label: "Home", glyph: "home" },
  { to: "/cash", label: "Get cash", glyph: "cash", primary: true },
  { to: "/activity", label: "Activity", glyph: "activity" },
  { to: "/account", label: "Account", glyph: "account" },
];

const SHOP_ITEMS: readonly NavItem[] = [
  { to: "/operator/dashboard", label: "Cash desk", glyph: "desk", primary: true },
  { to: "/account", label: "Account", glyph: "account" },
];

export function navItemsFor(mode: NavMode): readonly NavItem[] {
  return mode === "shop" ? SHOP_ITEMS : CUSTOMER_ITEMS;
}

/**
 * Shop screens show the shop's buttons. The shared Account screen follows who
 * the person is: a shop owner sees the shop's buttons there, everyone else the
 * customer's.
 */
export function navModeFor(args: { pathname: string; isOperator: boolean }): NavMode {
  if (args.pathname === "/operator" || args.pathname.startsWith("/operator/")) return "shop";
  if (args.pathname === "/account" && args.isOperator) return "shop";
  return "customer";
}

/** True for the exact page and anything inside it, but never for a page that merely starts with the same letters. */
export function isNavActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
