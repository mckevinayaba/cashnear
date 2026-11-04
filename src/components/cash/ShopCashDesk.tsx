import { useCallback, useEffect, useRef, useState } from "react";
import { Body, Button, Card, CardBody, Eyebrow, Muted } from "@/components/ds";
import { Handshake } from "@/components/cash/Handshake";
import { HoldRing } from "@/components/cash/HoldRing";
import { useCountdown } from "@/hooks/use-countdown";
import { setCashAvailability, shopCashState, transitionCash } from "@/lib/cash-api";
import {
  SHOP_BAND_CHOICES_CENTS,
  SHOP_ONLINE_CHOICES,
  describeCashError,
  distanceLabel,
  formatRand,
  secondsLeft,
  type CashRequestView,
  type ShopCashState,
  type TransitionResult,
} from "@/lib/cash";
import { cn } from "@/lib/utils";

/** A short two-tone beep plus vibration. Browsers may block audio until the user has tapped; that is fine. */
function alertShop() {
  try {
    // Browsers refuse vibration and audio until the person has tapped the page.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.([200, 100, 200]);
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.14);
    });
  } catch {
    /* sound is a nicety, never a requirement */
  }
}

export function ShopCashDesk({ businessId }: { businessId: string }) {
  const [state, setState] = useState<ShopCashState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const next = await shopCashState(businessId);
      const fresh = next.requests.filter(
        (r) => r.status === "awaiting_shop" && !seen.current.has(r.id),
      );
      fresh.forEach((r) => seen.current.add(r.id));
      if (fresh.length > 0) alertShop();
      setState(next);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 4000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!state) {
    return error ? (
      <p role="alert" className="text-[14px] text-destructive">
        {error}
      </p>
    ) : (
      <Muted>Loading cash desk…</Muted>
    );
  }

  if (!state.enrolled) {
    return (
      <Card variant="outline">
        <CardBody className="flex flex-col gap-2">
          <Eyebrow>Cash holds</Eyebrow>
          <Body className="text-[14px] text-muted-foreground">
            Your shop isn't set up for cash holds yet. CashNear will contact you when your area
            opens.
          </Body>
        </CardBody>
      </Card>
    );
  }

  const awaiting = state.requests.filter((r) => r.status === "awaiting_shop");
  const held = state.requests.filter((r) => r.status === "held");
  const confirming = state.requests.filter((r) => r.status === "awaiting_confirmation");

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-[14px] text-destructive">
          {error}
        </p>
      ) : null}

      {awaiting.map((r) => (
        <IncomingCard key={r.id} req={r} onChanged={refresh} />
      ))}
      {held.map((r) => (
        <HeldCard key={r.id} req={r} onChanged={refresh} />
      ))}
      {confirming.map((r) => (
        <Card key={r.id} variant="outline">
          <CardBody className="flex flex-col gap-1">
            <Eyebrow>Waiting for the customer</Eyebrow>
            <Body className="text-[14px] text-muted-foreground">
              {formatRand(r.amount_cents)} handed over. The customer is confirming. Reference{" "}
              {r.reference_masked ?? ""}.
            </Body>
          </CardBody>
        </Card>
      ))}

      <AvailabilityCard state={state} businessId={businessId} onChanged={setState} />

      {awaiting.length === 0 && held.length === 0 && state.online ? (
        <Muted>Waiting for customers. New requests appear here with a sound.</Muted>
      ) : null}
    </div>
  );
}

