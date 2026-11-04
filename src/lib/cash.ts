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

/** Orlando West, Soweto: where the pilot runs and the fallback when location is off. */
export const PILOT_CENTER = { lat: -26.2405, lng: 27.9055, label: "Orlando West" } as const;

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
  rail_unavailable: "Cash holds aren't open yet. We'll tell you when they are.",
  amount_not_supported: "That amount isn't available.",
  amount_not_allowed: "That amount isn't available to you yet.",
  shop_cannot_serve: "That shop can't serve this amount right now. Pick another shop.",
  shop_unavailable: "That shop isn't taking requests right now.",
  already_active: "You already have a cash hold in progress.",
  paused_no_shows: "New requests are paused for a few days after missed collections.",
  own_shop: "You can't request cash from your own shop.",
  invalid_state: "This request has already changed. Refresh and try again.",
  invalid_idempotency_key: "Something went wrong. Please try again.",
  invalid_location: "We couldn't read your location.",
  shop_paused: "Your shop is paused, so it can't accept requests.",
  not_found: "We couldn't find that request.",
  not_enrolled: "Your shop isn't set up for cash holds yet. Contact CashNear.",
  paused_for_review: "Your shop is paused while we review a report. We'll be in touch.",
  invalid_reference:
    "Enter the reference from your provider slip: letters and numbers, 4 to 24 characters.",
  invalid_band: "Choose a cash amount between R100 and the pilot limit.",
  invalid_duration: "Choose how long you'll be online.",
  forbidden: "You don't have access to do that.",
  reason_required: "Add a reason of at least 10 characters.",
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

/** Plain-language outcome for a request that ended without cash changing hands. */
export function describeClosedReason(reason: string | null): string {
  if (!reason) return "This request has ended.";
  if (reason === "shop_no_response") return "The shop didn't respond in time. Nothing was charged.";
  if (reason === "hold_window_passed") return "Your hold ran out. You can ask again.";
  if (reason === "customer_cancelled") return "You cancelled this request.";
  if (reason.startsWith("shop_declined"))
    return "The shop couldn't serve this one. Nothing was charged.";
  if (reason.startsWith("dispute_"))
    return "You reported a problem. A person on the CashNear team will review it.";
  if (reason === "customer_did_not_confirm")
    return "We're checking this one with you and the shop.";
  return "This request has ended.";
}

export const DISPUTE_KINDS = [
  { id: "paid_no_cash", label: "I paid but didn't get cash" },
  { id: "fee_changed", label: "The shop asked for a higher fee" },
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
