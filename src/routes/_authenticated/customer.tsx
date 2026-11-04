import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ActivityRow } from "@/components/ActivityRow";
import { ShareJoinLink } from "@/components/ShareJoinLink";
import { AppShell, Body, Button, Card, CardBody, Display, Eyebrow, Screen } from "@/components/ds";
import { useAuth } from "@/hooks/use-auth";
import { cashMyHistory, cashQuote, myActiveCashRequest } from "@/lib/cash-api";
import {
  AMOUNT_CHOICES_CENTS,
  PILOT_RAIL,
  firstNameOf,
  formatRand,
  greetingFor,
  initialsOf,
  isCashNotReady,
  type CashHistoryItem,
  type CashQuote,
  type CashRequestView,
} from "@/lib/cash";

export const Route = createFileRoute("/_authenticated/customer")({
  head: () => ({ meta: [{ title: "Home · CashNear" }] }),
  component: Customer,
});

type Availability = "checking" | "open" | "early";

function Customer() {
  const auth = useAuth();
  const [availability, setAvailability] = useState<Availability>("checking");
  const [quote, setQuote] = useState<CashQuote | null>(null);
  const [active, setActive] = useState<CashRequestView | null>(null);
  const [recent, setRecent] = useState<CashHistoryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    cashQuote(20000, PILOT_RAIL)
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setAvailability("open");
      })
      .catch((e: Error) => {
        if (cancelled) return;
        // Not switched on yet is a welcome, not an error. Anything else, the
        // cash screen explains.
        setAvailability(isCashNotReady(e.message) ? "early" : "open");
      });
    myActiveCashRequest()
      .then((r) => !cancelled && setActive(r))
      .catch(() => undefined);
    cashMyHistory(3)
      .then((items) => !cancelled && setRecent(items))
      .catch(() => !cancelled && setRecent([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const meta = auth.user?.user_metadata as { full_name?: string | null } | undefined;
  const fullName = meta?.full_name ?? "";
  const first = firstNameOf(fullName);
  const choices = AMOUNT_CHOICES_CENTS.filter((c) => !quote || c <= quote.max_cents);

  return (
    <AppShell size="wide">
      <Screen className="gap-8">
        <header className="flex items-center justify-between gap-4 pt-2">
          <div className="min-w-0">
            <p className="text-[14px] text-muted-foreground">
              {greetingFor(new Date().getHours())}
            </p>
            <h1 className="mt-0.5 truncate font-display text-[34px] leading-[1.05]">
              {first || "Welcome"}
            </h1>
          </div>
          <Link
            to="/account"
            aria-label="Your account"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-surface-2 text-[15px] font-medium text-foreground lg:hidden"
          >
            {initialsOf(fullName || auth.user?.email)}
          </Link>
        </header>

        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[1.15fr_1fr] lg:items-start lg:gap-10">
          <div className="flex flex-col gap-6">
            {active ? <InProgress req={active} /> : null}

            {availability === "checking" ? (
              <div className="h-[260px] animate-pulse rounded-2xl bg-surface-2/60" />
            ) : availability === "early" ? (
              <Card variant="lift">
                <CardBody className="flex flex-col gap-4">
                  <Eyebrow>Early access</Eyebrow>
                  <Display className="text-[34px] leading-[1.05]">You are in.</Display>
                  <Body className="text-[15px] text-muted-foreground">
                    Your account is ready. We are adding shops one at a time, and a real person
                    checks each one first. As soon as a shop near you is ready, you can ask for cash
                    right here. We will email you too.
                  </Body>
                </CardBody>
              </Card>
            ) : (
              <Card variant="lift">
                <CardBody className="flex flex-col gap-5">
                  <div>
                    <Eyebrow>Get cash</Eyebrow>
                    <Display className="mt-2 text-[32px] leading-[1.05]">
                      How much do you need?
                    </Display>
                  </div>
                  <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
                    {choices.map((c) => (
                      <Link
                        key={c}
                        to="/cash"
                        search={{ amount: c }}
                        className="inline-flex min-h-12 items-center rounded-full border border-border-strong px-5 text-[16px] font-medium text-foreground transition-colors hover:border-gold hover:text-gold"
                      >
                        {formatRand(c)}
                      </Link>
                    ))}
                  </div>
                  <Link to="/cash">
                    <Button size="lg" fullWidth>
                      Find cash near me
                    </Button>
                  </Link>
                  <p className="text-[13px] text-muted-foreground">
                    You see the fee before you ask. CashNear charges{" "}
                    {formatRand(quote?.cashnear_fee_cents ?? 0)}.
                  </p>
                </CardBody>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <section aria-labelledby="recent-heading">
              <div className="mb-3 flex items-baseline justify-between">
                <h2
                  id="recent-heading"
                  className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Recent
                </h2>
                {recent && recent.length > 0 ? (
                  <Link
                    to="/activity"
                    className="text-[13px] text-foreground underline underline-offset-4"
                  >
                    See all
                  </Link>
                ) : null}
              </div>
              {recent === null ? (
                <div className="h-[76px] animate-pulse rounded-2xl bg-surface-2/60" />
              ) : recent.length === 0 ? (
                <Card variant="quiet">
                  <CardBody className="py-5">
                    <p className="text-[14px] text-muted-foreground">
                      Nothing yet. When you get cash, it shows up here.
                    </p>
                  </CardBody>
                </Card>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
                  {recent.map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </section>

            <Card variant="outline">
              <CardBody className="flex flex-col gap-3">
                <Eyebrow>Know a shop?</Eyebrow>
                <Body className="text-[14px] text-muted-foreground">
                  The more shops join, the easier it is to get cash close to home. Send them this
                  link. It is free for them to register.
                </Body>
                <ShareJoinLink audience="shop" label="Send to a shop" />
              </CardBody>
            </Card>

            <Card variant="outline">
              <CardBody className="flex flex-col gap-3">
                <Eyebrow>Own a shop?</Eyebrow>
                <Body className="text-[14px] text-muted-foreground">
                  Do you have a shop with a card machine? You can register it too. It is free.
                </Body>
                <Link to="/operator/apply">
                  <Button variant="secondary" fullWidth>
                    Register my shop
                  </Button>
                </Link>
              </CardBody>
            </Card>
          </div>
        </div>
      </Screen>
    </AppShell>
  );
}

/** A request that is still going. It stays at the top until it ends. */
function InProgress({ req }: { req: CashRequestView }) {
  const shop = req.shop?.name ?? "the shop";
  const line =
    req.status === "awaiting_shop"
      ? `Waiting for ${shop} to say yes.`
      : req.status === "held"
        ? `${formatRand(req.amount_cents)} is kept for you at ${shop}.`
        : "Tell us if you got your cash.";
  return (
    <Card variant="lift" className="ring-1 ring-gold/40">
      <CardBody className="flex flex-col gap-3">
        <Eyebrow className="text-gold">In progress</Eyebrow>
        <p className="font-display text-[26px] leading-[1.1]">{line}</p>
        <Link to="/cash">
          <Button size="lg" fullWidth>
            Open it
          </Button>
        </Link>
      </CardBody>
    </Card>
  );
}
