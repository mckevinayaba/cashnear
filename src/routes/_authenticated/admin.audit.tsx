import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { AppShell, Screen, Eyebrow, Display, Muted, Card, CardBody } from "@/components/ds";
import type { Database } from "@/integrations/supabase/types";

type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/audit")({
  head: () => ({ meta: [{ title: "Audit activity · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminAudit,
});

const ENTITY_TYPES = [
  "all",
  "operator_business",
  "customer_profile",
  "user",
  "pilot_configuration",
] as const;
// Display labels only -- entity_type values above must stay exactly as the
// database's audit_logs.entity_type strings, since they're used directly in
// the .eq("entity_type", ...) filter below. "pilot_configuration" is the
// table name (an internal identifier, left untouched); this is only the
// user-facing label shown in the filter dropdown.
const ENTITY_TYPE_LABELS: Partial<Record<(typeof ENTITY_TYPES)[number], string>> = {
  pilot_configuration: "Platform settings",
};
const RANGES = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "all", label: "All time", hours: null },
] as const;

/** This page is read-only by design: no mutation call exists anywhere in
 * this file, and none should ever be added -- audit_logs is append-only at
 * the database layer (see docs/STAGE1_SECURITY_REMEDIATION_REPORT.md, H-02),
 * and the UI must not imply otherwise. */
function AdminAudit() {
  const [entityType, setEntityType] = useState<(typeof ENTITY_TYPES)[number]>("all");
  const [actionSearch, setActionSearch] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("7d");
  const [rows, setRows] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    let q = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (entityType !== "all") q = q.eq("entity_type", entityType);
    const selectedRange = RANGES.find((r) => r.value === range);
    if (selectedRange?.hours) {
      const cutoff = new Date(Date.now() - selectedRange.hours * 60 * 60 * 1000).toISOString();
      q = q.gte("created_at", cutoff);
    }
    const { data, error: fetchError } = await q;
    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
      return;
    }
    setRows(data ?? []);
  };

  useEffect(() => {
    setRows(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, range]);

  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (!actionSearch.trim()) return rows;
    const needle = actionSearch.trim().toLowerCase();
    return rows.filter((r) => r.action.toLowerCase().includes(needle));
  }, [rows, actionSearch]);

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <div className="pt-2">
          <AdminTabs />
        </div>
        <Eyebrow>Audit activity</Eyebrow>
        <Display className="text-[44px]">Read-only activity log.</Display>
        <Muted>
          Every privileged decision, self-attributed by the trusted backend. Nothing here can be
          edited.
        </Muted>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as (typeof ENTITY_TYPES)[number])}
            className="h-10 rounded-full border border-border-strong bg-surface px-4 text-[12px] uppercase tracking-[0.18em] text-foreground"
            aria-label="Filter by entity type"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "all" ? "All entities" : (ENTITY_TYPE_LABELS[t] ?? t.replace("_", " "))}
              </option>
            ))}
          </select>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as (typeof RANGES)[number]["value"])}
            className="h-10 rounded-full border border-border-strong bg-surface px-4 text-[12px] uppercase tracking-[0.18em] text-foreground"
            aria-label="Filter by time range"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <input
            value={actionSearch}
            onChange={(e) => setActionSearch(e.target.value)}
            placeholder="Search action…"
            aria-label="Search by action"
            className="h-10 flex-1 min-w-[160px] rounded-full border border-border-strong bg-surface px-4 text-[13px] text-foreground placeholder:text-muted-foreground/60"
          />
        </div>

        {error ? (
          <Card variant="outline">
            <CardBody>
              <p role="alert" className="text-[13px] text-destructive">
                Could not load audit activity: {error}
              </p>
            </CardBody>
          </Card>
        ) : !filteredRows ? (
          <Muted>Loading…</Muted>
        ) : filteredRows.length === 0 ? (
          <Card variant="outline">
            <CardBody>
              <Muted>No activity matches these filters.</Muted>
            </CardBody>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredRows.map((row) => (
              <AuditRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Screen>
    </AppShell>
  );
}

function shortId(id: string | null): string {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

function AuditRow({ row }: { row: AuditLog }) {
  const metadataText = row.metadata ? JSON.stringify(row.metadata) : null;
  const metadataDisplay =
    metadataText && metadataText.length > 240 ? `${metadataText.slice(0, 240)}…` : metadataText;

  return (
    <Card variant="quiet">
      <CardBody className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-[16px] text-foreground">{row.action}</span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(row.created_at).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
          <span title={row.actor_id ?? undefined}>
            Actor: {shortId(row.actor_id)}
            {row.actor_role ? ` (${row.actor_role})` : ""}
          </span>
          <span title={row.entity_id ?? undefined}>
            {row.entity_type}: {shortId(row.entity_id)}
          </span>
        </div>
        {metadataDisplay ? (
          <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-surface-2/60 px-3 py-2 text-[11px] text-muted-foreground">
            {metadataDisplay}
          </pre>
        ) : null}
      </CardBody>
    </Card>
  );
}
