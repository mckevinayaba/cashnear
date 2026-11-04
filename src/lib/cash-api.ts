import { supabase } from "@/integrations/supabase/client";
import {
  describeCashError,
  type CashQuote,
  type CashRequestView,
  type NearbyShop,
  type ShopCashState,
  type TransitionResult,
} from "@/lib/cash";

/**
 * Thin typed wrappers over the cash engine's database functions. Every one of
 * them runs as the signed-in user: who they are, what they may see and what
 * they may do is decided in the database, never here.
 */

async function call<T>(
  run: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await run;
  if (error) throw new Error(describeCashError(error.message));
  return data as T;
}

export function cashQuote(amountCents: number, rail: string) {
  return call<CashQuote>(supabase.rpc("cash_quote", { p_amount_cents: amountCents, p_rail: rail }));
}

export function cashNearby(args: {
  lat: number;
  lng: number;
  amountCents: number;
  rail: string;
  smallNotes: boolean;
}) {
  return call<NearbyShop[]>(
    supabase.rpc("cash_nearby", {
      p_lat: args.lat,
      p_lng: args.lng,
      p_amount_cents: args.amountCents,
      p_rail: args.rail,
      p_small: args.smallNotes,
    }),
  );
}

export function createCashRequest(args: {
  businessId: string;
  amountCents: number;
  rail: string;
  smallNotes: boolean;
  idempotencyKey: string;
  distanceM: number;
}) {
  return call<{ id: string; replayed: boolean }>(
    supabase.rpc("cash_create_request", {
      p_business: args.businessId,
      p_amount_cents: args.amountCents,
      p_rail: args.rail,
      p_small: args.smallNotes,
      p_idem: args.idempotencyKey,
      p_distance_m: args.distanceM,
    }),
  );
}

export function getCashRequest(id: string) {
  return call<CashRequestView>(supabase.rpc("cash_get_request", { p_id: id }));
}

export function myActiveCashRequest() {
  return call<CashRequestView | null>(supabase.rpc("cash_my_active"));
}

export function shopCashState(businessId: string) {
  return call<ShopCashState>(supabase.rpc("cash_shop_state", { p_business: businessId }));
}

export function setCashAvailability(args: {
  businessId: string;
  minutes: number | null;
  bandCents: number | null;
  smallNotes: boolean | null;
}) {
  return call<ShopCashState>(
    supabase.rpc("cash_set_availability", {
      p_business: args.businessId,
      p_minutes: args.minutes,
      p_band_cents: args.bandCents,
      p_small: args.smallNotes,
    }),
  );
}

export function transitionCash(id: string, action: string, payload: Record<string, unknown> = {}) {
  return call<TransitionResult>(
    supabase.rpc("cash_transition", {
      p_id: id,
      p_action: action,
      p_payload: payload as never,
    }),
  );
}

/** The browser's location, or null when it is unavailable or declined. Never throws. */
export function getPosition(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
