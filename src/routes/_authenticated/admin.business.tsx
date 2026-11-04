import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, Body, Card, CardBody, Display, Eyebrow, Muted, Screen } from "@/components/ds";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { adminShops, adminSummary } from "@/lib/cash-admin-api";
import {
  acceptanceRate,
  collectionRate,
  describeTrend,
  formatSeconds,
  type AdminShopRow,
  type AdminSummary,
} from "@/lib/cash-admin";
import { formatRand } from "@/lib/cash";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/business")({
  head: () => ({ meta: [{ title: "Business · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminBusiness,
});

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string | number;
  note?: string;
  tone?: "warn";
}) {
  return (
    <Card variant="quiet">
      <CardBody className="flex flex-col gap-1 py-5">
        <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className={cn("font-display text-[34px] leading-none", tone === "warn" && "text-gold")}>
          {value}
        </p>
        {note ? <p className="mt-1 text-[12px] text-muted-foreground">{note}</p> : null}
      </CardBody>
    </Card>
  );
}

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/** One column per day: how many asked, and how many of those ended with cash collected. */
function DailyBars({ daily }: { daily: AdminSummary["daily"] }) {
  const peak = Math.max(1, ...daily.map((d) => Number(d.requests)));
  const asked = daily.reduce((n, d) => n + Number(d.requests), 0);
  const collected = daily.reduce((n, d) => n + Number(d.collected), 0);
  return (
    <div>
      <div
        role="img"
        aria-label={`Requests per day. ${asked} asked and ${collected} collected over ${daily.length} days.`}
        className="flex h-36 items-end gap-1"
      >
        {daily.map((d) => (
          <div
            key={d.day}
            title={`${shortDay(d.day)}: ${d.requests} asked, ${d.collected} collected`}
            className="relative flex-1 rounded-t bg-surface-2"
            style={{ height: `${Math.max(4, (Number(d.requests) / peak) * 100)}%` }}
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-t bg-gold"
              style={{
                height: `${Number(d.requests) ? (Number(d.collected) / Number(d.requests)) * 100 : 0}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-muted-foreground">
        <span>{shortDay(daily[0].day)}</span>
        <span>{shortDay(daily[daily.length - 1].day)}</span>
      </div>
      <p className="mt-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-surface-2" /> Asked
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-gold" /> Collected
        </span>
      </p>
    </div>
  );
}

function ShopStatus({ shop }: { shop: AdminShopRow }) {
  if (shop.paused_reason) return <StatusBadge label="Paused" tone="danger" />;
  return shop.online ? (
    <StatusBadge label="Online" tone="success" />
  ) : (
    <StatusBadge label="Offline" tone="muted" />
  );
}

function AdminBusiness() {
  const [days, setDays] = useState<number>(7);
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [shops, setShops] = useState<AdminShopRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSummary(null);
    setShops(null);
    adminSummary(days)
      .then((s) => !cancelled && setSummary(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    adminShops(days)
      .then((s) => !cancelled && setShops(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [days]);

  const w = summary?.window;
  const collection = w ? collectionRate(w) : null;
  const acceptance = w ? acceptanceRate(w) : null;
  const attention = summary ? summary.window.under_review + summary.people.open_reports : 0;

  return (
    <AppShell hideNav desktopWide>
      <Screen className="gap-8">
        <div className="pt-2">
          <AdminTabs />
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Business</Eyebrow>
            <Display className="mt-2 text-[44px]">How CashNear is doing.</Display>
          </div>
          <div
            role="radiogroup"
            aria-label="Period"
            className="grid grid-cols-3 rounded-full bg-surface-2 p-1"
          >
            {PERIODS.map((p) => (
              <button
                key={p.days}
                type="button"
                role="radio"
                aria-checked={days === p.days}
                onClick={() => setDays(p.days)}
                className={cn(
                  "min-h-10 rounded-full px-5 text-[14px] font-medium transition-colors",
                  days === p.days
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </header>

        {error ? (
          <p role="alert" className="text-[14px] text-destructive">
            {error}
          </p>
        ) : null}

        {summary === null || !w ? (
          !error ? (
            <div className="h-64 animate-pulse rounded-2xl bg-surface-2/60" />
          ) : null
        ) : (
          <>
            <Card variant="lift">
              <CardBody className="flex flex-col gap-2">
                <Eyebrow className="text-gold">Our one number</Eyebrow>
                <p className="font-display text-[72px] leading-none">
                  {summary.week.collected_this_week}
                </p>
                <p className="text-[16px] text-foreground">
                  cash collections the customer confirmed, in the last 7 days
                </p>
                <p className="text-[13px] text-muted-foreground">
                  {describeTrend(
                    summary.week.collected_this_week,
                    summary.week.collected_last_week,
                  )}
                </p>
              </CardBody>
            </Card>

            {attention > 0 ? (
              <Card variant="outline" className="border-gold/50">
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Eyebrow className="text-gold">Needs attention</Eyebrow>
                    <Body className="mt-1 text-[14px]">
                      {summary.window.under_review > 0
                        ? `${summary.window.under_review} ${summary.window.under_review === 1 ? "transaction needs" : "transactions need"} a review. `
                        : ""}
                      {summary.people.open_reports > 0
                        ? `${summary.people.open_reports} open ${summary.people.open_reports === 1 ? "report" : "reports"}.`
                        : ""}
                    </Body>
                  </div>
                  <div className="flex gap-4 text-[14px]">
                    {summary.window.under_review > 0 ? (
                      <Link
                        to="/admin/transactions"
                        search={{ status: "needs_review" }}
                        className="underline underline-offset-4"
                      >
                        See transactions
                      </Link>
                    ) : null}
                    {summary.people.open_reports > 0 ? (
                      <Link to="/admin/cash" className="underline underline-offset-4">
                        Open reports
                      </Link>
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            ) : null}

            <section className="flex flex-col gap-3">
              <Eyebrow>Last {days} days</Eyebrow>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Asked for cash" value={w.requests} />
                <Tile
                  label="Shop said yes"
                  value={acceptance === null ? "—" : `${acceptance}%`}
                  note={`${w.accepted} of ${w.requests}`}
                />
                <Tile
                  label="Collected"
                  value={w.collected}
                  note={
                    collection === null
                      ? "None finished yet"
                      : `${collection}% of finished requests`
                  }
                />
                <Tile label="Cash handed out" value={formatRand(w.collected_cents)} />
                <Tile
                  label="Shop was quick"
                  value={formatSeconds(w.median_accept_seconds)}
                  note="Typical time to say yes"
                />
                <Tile label="Shop did not answer" value={w.shop_no_answer} />
                <Tile label="Cancelled or ran out" value={w.cancelled + w.time_ran_out} />
                <Tile
                  label="Under review"
                  value={w.under_review}
                  tone={w.under_review > 0 ? "warn" : undefined}
                />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <Eyebrow>Each day</Eyebrow>
              <Card variant="quiet">
                <CardBody>
                  <DailyBars daily={summary.daily} />
                </CardBody>
              </Card>
            </section>

            <div className="grid gap-8 lg:grid-cols-2">
              <section className="flex flex-col gap-3">
                <Eyebrow>People</Eyebrow>
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Joined" value={summary.people.joined} />
                  <Tile label="Got cash" value={summary.people.collected_once} />
                  <Tile label="Came back" value={summary.people.came_back} note="2 or more times" />
                </div>
              </section>
              <section className="flex flex-col gap-3">
                <Eyebrow>Shops</Eyebrow>
                <div className="grid grid-cols-3 gap-3">
                  <Tile label="Approved" value={summary.shops.approved} />
                  <Tile label="In the pilot" value={summary.shops.enrolled} />
                  <Tile label="Online now" value={summary.shops.online_now} />
                </div>
              </section>
            </div>

            <section className="flex flex-col gap-3">
              <Eyebrow>Money</Eyebrow>
              <Card variant="quiet">
                <CardBody className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
                      CashNear has earned
                    </p>
                    <p className="mt-2 font-display text-[44px] leading-none">
                      {formatRand(w.cashnear_fees_cents)}
                    </p>
                    <p className="mt-3 max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground">
                      CashNear charges no fee during the pilot, so this is R0. When fees start, this
                      is what is owed on collected cash, and the transaction export carries every
                      line you need to invoice it.
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] uppercase tracking-[0.16em] text-muted-foreground">
                      Fees customers paid their bank or wallet
                    </p>
                    <p className="mt-2 font-display text-[44px] leading-none">
                      {formatRand(w.partner_fees_cents)}
                    </p>
                    <p className="mt-3 max-w-[48ch] text-[13px] leading-relaxed text-muted-foreground">
                      This goes to the payment partner, not to CashNear. It is shown so you can see
                      what customers are paying, and match it to the partner's statement.
                    </p>
                  </div>
                </CardBody>
              </Card>
              <Link
                to="/admin/transactions"
                className="self-start text-[14px] text-foreground underline underline-offset-4"
              >
                See every transaction and export
              </Link>
            </section>

            <section className="flex flex-col gap-3">
              <Eyebrow>Shops, last {days} days</Eyebrow>
              {shops === null ? (
                <div className="h-24 animate-pulse rounded-2xl bg-surface-2/60" />
              ) : shops.length === 0 ? (
                <Card variant="outline">
                  <CardBody>
                    <Muted>
                      No shop is in the pilot yet. Enrol an approved shop from its page under Shops.
                    </Muted>
                  </CardBody>
                </Card>
              ) : (
                <div className="overflow-x-auto rounded-2xl bg-surface">
                  <table className="w-full min-w-[760px] text-left text-[14px]">
                    <thead>
                      <tr className="border-b border-border text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-5 py-3 font-medium">Shop</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-3 py-3 text-right font-medium">Asked</th>
                        <th className="px-3 py-3 text-right font-medium">Collected</th>
                        <th className="px-3 py-3 text-right font-medium">Cash</th>
                        <th className="px-3 py-3 text-right font-medium">No answer</th>
                        <th className="px-3 py-3 text-right font-medium">Speed</th>
                        <th className="px-5 py-3 text-right font-medium">Trust</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {shops.map((s) => (
                        <tr key={s.business_id}>
                          <td className="px-5 py-4">
                            <Link
                              to="/admin/operators/$id"
                              params={{ id: s.business_id }}
                              className="text-foreground underline-offset-4 hover:underline"
                            >
                              {s.name}
                            </Link>
                            {s.suburb ? (
                              <span className="block text-[12px] text-muted-foreground">
                                {s.suburb}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-4">
                            <ShopStatus shop={s} />
                          </td>
                          <td className="px-3 py-4 text-right tabular-nums">{s.requests}</td>
                          <td className="px-3 py-4 text-right tabular-nums">{s.collected}</td>
                          <td className="px-3 py-4 text-right tabular-nums">
                            {formatRand(s.collected_cents)}
                          </td>
                          <td className="px-3 py-4 text-right tabular-nums">{s.no_answer}</td>
                          <td className="px-3 py-4 text-right tabular-nums">
                            {formatSeconds(s.median_accept_seconds)}
                          </td>
                          <td className="px-5 py-4 text-right tabular-nums">{s.trust_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </Screen>
    </AppShell>
  );
}
