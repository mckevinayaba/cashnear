import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen, Eyebrow, Display, Muted, Card, CardBody } from "@/components/ds";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import type { Database } from "@/integrations/supabase/types";

type Business = Database["public"]["Tables"]["operator_businesses"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/operators/")({
  head: () => ({ meta: [{ title: "Operator queue · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminOperators,
});

const STATUS_TONE: Record<string, string> = {
  submitted: "text-gold",
  under_review: "text-gold",
  info_requested: "text-gold",
  site_verification_required: "text-gold",
  approved: "text-success",
  rejected: "text-destructive",
  suspended: "text-destructive",
  deactivated: "text-muted-foreground",
  draft: "text-muted-foreground",
};

function AdminOperators() {
  const [rows, setRows] = useState<Business[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadError(null);
      let q = supabase
        .from("operator_businesses")
        .select("*")
        .order("submitted_at", { ascending: false, nullsFirst: false });
      if (filter !== "all")
        q = q.eq("application_status", filter as Business["application_status"]);
      const { data, error } = await q;
      if (error) {
        setLoadError(error.message);
        setRows([]);
        return;
      }
      setRows(data ?? []);
    })();
  }, [filter]);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((b) =>
      [b.trading_name, b.legal_name, b.suburb, b.city]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle)),
    );
  }, [rows, search]);

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <div className="pt-2">
          <Link
            to="/admin"
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            ← Ops
          </Link>
        </div>
        <Eyebrow>Verification queue</Eyebrow>
        <Display className="text-[44px]">Operator applications.</Display>
        <Muted>Review manually. Approve to activate the operator.</Muted>

        <div className="flex flex-wrap gap-2">
          {[
            "all",
            "submitted",
            "under_review",
            "info_requested",
            "approved",
            "rejected",
            "suspended",
            "deactivated",
          ].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                (filter === s
                  ? "border-gold text-foreground"
                  : "border-border-strong text-muted-foreground hover:text-foreground") +
                " rounded-full border px-4 py-1.5 text-[12px] uppercase tracking-[0.18em]"
              }
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or suburb…"
          aria-label="Search operators"
          className="h-11 rounded-full border border-border-strong bg-surface px-4 text-[14px] text-foreground placeholder:text-muted-foreground/60"
        />

        {loadError ? (
          <Card variant="outline">
            <CardBody>
              <p role="alert" className="text-[13px] text-destructive">
                Could not load applications: {loadError}
              </p>
            </CardBody>
          </Card>
        ) : !visibleRows ? (
          <Muted>Loading…</Muted>
        ) : visibleRows.length === 0 ? (
          <Card variant="outline">
            <CardBody>
              <Muted>No applications match.</Muted>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleRows.map((b) => (
              <Link key={b.id} to="/admin/operators/$id" params={{ id: b.id }} className="block">
                <Card variant="quiet" className="transition-colors hover:bg-surface">
                  <CardBody className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3">
                        <span className="truncate font-display text-[20px] text-foreground">
                          {b.trading_name || b.legal_name || "Unnamed"}
                        </span>
                        <span
                          className={
                            STATUS_TONE[b.application_status] +
                            " text-[11px] uppercase tracking-[0.18em]"
                          }
                        >
                          {b.application_status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {b.suburb ? `${b.suburb} · ` : ""}
                        {b.city ?? "—"} · {b.business_type ?? "—"}
                      </p>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      {b.submitted_at ? new Date(b.submitted_at).toLocaleDateString() : "—"}
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Screen>
    </AppShell>
  );
}
