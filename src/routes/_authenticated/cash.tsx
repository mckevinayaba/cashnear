import { createFileRoute } from "@tanstack/react-router";
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
import { ShareJoinLink } from "@/components/ShareJoinLink";
import { Handshake } from "@/components/cash/Handshake";
import { HoldRing } from "@/components/cash/HoldRing";
import { ShopfrontPhoto } from "@/components/cash/ShopfrontPhoto";
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
  PILOT_RAIL,
  describeClosedReason,
  formatRand,
  isCashNotReady,
  isLiveStatus,
  secondsLeft,
  walkLabel,
  type CashQuote,
  type CashRequestView,
  type NearbyShop,
} from "@/lib/cash";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/cash")({
  // Home can open this screen with an amount already chosen. Only the amounts
  // the app offers are accepted; anything else is ignored.
  validateSearch: (search: Record<string, unknown>): { amount?: number } => {
    const n = Number(search.amount);
    return (AMOUNT_CHOICES_CENTS as readonly number[]).includes(n) ? { amount: n } : {};
  },
  head: () => ({ meta: [{ title: "Get cash · CashNear" }] }),
  component: CashPage,
});

type Phase =
  | { name: "loading" }
  | { name: "ask" }
  | { name: "shops"; shops: NearbyShop[]; amount: number; small: boolean }
  | { name: "request"; id: string };

function CashPage() {
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const { amount: startAmount } = Route.useSearch();

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
    <AppShell>
      <Screen className="gap-8">
        {phase.name === "loading" ? <Muted>Loading…</Muted> : null}
        {phase.name === "ask" ? (
          <AskView initialAmount={startAmount} onShops={(p) => setPhase({ name: "shops", ...p })} />
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
  initialAmount,
  onShops,
}: {
  initialAmount?: number;
  onShops: (p: { shops: NearbyShop[]; amount: number; small: boolean }) => void;
}) {
  const [amount, setAmount] = useState<number>(initialAmount ?? 20000);
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
        if (isCashNotReady(e.message)) setClosed(true);
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
      if (!pos) {
        setError("Turn on your phone's location so we can find shops near you. Then try again.");
        return;
      }
      const origin = pos;
      const shops = await cashNearby({
        lat: origin.lat,
        lng: origin.lng,
        amountCents: amount,
        rail: PILOT_RAIL,
        smallNotes: small,
      });
      onShops({ shops, amount, small });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choices = AMOUNT_CHOICES_CENTS.filter((c) => !quote || c <= quote.max_cents);

  if (closed) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Eyebrow>Early access</Eyebrow>
          <Display className="mt-2 text-[40px] leading-[1.05]">You are in.</Display>
          <Body className="mt-3 text-muted-foreground">
            Your account is ready. We are adding shops one at a time, and a real person checks each
            one first. As soon as a shop near you is ready, you can ask for cash right here. We will
            email you too.
          </Body>
        </div>
        <Card variant="quiet">
          <CardBody className="flex flex-col gap-3">
            <Eyebrow>Help us open near you</Eyebrow>
            <Body className="text-[14px] text-muted-foreground">
              Do you know a shop that keeps cash and has a payment machine? Send them this link. It
              is free for them to register.
            </Body>
            <ShareJoinLink audience="shop" label="Send to a shop" />
          </CardBody>
        </Card>
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
            You can ask for up to {formatRand(quote.max_cents)} for now. Each time you collect cash
            with no problems, you can ask for more.
          </Muted>
        ) : null}
      </div>

      <Card variant="quiet">
        <CardBody className="flex flex-col gap-2">
          <Eyebrow>The fee</Eyebrow>

          {quote ? (
            <>
              <p className="text-[15px] leading-relaxed" data-testid="fee-line">
                Your bank or wallet charges{" "}
                <span className="text-gold">{formatRand(quote.partner_fee_cents)}</span>. CashNear
                charges <span className="text-gold">{formatRand(quote.cashnear_fee_cents)}</span>.
              </p>
              {!quote.fee_verified ? (
                <Muted className="text-[13px]">
                  This fee is an example. Your bank or wallet sets the real fee.
                </Muted>
              ) : null}
            </>
          ) : (
            <Muted>Looking at the fee…</Muted>
          )}
        </CardBody>
      </Card>

      <Switch checked={small} onChange={setSmall} label="I need small notes (R10, R20, R50)" />

      <ErrorLine message={error} />
      <Button size="lg" fullWidth disabled={busy || !quote} onClick={find}>
        {busy ? "Looking…" : "Find cash near me"}
      </Button>
      <Muted className="text-[13px]">
        CashNear never keeps your money. You pay the shop on their payment machine.
      </Muted>
    </div>
  );
}

