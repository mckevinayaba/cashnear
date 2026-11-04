import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppShell,
  Body,
  Button,
  Card,
  CardBody,
  Display,
  Eyebrow,
  Muted,
  Screen,
} from "@/components/ds";
import { Handshake } from "@/components/cash/Handshake";
import { HoldRing } from "@/components/cash/HoldRing";
import { useCountdown } from "@/hooks/use-countdown";
import {
  cashNearby,
  cashQuote,
  createCashRequest,
  getCashRequest,
  getPosition,
  myActiveCashRequest,
  transitionCash,
} from "@/lib/cash-api";
import {
  AMOUNT_CHOICES_CENTS,
  DISPUTE_KINDS,
  PILOT_CENTER,
  PILOT_RAIL,
  describeClosedReason,
  formatRand,
  isLiveStatus,
  secondsLeft,
  walkLabel,
  type CashQuote,
  type CashRequestView,
  type NearbyShop,
} from "@/lib/cash";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cash")({
  head: () => ({ meta: [{ title: "Get cash · CashNear" }] }),
  component: CashPage,
});

type Phase =
  | { name: "loading" }
  | { name: "ask" }
  | { name: "shops"; shops: NearbyShop[]; amount: number; small: boolean; usedFallback: boolean }
  | { name: "request"; id: string };

function CashPage() {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  useEffect(() => {
    let cancelled = false;
    myActiveCashRequest()
      .then((active) => {
        if (cancelled) return;
        setPhase(active ? { name: "request", id: active.id } : { name: "ask" });
      })
      .catch(() => !cancelled && setPhase({ name: "ask" }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell hideNav>
      <Screen className="gap-8">
        <header className="flex items-baseline justify-between pt-2">
          <Link to="/customer" className="font-display text-[22px] tracking-tight">
            CashNear
          </Link>
          <span className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            {PILOT_CENTER.label}
          </span>
        </header>

        {phase.name === "loading" ? <Muted>Loading…</Muted> : null}
        {phase.name === "ask" ? (
          <AskView onShops={(p) => setPhase({ name: "shops", ...p })} />
        ) : null}
        {phase.name === "shops" ? (
          <ShopsView
            {...phase}
            onBack={() => setPhase({ name: "ask" })}
            onRequested={(id) => setPhase({ name: "request", id })}
          />
        ) : null}
        {phase.name === "request" ? (
          <RequestView id={phase.id} onDone={() => setPhase({ name: "ask" })} />
        ) : null}
      </Screen>
    </AppShell>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-[14px] text-destructive">
      {message}
    </p>
  ) : null;
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="text-[15px] text-foreground">{label}</span>
      <span
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border transition-colors",
          checked ? "border-gold bg-gold/20" : "border-border-strong bg-transparent",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full transition-all",
            checked ? "left-[22px] bg-gold" : "left-0.5 bg-muted-foreground",
          )}
        />
      </span>
    </button>
  );
}

