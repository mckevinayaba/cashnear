import type { Database } from "@/integrations/supabase/types";

export type CashStatus = Database["public"]["Enums"]["cash_request_status"];

export interface CashShopPublic {
  business_id: string;
  name: string | null;
  suburb: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** What a request looks like to its viewer. Shaped server-side by cash_shape(). */
export interface CashRequestView {
  id: string;
  status: CashStatus;
  amount_cents: number;
  rail_id: string;
  small_notes: boolean;
  partner_fee_cents: number;
  cashnear_fee_cents: number;
  created_at: string;
  accept_by: string;
  held_at: string | null;
  expires_at: string | null;
  shop_completed_at: string | null;
  completed_at: string | null;
  closed_reason: string | null;
  shop: CashShopPublic | null;
  customer: { first_name: string | null; distance_m: number | null } | null;
  handshake: string | null;
  code: string | null;
  reference_masked: string | null;
  code_locked_until: string | null;
}

export interface CashQuote {
  rail_id: string;
  rail_label: string;
  fee_verified: boolean;
  amount_cents: number;
  partner_fee_cents: number;
  cashnear_fee_cents: number;
  total_fee_cents: number;
  min_cents: number;
  max_cents: number;
}

export interface NearbyShop {
  business_id: string;
  name: string;
  suburb: string | null;
  distance_m: number;
  walk_min: number;
  can_serve: boolean;
}

export interface ShopCashState {
  enrolled: boolean;
  online: boolean;
  online_until: string | null;
  cash_band_cents: number | null;
  small_notes: boolean | null;
  paused_reason: string | null;
  max_band_cents: number;
  requests: CashRequestView[];
}

export type TransitionResult =
  | { ok: true; status: CashStatus }
  | { ok: false; error: string; attempts_left?: number; locked_until?: string | null };

/** The pilot rail. Exactly one rail is offered in the pilot. */
export const PILOT_RAIL = "gotyme_flash";

export const AMOUNT_CHOICES_CENTS = [10000, 20000, 30000, 40000, 50000] as const;

/** 12 500 cents -> "R125"; 750 cents -> "R7.50". Spaces as thousands separator (en-ZA style). */
export function formatRand(cents: number): string {
  const rand = cents / 100;
  const whole = Number.isInteger(rand);
  const text = rand.toFixed(whole ? 0 : 2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${text}`;
}

export function secondsLeft(iso: string | null, now: number = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000));
}

/** "14:32" for 872 seconds. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Fraction of a countdown still remaining, clamped to 0..1. */
export function remainingFraction(secondsRemaining: number, totalSeconds: number): number {
  if (totalSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, secondsRemaining / totalSeconds));
}

export function walkLabel(minutes: number): string {
  return minutes <= 1 ? "1 min walk" : `${minutes} min walk`;
}

/** Distance bucket shown to a shop; never an exact figure. */
export function distanceLabel(meters: number | null): string {
  if (meters === null) return "Nearby";
  if (meters < 500) return "Under 500 m away";
  if (meters < 1000) return "Under 1 km away";
  return `About ${Math.round(meters / 1000)} km away`;
}

const MESSAGES: Record<string, string> = {
  not_authenticated: "Sign in to continue.",
  rail_unavailable: "Shops near you are still joining. We will tell you as soon as one is ready.",
  amount_not_supported: "That amount isn't available.",
  amount_not_allowed: "That amount isn't available to you yet.",
  shop_cannot_serve: "That shop cannot give you this amount right now. Pick another shop.",
  shop_unavailable: "That shop is not taking requests right now.",
  already_active: "You already have a request going.",
  paused_no_shows:
    "You cannot ask for cash for a few days, because earlier cash was not collected.",
  own_shop: "You cannot ask for cash from your own shop.",
  invalid_state: "This request has changed. Refresh the page and try again.",
  invalid_idempotency_key: "Something went wrong. Please try again.",
  invalid_location: "We couldn't read your location.",
  shop_paused: "Your shop is stopped for now, so it cannot say yes to requests.",
  not_found: "We could not find that request.",
  not_enrolled: "Your shop is not ready to give out cash through CashNear yet. Contact CashNear.",
  paused_for_review: "Your shop is stopped while we look into a report. We will contact you.",
  invalid_reference:
    "Type the number from the payment slip. Use letters and numbers only, 4 to 24 long.",
  invalid_band: "Choose an amount between R100 and the most you are allowed.",
  invalid_duration: "Choose how long you will take requests.",
  forbidden: "You are not allowed to do that.",
  reason_required: "Write a reason, at least 10 letters long.",
  location_required: "Add the shop's location first.",
  business_not_approved: "Only approved businesses can be enrolled.",
  unknown_action: "Something went wrong. Please try again.",
};

/** Turns a database or network error into plain language. Never surfaces raw exception text. */
export function describeCashError(message: string | null | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (message.startsWith("Too many attempts")) return message;
  return MESSAGES[message.trim()] ?? "Something went wrong. Please try again.";
}

/**
 * True when the cash service has not been switched on yet. The screen then
 * shows the early-access welcome instead of an error.
 */
export function isCashNotReady(message: string | null | undefined): boolean {
  return message === MESSAGES.rail_unavailable;
}

/** Plain-language outcome for a request that ended without cash changing hands. */
export function describeClosedReason(reason: string | null): string {
  if (!reason) return "This request has ended.";
  if (reason === "shop_no_response") return "The shop did not answer in time. Nothing was charged.";
  if (reason === "hold_window_passed") return "Your time ran out. You can ask again.";
  if (reason === "customer_cancelled") return "You cancelled this request.";
  if (reason.startsWith("shop_declined"))
    return "The shop could not give you this cash. Nothing was charged.";
  if (reason.startsWith("dispute_"))
    return "You told us about a problem. A real person at CashNear will look into it.";
  if (reason === "customer_did_not_confirm")
    return "We are checking this one with you and the shop.";
  return "This request has ended.";
}

export const DISPUTE_KINDS = [
  { id: "paid_no_cash", label: "I paid but didn't get cash" },
  { id: "fee_changed", label: "The shop asked me for more money" },
  { id: "wrong_amount", label: "I got the wrong amount" },
  { id: "shop_closed", label: "The shop was closed or had no cash" },
  { id: "threat", label: "I felt unsafe" },
] as const;

export const SHOP_ONLINE_CHOICES = [
  { minutes: 60, label: "1 hour" },
  { minutes: 120, label: "2 hours" },
  { minutes: 240, label: "4 hours" },
] as const;

export const SHOP_BAND_CHOICES_CENTS = [10000, 20000, 30000, 40000, 50000] as const;

/** Is a status one where the customer's screen should keep refreshing? */
export function isLiveStatus(status: CashStatus): boolean {
  return status === "awaiting_shop" || status === "held" || status === "awaiting_confirmation";
}
