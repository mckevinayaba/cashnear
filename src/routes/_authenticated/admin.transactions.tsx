import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { AppShell, Button, Card, CardBody, Display, Eyebrow, Muted, Screen } from "@/components/ds";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { adminLedger } from "@/lib/cash-admin-api";
import {
  ADMIN_STATUSES,
  describeReasonForTeam,
  formatSeconds,
  ledgerToCsv,
  statusView,
  type AdminRequestRow,
} from "@/lib/cash-admin";
import { formatRand, formatWhen } from "@/lib/cash";

type Search = { status?: string };

export const Route = createFileRoute("/_authenticated/admin/transactions")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const s = typeof search.status === "string" ? search.status : "";
    return (ADMIN_STATUSES as string[]).includes(s) ? { status: s } : {};
  },
  head: () => ({ meta: [{ title: "Transactions · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminTransactions,
});

const PAGE = 25;
const EXPORT_MAX = 2000;

const RANGES = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "all", label: "All time", hours: null },
] as const;

const field =
  "h-11 rounded-xl border border-border-strong bg-surface px-3 text-[14px] text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none";

function fromFor(range: (typeof RANGES)[number]["value"]): string | null {
  const hours = RANGES.find((r) => r.value === range)?.hours;
  return hours ? new Date(Date.now() - hours * 3_600_000).toISOString() : null;
}

function AdminTransactions() {
  const initial = Route.useSearch();
  const [status, setStatus] = useState<string>(initial.status ?? "");
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("30d");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; rows: AdminRequestRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Wait for the typing to pause before asking the database.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(text.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminLedger({
      status: status || null,
      search: query || null,
      from: fromFor(range),
      limit: PAGE,
      offset: page * PAGE,
    })
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [status, query, range, page]);

  const exportCsv = async () => {
    setExporting(true);
    setNote(null);
    setError(null);
    try {
      const out = await adminLedger({
        status: status || null,
        search: query || null,
        from: fromFor(range),
        limit: EXPORT_MAX,
        offset: 0,
        exportIt: true,
      });
      const blob = new Blob([ledgerToCsv(out.rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cashnear-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNote(
        out.total > out.rows.length
          ? `Exported the newest ${out.rows.length} of ${out.total}. Choose a shorter period to get the rest.`
          : `Exported ${out.rows.length} ${out.rows.length === 1 ? "transaction" : "transactions"}. This export is recorded in the audit log.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const total = data?.total ?? 0;
  const first = total === 0 ? 0 : page * PAGE + 1;
  const last = Math.min(total, (page + 1) * PAGE);

  return (
    <AppShell hideNav desktopWide>
      <Screen className="gap-8">
        <div className="pt-2">
          <AdminTabs />
        </div>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Transactions</Eyebrow>
            <Display className="mt-2 text-[44px]">Every request.</Display>
            <Muted className="mt-2">
              Search by shop, customer, email, payment slip number or request number.
            </Muted>
          </div>
          <Button variant="secondary" disabled={exporting || total === 0} onClick={exportCsv}>
            {exporting ? "Preparing…" : "Export to CSV"}
          </Button>
        </header>

        <div className="grid gap-3 md:grid-cols-[1fr_200px_200px]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search"
            aria-label="Search transactions"
            maxLength={80}
            className={field}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            aria-label="Status"
            className={field}
          >
            <option value="">All statuses</option>
            {ADMIN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusView(s).label}
              </option>
            ))}
          </select>
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as typeof range);
              setPage(0);
            }}
            aria-label="Period"
            className={field}
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p role="alert" className="text-[14px] text-destructive">
            {error}
          </p>
        ) : null}
        {note ? (
          <p role="status" className="text-[14px] text-success">
            {note}
          </p>
        ) : null}

        {data === null ? (
          !error ? (
            <div className="h-64 animate-pulse rounded-2xl bg-surface-2/60" />
          ) : null
        ) : data.rows.length === 0 ? (
          <Card variant="outline">
            <CardBody>
              <Muted>Nothing matches. Try a longer period, or clear the search.</Muted>
            </CardBody>
          </Card>
        ) : (
          <>
            <div className="overflow-x-auto rounded-2xl bg-surface">
              <table className="w-full min-w-[860px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-border text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-5 py-3 font-medium">When</th>
                    <th className="px-3 py-3 font-medium">Shop</th>
                    <th className="px-3 py-3 font-medium">Customer</th>
                    <th className="px-3 py-3 text-right font-medium">Amount</th>
                    <th className="px-3 py-3 text-right font-medium">CashNear fee</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((r) => {
                    const view = statusView(r.status);
                    const expanded = open === r.id;
                    return (
                      <Fragment key={r.id}>
                        <tr
                          className="cursor-pointer hover:bg-surface-2/50"
                          onClick={() => setOpen(expanded ? null : r.id)}
                        >
                          <td className="px-5 py-4 whitespace-nowrap">
                            <button
                              type="button"
                              aria-expanded={expanded}
                              className="text-left underline-offset-4 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen(expanded ? null : r.id);
                              }}
                            >
                              {formatWhen(r.created_at)}
                            </button>
                          </td>
                          <td className="px-3 py-4">{r.shop.name ?? "A shop"}</td>
                          <td className="px-3 py-4">
                            {r.customer.name || r.customer.email || "—"}
                          </td>
                          <td className="px-3 py-4 text-right tabular-nums">
                            {formatRand(r.amount_cents)}
                          </td>
                          <td className="px-3 py-4 text-right tabular-nums">
                            {formatRand(r.cashnear_fee_cents)}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge label={view.label} tone={view.tone} />
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="bg-surface-2/40">
                            <td colSpan={6} className="px-5 py-5">
                              <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
                                <Detail label="What happened">
                                  {describeReasonForTeam(r.status, r.closed_reason)}
                                </Detail>
                                <Detail label="Request number">
                                  <span className="font-mono text-[12px]">{r.id}</span>
                                </Detail>
                                <Detail label="Payment slip number">
                                  {r.shop_reference ?? "Not entered yet"}
                                </Detail>
                                <Detail label="Customer">
                                  {r.customer.name || "—"}
                                  {r.customer.email ? (
                                    <span className="block text-muted-foreground">
                                      {r.customer.email}
                                    </span>
                                  ) : null}
                                </Detail>
                                <Detail label="Shop">
                                  <Link
                                    to="/admin/operators/$id"
                                    params={{ id: r.shop.business_id }}
                                    className="underline underline-offset-4"
                                  >
                                    {r.shop.name ?? "A shop"}
                                  </Link>
                                  {r.shop.suburb ? (
                                    <span className="block text-muted-foreground">
                                      {r.shop.suburb}
                                    </span>
                                  ) : null}
                                </Detail>
                                <Detail label="Fees">
                                  Bank or wallet {formatRand(r.partner_fee_cents)} · CashNear{" "}
                                  {formatRand(r.cashnear_fee_cents)}
                                </Detail>
                                <Detail label="Shop said yes after">
                                  {formatSeconds(r.accept_seconds)}
                                </Detail>
                                <Detail label="Collected">
                                  {r.completed_at ? formatWhen(r.completed_at) : "—"}
                                </Detail>
                              </dl>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4 text-[14px] text-muted-foreground">
              <span>
                {first}–{last} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Newer
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={last >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Older
                </Button>
              </div>
            </div>
          </>
        )}
      </Screen>
    </AppShell>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}