function AskView({
  onShops,
}: {
  onShops: (p: {
    shops: NearbyShop[];
    amount: number;
    small: boolean;
    usedFallback: boolean;
  }) => void;
}) {
  const [amount, setAmount] = useState<number>(20000);
  const [small, setSmall] = useState(false);
  const [quote, setQuote] = useState<CashQuote | null>(null);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    cashQuote(amount, PILOT_RAIL)
      .then((q) => {
        if (cancelled) return;
        setClosed(false);
        setQuote(q);
        if (amount > q.max_cents) setAmount(q.max_cents);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        if (e.message.includes("aren't open yet")) setClosed(true);
        else setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [amount]);

  const find = async () => {
    setBusy(true);
    setError(null);
    try {
      const pos = await getPosition();
      const origin = pos ?? PILOT_CENTER;
      const shops = await cashNearby({
        lat: origin.lat,
        lng: origin.lng,
        amountCents: amount,
        rail: PILOT_RAIL,
        smallNotes: small,
      });
      onShops({ shops, amount, small, usedFallback: !pos });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choices = AMOUNT_CHOICES_CENTS.filter((c) => !quote || c <= quote.max_cents);

  if (closed) {
    return (
      <div className="flex flex-col gap-4">
        <Eyebrow>Get cash</Eyebrow>
        <Display className="text-[40px]">Cash holds open soon.</Display>
        <Body className="text-muted-foreground">
          We're setting up the first shops in {PILOT_CENTER.label}. We'll tell you the moment you
          can ask for cash.
        </Body>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Get cash</Eyebrow>
        <Display className="mt-2 text-[36px] leading-[1.05]">How much cash do you need?</Display>
      </div>

      <div>
        <p
          className="font-display text-[72px] leading-none tracking-tight"
          aria-live="polite"
          data-testid="amount"
        >
          {formatRand(amount)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Amount">
          {choices.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === amount}
              onClick={() => setAmount(c)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-[14px] transition-colors",
                c === amount
                  ? "border-gold text-gold"
                  : "border-border-strong text-muted-foreground hover:text-foreground",
              )}
            >
              {formatRand(c)}
            </button>
          ))}
        </div>
        {quote && quote.max_cents < 50000 ? (
          <Muted className="mt-3 text-[13px]">
            Your limit starts at {formatRand(quote.max_cents)}. It rises as you collect cash without
            problems.
          </Muted>
        ) : null}
      </div>

      <Card variant="quiet">
        <CardBody className="flex flex-col gap-2">
          <Eyebrow>Pay with</Eyebrow>
          <p className="text-[16px]">{quote?.rail_label ?? "Your bank or wallet"}</p>
          {quote ? (
            <>
              <p className="text-[15px] leading-relaxed" data-testid="fee-line">
                You pay <span className="text-gold">{formatRand(quote.partner_fee_cents)}</span> to
                your provider. CashNear charges{" "}
                <span className="text-gold">{formatRand(quote.cashnear_fee_cents)}</span>.
              </p>
              {!quote.fee_verified ? (
                <Muted className="text-[13px]">
                  Example fee. Your provider sets the final fee.
                </Muted>
              ) : null}
            </>
          ) : (
            <Muted>Checking the fee…</Muted>
          )}
        </CardBody>
      </Card>

      <Switch checked={small} onChange={setSmall} label="I need small notes (R10, R20, R50)" />

      <ErrorLine message={error} />
      <Button size="lg" fullWidth disabled={busy || !quote} onClick={find}>
        {busy ? "Finding shops…" : "Find cash near me"}
      </Button>
      <Muted className="text-[13px]">
        CashNear never holds your money. You pay the shop on their own payment device.
      </Muted>
    </div>
  );
}

function ShopsView({
  shops,
  amount,
  small,
  usedFallback,
  onBack,
  onRequested,
}: {
  shops: NearbyShop[];
  amount: number;
  small: boolean;
  usedFallback: boolean;
  onBack: () => void;
  onRequested: (id: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per shop and amount, reused if the customer taps again after a bad
  // connection, so a retry can never create a second request.
  const keys = useRef<Record<string, string>>({});

  const hold = async (s: NearbyShop) => {
    const k = `${s.business_id}:${amount}`;
    keys.current[k] ??= crypto.randomUUID();
    setBusyId(s.business_id);
    setError(null);
    try {
      const res = await createCashRequest({
        businessId: s.business_id,
        amountCents: amount,
        rail: PILOT_RAIL,
        smallNotes: small,
        idempotencyKey: keys.current[k],
        distanceM: s.distance_m,
      });
      onRequested(res.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const available = shops.filter((s) => s.can_serve);
  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-[12px] uppercase tracking-[0.2em] text-muted-foreground"
      >
        ← Change amount
      </button>
      <div>
        <Eyebrow>{formatRand(amount)}</Eyebrow>
        <Display className="mt-2 text-[34px] leading-[1.1]">
          {available.length > 0
            ? `${available.length} ${available.length === 1 ? "shop" : "shops"} can serve you.`
            : "No shop can serve you right now."}
        </Display>
        {usedFallback ? (
          <Muted className="mt-2 text-[13px]">
            Location is off, so we're showing shops near {PILOT_CENTER.label}.
          </Muted>
        ) : null}
      </div>

      <ErrorLine message={error} />

      <ul className="flex flex-col gap-3">
        {shops.map((s) => (
          <li key={s.business_id}>
            <Card variant={s.can_serve ? "lift" : "quiet"}>
              <CardBody className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-display text-[20px]">{s.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {s.suburb ? `${s.suburb} · ` : ""}
                    {walkLabel(s.walk_min)}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[12px] uppercase tracking-[0.16em]",
                      s.can_serve ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {s.can_serve ? "Available" : "Not right now"}
                  </p>
                </div>
                {s.can_serve ? (
                  <Button size="md" disabled={busyId !== null} onClick={() => hold(s)}>
                    {busyId === s.business_id ? "Asking…" : `Hold ${formatRand(amount)}`}
                  </Button>
                ) : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
      <Muted className="text-[13px]">
        The shop has 90 seconds to confirm. If it doesn't, nothing is charged and you can pick
        another.
      </Muted>
    </div>
  );
}

function RequestView({ id, onDone }: { id: string; onDone: () => void }) {
  const [req, setReq] = useState<CashRequestView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setReq(await getCashRequest(id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (req && !isLiveStatus(req.status)) return;
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [req, refresh]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      await transitionCash(id, action, payload);
      await refresh();
      setReporting(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!req) {
    return error ? (
      <div className="flex flex-col gap-4">
        <ErrorLine message={error} />
        <Button variant="secondary" onClick={onDone}>
          Back
        </Button>
      </div>
    ) : (
      <Muted>Loading…</Muted>
    );
  }

  const shopName = req.shop?.name ?? "the shop";

  if (req.status === "awaiting_shop")
    return (
      <WaitingView
        req={req}
        shopName={shopName}
        busy={busy}
        error={error}
        onCancel={() => act("cancel")}
      />
    );

  if (req.status === "held") {
    return (
      <HeldView
        req={req}
        shopName={shopName}
        busy={busy}
        error={error}
        onCancel={() => act("cancel")}
        onReport={() => setReporting(true)}
        reporting={reporting}
        onSubmitReport={(kind, details) => act("dispute", { kind, details })}
        onCloseReport={() => setReporting(false)}
      />
    );
  }

  if (req.status === "awaiting_confirmation" || req.status === "needs_review") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Eyebrow>Almost done</Eyebrow>
          <Display className="mt-2 text-[36px] leading-[1.1]">
            Did you get your {formatRand(req.amount_cents)}?
          </Display>
        </div>
        <Card variant="quiet">
          <CardBody className="flex items-baseline justify-between gap-4">
            <span className="text-[13px] text-muted-foreground">Reference on the shop's slip</span>
            <span className="font-mono text-[16px] tracking-wide">
              {req.reference_masked ?? "—"}
            </span>
          </CardBody>
        </Card>
        <Body className="text-[14px] text-muted-foreground">
          Check that it matches the confirmation from your provider. Only confirm if you counted
          your cash.
        </Body>
        <ErrorLine message={error} />
        {reporting ? (
          <ReportForm
            busy={busy}
            onSubmit={(kind, details) => act("dispute", { kind, details })}
            onClose={() => setReporting(false)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Button size="lg" fullWidth disabled={busy} onClick={() => act("confirm")}>
              Yes, I got my cash
            </Button>
            <Button variant="ghost" fullWidth onClick={() => setReporting(true)}>
              Something went wrong
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (req.status === "completed") {
    return (
      <div className="flex flex-col gap-6">
        <Eyebrow>Done</Eyebrow>
        <Display className="text-[40px] leading-[1.05]">
          You collected {formatRand(req.amount_cents)}.
        </Display>
        <Body className="text-muted-foreground">
          Thanks for confirming. Your limit grows with every clean collection.
        </Body>
        <Button size="lg" fullWidth onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Eyebrow>{req.status === "disputed" ? "Report received" : "Request ended"}</Eyebrow>
      <Display className="text-[34px] leading-[1.1]">
        {describeClosedReason(req.closed_reason)}
      </Display>
      <Button size="lg" fullWidth onClick={onDone}>
        {req.status === "disputed" ? "Done" : "Find another shop"}
      </Button>
    </div>
  );
}

function WaitingView({
  req,
  shopName,
  busy,
  error,
  onCancel,
}: {
  req: CashRequestView;
  shopName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  const left = useCountdown(req.accept_by);
  const total = Math.max(1, secondsLeft(req.accept_by, new Date(req.created_at).getTime()));
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Eyebrow>Asking {shopName}</Eyebrow>
      <HoldRing secondsLeft={left} totalSeconds={total} label="Time for the shop to confirm" />
      <Display className="text-[32px] leading-[1.1]">Waiting for the shop to confirm.</Display>
      <Body className="max-w-[32ch] text-[14px] text-muted-foreground">
        They're being asked to keep {formatRand(req.amount_cents)} aside. Nothing is charged.
      </Body>
      <ErrorLine message={error} />
      <Button variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel request
      </Button>
    </div>
  );
}

function HeldView({
  req,
  shopName,
  busy,
  error,
  reporting,
  onCancel,
  onReport,
  onSubmitReport,
  onCloseReport,
}: {
  req: CashRequestView;
  shopName: string;
  busy: boolean;
  error: string | null;
  reporting: boolean;
  onCancel: () => void;
  onReport: () => void;
  onSubmitReport: (kind: string, details: string) => void;
  onCloseReport: () => void;
}) {
  const left = useCountdown(req.expires_at);
  const total = Math.max(
    1,
    req.held_at && req.expires_at
      ? Math.round((new Date(req.expires_at).getTime() - new Date(req.held_at).getTime()) / 1000)
      : 900,
  );
  const directions =
    req.shop?.lat != null && req.shop?.lng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${req.shop.lat},${req.shop.lng}&travelmode=walking`
      : null;
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-5">
        <HoldRing
          secondsLeft={left}
          totalSeconds={total}
          size={112}
          label="Time left on your hold"
        />
        <div className="min-w-0">
          <Eyebrow>Held for you</Eyebrow>
          <p className="mt-1 font-display text-[26px] leading-tight">
            {formatRand(req.amount_cents)}
          </p>
          <p className="mt-1 truncate text-[14px] text-muted-foreground">at {shopName}</p>
        </div>
      </div>

      {req.shop?.address ? (
        <p className="text-[14px] text-muted-foreground">
          {req.shop.address}
          {req.shop.suburb ? `, ${req.shop.suburb}` : ""}
          {directions ? (
            <>
              {" · "}
              <a
                href={directions}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline"
              >
                Walking directions
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      {req.handshake ? (
        <Handshake
          words={req.handshake}
          hint="Ask the shop to say these two words before you pay."
        />
      ) : null}

      <Card variant="lift">
        <CardBody className="flex items-baseline justify-between gap-4">
          <span className="text-[13px] text-muted-foreground">Code for the till</span>
          <span className="font-mono text-[28px] tracking-[0.18em]" data-testid="code">
            {req.code ?? "——————"}
          </span>
        </CardBody>
      </Card>

      <Body className="text-[14px] text-muted-foreground">
        Pay on the shop's own payment device. Count your cash before you leave. CashNear never
        touches the money.
      </Body>

      <ErrorLine message={error} />
      {reporting ? (
        <ReportForm busy={busy} onSubmit={onSubmitReport} onClose={onCloseReport} />
      ) : (
        <div className="flex flex-col gap-1">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel hold
          </Button>
          <Button variant="ghost" onClick={onReport}>
            Report a problem
          </Button>
        </div>
      )}
    </div>
  );
}

function ReportForm({
  busy,
  onSubmit,
  onClose,
}: {
  busy: boolean;
  onSubmit: (kind: string, details: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<string>(DISPUTE_KINDS[0].id);
  const [details, setDetails] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <Eyebrow>What happened?</Eyebrow>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="What happened">
        {DISPUTE_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              "min-h-12 rounded-xl border px-4 text-left text-[15px] transition-colors",
              kind === k.id
                ? "border-gold text-foreground"
                : "border-border-strong text-muted-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] uppercase tracking-[0.18em] text-muted-foreground">
          Details (optional)
        </span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          rows={3}
          className="rounded-xl border border-border-strong bg-transparent p-3 text-[15px]"
        />
      </label>
      <Button size="lg" fullWidth disabled={busy} onClick={() => onSubmit(kind, details)}>
        Send report
      </Button>
      <Button variant="ghost" fullWidth onClick={onClose}>
        Back
      </Button>
    </div>
  );
}
