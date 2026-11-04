import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { useCallback, useEffect, useState } from "react";
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
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { describeCashError } from "@/lib/cash";
import type { Database } from "@/integrations/supabase/types";

type Rail = Database["public"]["Tables"]["cash_rails"]["Row"];
type Incident = Database["public"]["Tables"]["cash_incidents"]["Row"];
type Point = Database["public"]["Tables"]["cash_points"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/cash")({
  head: () => ({ meta: [{ title: "Cash holds · CashNear Ops" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminCash,
});

const SEVERITY_TONE: Record<string, "muted" | "warn" | "danger"> = {
  low: "muted",
  medium: "warn",
  high: "danger",
};

function AdminCash() {
  const auth = useAuth();
  const isSuper = auth.hasRole("super_admin");
  const [rails, setRails] = useState<Rail[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [paused, setPaused] = useState<(Point & { name: string })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [railChange, setRailChange] = useState<{ rail: Rail; active: boolean } | null>(null);

  const load = useCallback(async () => {
    const [r, i, p] = await Promise.all([
      supabase.from("cash_rails").select("*").order("id"),
      supabase.from("cash_incidents").select("*").neq("status", "resolved").order("sla_due"),
      supabase.from("cash_points").select("*").not("paused_reason", "is", null),
    ]);
    if (r.error || i.error || p.error) setError("Could not load cash holds data.");
    setRails(r.data ?? []);
    setIncidents(i.data ?? []);
    const points = p.data ?? [];
    if (points.length > 0) {
      const { data: names } = await supabase
        .from("operator_businesses")
        .select("id, trading_name")
        .in(
          "id",
          points.map((x) => x.business_id),
        );
      const byId = new Map((names ?? []).map((n) => [n.id, n.trading_name ?? "Unnamed shop"]));
      setPaused(points.map((x) => ({ ...x, name: byId.get(x.business_id) ?? "Unnamed shop" })));
    } else {
      setPaused([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <div className="pt-2">
          <AdminTabs />
        </div>
        <Eyebrow>Cash holds</Eyebrow>
        <Display className="text-[44px]">Pilot controls.</Display>
        <Muted>Rails, open reports and paused shops. Every change here is audited.</Muted>

        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}

        <section>
          <Eyebrow>Rails</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            {rails === null ? (
              <Muted>Loading…</Muted>
            ) : (
              rails.map((r) => (
                <Card key={r.id} variant="quiet">
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-display text-[18px]">{r.label}</span>
                      <StatusBadge
                        label={r.active ? "Open to customers" : "Closed"}
                        tone={r.active ? "success" : "muted"}
                      />
                      <StatusBadge
                        label={r.fee_verified ? "Fee verified" : "Example fee"}
                        tone={r.fee_verified ? "success" : "warn"}
                      />
                    </div>
                    {isSuper ? (
                      <Button
                        variant="secondary"
                        onClick={() => setRailChange({ rail: r, active: !r.active })}
                      >
                        {r.active ? "Close rail" : "Open rail"}
                      </Button>
                    ) : (
                      <Muted className="text-[12px]">Only a super admin can change this.</Muted>
                    )}
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </section>

        <section>
          <Eyebrow>Open reports</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            {incidents === null ? (
              <Muted>Loading…</Muted>
            ) : incidents.length === 0 ? (
              <Card variant="outline">
                <CardBody>
                  <Muted>No open reports.</Muted>
                </CardBody>
              </Card>
            ) : (
              incidents.map((i) => {
                const overdue = new Date(i.sla_due).getTime() < Date.now();
                return (
                  <Card key={i.id} variant="quiet">
                    <CardBody className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge
                          label={i.severity}
                          tone={SEVERITY_TONE[i.severity] ?? "muted"}
                        />
                        <span className="text-[15px]">{i.kind.replace(/_/g, " ")}</span>
                        <span
                          className={
                            overdue
                              ? "text-[12px] text-destructive"
                              : "text-[12px] text-muted-foreground"
                          }
                        >
                          {overdue ? "Overdue · " : "Respond by "}
                          {new Date(i.sla_due).toLocaleString()}
                        </span>
                      </div>
                      {i.details ? (
                        <Body className="text-[14px] text-muted-foreground">{i.details}</Body>
                      ) : null}
                      <div className="flex flex-wrap gap-3">
                        <Link to="/admin/operators/$id" params={{ id: i.business_id }}>
                          <Button variant="ghost">Open shop</Button>
                        </Link>
                        <Button variant="secondary" onClick={() => setResolving(i)}>
                          Resolve
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                );
              })
            )}
          </div>
        </section>

        <section>
          <Eyebrow>Paused shops</Eyebrow>
          <div className="mt-3 flex flex-col gap-2">
            {paused === null ? (
              <Muted>Loading…</Muted>
            ) : paused.length === 0 ? (
              <Card variant="outline">
                <CardBody>
                  <Muted>No paused shops.</Muted>
                </CardBody>
              </Card>
            ) : (
              paused.map((p) => (
                <Link
                  key={p.business_id}
                  to="/admin/operators/$id"
                  params={{ id: p.business_id }}
                  className="block"
                >
                  <Card variant="quiet" className="transition-colors hover:bg-surface">
                    <CardBody className="flex items-center justify-between gap-3">
                      <span className="font-display text-[18px]">{p.name}</span>
                      <StatusBadge label={p.paused_reason ?? ""} tone="warn" />
                    </CardBody>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </section>

        <ConfirmActionDialog
          open={resolving !== null}
          onOpenChange={(o) => !o && setResolving(null)}
          title="Resolve this report?"
          description="Record what you checked and what happened. This is kept in the audit log."
          confirmLabel="Resolve"
          requireReason
          reasonLabel="What did you find?"
          onConfirm={async (reason) => {
            if (!resolving) return;
            const { error: e } = await supabase.rpc("cash_resolve_incident", {
              p_incident: resolving.id,
              p_resolution: reason,
            });
            if (e) throw new Error(describeCashError(e.message));
          }}
          onSuccess={() => void load()}
        />

        <ConfirmActionDialog
          open={railChange !== null}
          onOpenChange={(o) => !o && setRailChange(null)}
          title={railChange?.active ? "Open this rail to customers?" : "Close this rail?"}
          description={
            railChange?.active
              ? "Customers will be able to request cash on this rail from enrolled shops. Check that the fee is confirmed first."
              : "Customers will no longer be able to start requests on this rail. Holds already in progress finish normally."
          }
          confirmLabel={railChange?.active ? "Open rail" : "Close rail"}
          destructive={!railChange?.active}
          onConfirm={async () => {
            if (!railChange) return;
            const { error: e } = await supabase.rpc("cash_set_rail_active", {
              p_rail: railChange.rail.id,
              p_active: railChange.active,
            });
            if (e) throw new Error(describeCashError(e.message));
          }}
          onSuccess={() => void load()}
        />
      </Screen>
    </AppShell>
  );
}