function ShopsView({
  shops,
  amount,
  small,
  onBack,
  onRequested,
}: {
  shops: NearbyShop[];
  amount: number;
  small: boolean;
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
            ? `${available.length} ${available.length === 1 ? "shop has" : "shops have"} your cash.`
            : "No shop near you is ready right now."}
        </Display>
        {shops.length === 0 ? (
          <Body className="mt-3 text-muted-foreground">
            We are adding shops all the time. Try again soon. You can also send this link to a shop
            you know.
          </Body>
        ) : null}
      </div>

      {shops.length === 0 ? <ShareJoinLink audience="shop" label="Send to a shop" /> : null}

      <ErrorLine message={error} />

      <ul className="flex flex-col gap-3">
        {shops.map((s) => (
          <li key={s.business_id}>
            <Card variant={s.can_serve ? "lift" : "quiet"}>
              <CardBody className="flex flex-col gap-4">
                <ShopfrontPhoto path={s.photo_path} name={s.name} />
                <div>
                  <p className="font-display text-[22px] leading-tight">{s.name}</p>
                  {s.landmark ? (
                    <p className="mt-1 text-[15px] leading-snug text-foreground">{s.landmark}</p>
                  ) : null}
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {s.suburb ? `${s.suburb} · ` : ""}
                    {walkLabel(s.walk_min)}
                  </p>
                  <p
                    className={cn(
                      "mt-2 text-[12px] uppercase tracking-[0.16em]",
                      s.can_serve ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {s.can_serve ? "Has your cash" : "Not now"}
                  </p>
                </div>
                {s.can_serve ? (
                  <Button size="lg" fullWidth disabled={busyId !== null} onClick={() => hold(s)}>
                    {busyId === s.business_id ? "Asking…" : `Keep ${formatRand(amount)} for me`}
                  </Button>
                ) : null}
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
      <Muted className="text-[13px]">
        The shop has 90 seconds to say yes. If it says no, or does not answer, nothing happens. You
        can pick another shop.
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
            <span className="text-[13px] text-muted-foreground">Number on the shop's slip</span>
            <span className="font-mono text-[16px] tracking-wide">
              {req.reference_masked ?? "—"}
            </span>
          </CardBody>
        </Card>
        <Body className="text-[14px] text-muted-foreground">
          Check that this number is also on your own payment message. Only press yes if you counted
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
          Thank you. Each time you collect cash with no problems, you can ask for more.
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
      <Display className="text-[32px] leading-[1.1]">Waiting for the shop to say yes.</Display>
      <Body className="max-w-[32ch] text-[14px] text-muted-foreground">
        We asked them to keep {formatRand(req.amount_cents)} for you. You have not paid anything.
      </Body>
      <ErrorLine message={error} />
      <Button variant="ghost" disabled={busy} onClick={onCancel}>
        Cancel
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
          <Eyebrow>Kept for you</Eyebrow>
          <p className="mt-1 font-display text-[26px] leading-tight">
            {formatRand(req.amount_cents)}
          </p>
          <p className="mt-1 truncate text-[14px] text-muted-foreground">at {shopName}</p>
        </div>
      </div>

      <ShopfrontPhoto path={req.shop?.photo_path} name={shopName} />
      {req.shop?.landmark ? (
        <p className="text-[16px] leading-snug text-foreground">{req.shop.landmark}</p>
      ) : null}

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
          hint="Ask the shop to say these two words. If they are the same, it is safe to pay."
        />
      ) : null}

      <Card variant="lift">
        <CardBody className="flex items-baseline justify-between gap-4">
          <span className="text-[13px] text-muted-foreground">Your code. Show it to the shop.</span>
          <span className="font-mono text-[28px] tracking-[0.18em]" data-testid="code">
            {req.code ?? "——————"}
          </span>
        </CardBody>
      </Card>

      <Body className="text-[14px] text-muted-foreground">
        Pay the shop on their payment machine. Count your cash before you leave. CashNear never
        touches your money.
      </Body>

      <ErrorLine message={error} />
      {reporting ? (
        <ReportForm busy={busy} onSubmit={onSubmitReport} onClose={onCloseReport} />
      ) : (
        <div className="flex flex-col gap-1">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
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