function AvailabilityCard({
  state,
  businessId,
  onChanged,
}: {
  state: ShopCashState;
  businessId: string;
  onChanged: (s: ShopCashState) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number>(120);

  const apply = async (patch: {
    minutes?: number | null;
    band?: number | null;
    small?: boolean | null;
  }) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(
        await setCashAvailability({
          businessId,
          minutes: patch.minutes ?? null,
          bandCents: patch.band ?? null,
          smallNotes: patch.small ?? null,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pausedText =
    state.paused_reason === "dispute_review"
      ? "Your shop is paused while we review a report. We'll be in touch."
      : state.paused_reason === "missed_requests"
        ? "Paused after missed requests. Go online to start again."
        : null;
  const bandChoices = SHOP_BAND_CHOICES_CENTS.filter((c) => c <= state.max_band_cents);

  return (
    <Card variant="lift">
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Eyebrow>Cash holds</Eyebrow>
          <span
            className={cn(
              "text-[12px] uppercase tracking-[0.18em]",
              state.online ? "text-success" : "text-muted-foreground",
            )}
          >
            {state.online ? "Online" : "Offline"}
          </span>
        </div>
        {pausedText ? <Body className="text-[14px] text-gold">{pausedText}</Body> : null}

        <div>
          <p className="text-[13px] text-muted-foreground">Cash you can offer right now</p>
          <div
            className="mt-2 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Cash you can offer"
          >
            {bandChoices.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={state.cash_band_cents === c}
                disabled={busy}
                onClick={() => apply({ band: c })}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-[14px]",
                  state.cash_band_cents === c
                    ? "border-gold text-gold"
                    : "border-border-strong text-muted-foreground",
                )}
              >
                {formatRand(c)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={!!state.small_notes}
          disabled={busy}
          onClick={() => apply({ small: !state.small_notes })}
          className="flex min-h-11 items-center justify-between text-left"
        >
          <span className="text-[15px]">I have small notes (R10, R20, R50)</span>
          <span
            className={cn("text-[13px]", state.small_notes ? "text-gold" : "text-muted-foreground")}
          >
            {state.small_notes ? "Yes" : "No"}
          </span>
        </button>

        {state.online ? (
          <div className="flex flex-col gap-2">
            <Muted className="text-[13px]" suppressHydrationWarning>
              {state.online_until
                ? `Online until ${new Date(state.online_until).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}.`
                : ""}
            </Muted>
            <Button
              variant="secondary"
              fullWidth
              disabled={busy}
              onClick={() => apply({ minutes: 0 })}
            >
              Go offline
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2" role="radiogroup" aria-label="How long to stay online">
              {SHOP_ONLINE_CHOICES.map((c) => (
                <button
                  key={c.minutes}
                  type="button"
                  role="radio"
                  aria-checked={minutes === c.minutes}
                  onClick={() => setMinutes(c.minutes)}
                  className={cn(
                    "min-h-11 flex-1 rounded-full border px-3 text-[14px]",
                    minutes === c.minutes
                      ? "border-gold text-gold"
                      : "border-border-strong text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Button
              size="lg"
              fullWidth
              disabled={busy || state.paused_reason === "dispute_review"}
              onClick={() => apply({ minutes })}
            >
              Go online
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-[14px] text-destructive">
            {error}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function IncomingCard({ req, onChanged }: { req: CashRequestView; onChanged: () => void }) {
  const left = useCountdown(req.accept_by);
  const total = Math.max(1, secondsLeft(req.accept_by, new Date(req.created_at).getTime()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: "accept" | "decline") => {
    setBusy(true);
    setError(null);
    try {
      await transitionCash(req.id, action, action === "decline" ? { reason: "other" } : {});
      onChanged();
    } catch (e) {
      setError(describeCashError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="lift" className="border-gold/60">
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Eyebrow>New request</Eyebrow>
            <p className="mt-1 font-display text-[48px] leading-none" data-testid="incoming-amount">
              {formatRand(req.amount_cents)}
            </p>
            <p className="mt-2 text-[14px] text-muted-foreground">
              {req.customer?.first_name ?? "A customer"} ·{" "}
              {distanceLabel(req.customer?.distance_m ?? null)}
              {req.small_notes ? " · needs small notes" : ""}
            </p>
          </div>
          <HoldRing secondsLeft={left} totalSeconds={total} size={96} label="Time to accept" />
        </div>
        {error ? (
          <p role="alert" className="text-[14px] text-destructive">
            {error}
          </p>
        ) : null}
        <Button size="lg" fullWidth disabled={busy || left === 0} onClick={() => act("accept")}>
          Accept and keep {formatRand(req.amount_cents)} aside
        </Button>
        <Button variant="ghost" fullWidth disabled={busy} onClick={() => act("decline")}>
          Decline
        </Button>
      </CardBody>
    </Card>
  );
}

function HeldCard({ req, onChanged }: { req: CashRequestView; onChanged: () => void }) {
  const left = useCountdown(req.expires_at);
  const total = Math.max(
    1,
    req.held_at && req.expires_at
      ? Math.round((new Date(req.expires_at).getTime() - new Date(req.held_at).getTime()) / 1000)
      : 900,
  );
  const [code, setCode] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = async () => {
    setBusy(true);
    setError(null);
    try {
      const res: TransitionResult = await transitionCash(req.id, "shop_complete", {
        code,
        reference,
      });
      if (!res.ok) {
        setError(
          res.error === "code_mismatch"
            ? `That code doesn't match. ${res.attempts_left ? `${res.attempts_left} ${res.attempts_left === 1 ? "try" : "tries"} left.` : "Wait 10 minutes, then try again."}`
            : res.error === "locked"
              ? "Too many wrong codes. Wait 10 minutes, then try again."
              : "Too many attempts. Please wait a few minutes and try again.",
        );
      } else {
        setCode("");
        setReference("");
        onChanged();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card variant="lift">
      <CardBody className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Eyebrow>Keep aside</Eyebrow>
            <p className="mt-1 font-display text-[44px] leading-none">
              {formatRand(req.amount_cents)}
            </p>
            <p className="mt-2 text-[14px] text-muted-foreground">
              For {req.customer?.first_name ?? "the customer"}
              {req.small_notes ? " · small notes" : ""}
            </p>
          </div>
          <HoldRing
            secondsLeft={left}
            totalSeconds={total}
            size={96}
            label="Time left on this hold"
          />
        </div>

        {req.handshake ? (
          <Handshake
            words={req.handshake}
            hint="Ask the customer to say these two words before you hand over cash."
          />
        ) : null}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
              Customer's code
            </span>
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-14 rounded-xl border border-border-strong bg-transparent px-4 font-mono text-[24px] tracking-[0.2em]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
              Reference from your provider slip
            </span>
            <input
              autoComplete="off"
              autoCapitalize="characters"
              maxLength={24}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="h-12 rounded-xl border border-border-strong bg-transparent px-4 font-mono text-[16px] uppercase"
            />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-[14px] text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          size="lg"
          fullWidth
          disabled={busy || code.length !== 6 || reference.trim().length < 4}
          onClick={complete}
        >
          Cash handed over
        </Button>
      </CardBody>
    </Card>
  );
}
