import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AppShell,
  Screen,
  Eyebrow,
  Display,
  Muted,
  Body,
  Card,
  CardBody,
  Button,
} from "@/components/ds";
import { useAuth } from "@/hooks/use-auth";
import { requireAdminBeforeLoad } from "@/lib/admin-route-guard";
import { DEMO_CUSTOMER_USER_ID, DEMO_OPERATOR_OWNER_USER_ID } from "@/lib/demo-accounts";
import { resetDemoAccount } from "@/lib/demo-admin.functions";
import { ConfirmActionDialog } from "@/components/admin/ConfirmActionDialog";
import type { Database } from "@/integrations/supabase/types";

type AuditLog = Database["public"]["Tables"]["audit_logs"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Operations Control · CashNear" }] }),
  beforeLoad: () => requireAdminBeforeLoad(),
  component: AdminHome,
});

type OperatorCounts = {
  submitted: number;
  under_review: number;
  approved: number;
  rejected: number;
  suspended: number;
};
type CustomerCounts = { pending: number; approved: number; rejected: number };

function AdminHome() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [operatorCounts, setOperatorCounts] = useState<OperatorCounts | null>(null);
  const [customerCounts, setCustomerCounts] = useState<CustomerCounts | null>(null);
  const [recent, setRecent] = useState<AuditLog[] | null>(null);

  useEffect(() => {
    (async () => {
      const opStatuses = [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "suspended",
      ] as const;
      const opResults = await Promise.all(
        opStatuses.map((s) =>
          supabase
            .from("operator_businesses")
            .select("id", { count: "exact", head: true })
            .eq("application_status", s)
            // Exclude the synthetic demo operator -- these counts are
            // meant to reflect real operational activity.
            .neq("owner_id", DEMO_OPERATOR_OWNER_USER_ID),
        ),
      );
      setOperatorCounts({
        submitted: opResults[0].count ?? 0,
        under_review: opResults[1].count ?? 0,
        approved: opResults[2].count ?? 0,
        rejected: opResults[3].count ?? 0,
        suspended: opResults[4].count ?? 0,
      });

      const custStatuses = ["pending", "approved", "rejected"] as const;
      const custResults = await Promise.all(
        custStatuses.map((s) =>
          supabase
            .from("customer_profiles")
            .select("user_id", { count: "exact", head: true })
            .eq("verification_status", s)
            // Exclude the synthetic demo customer -- see DEMO_CUSTOMER_USER_ID.
            .neq("user_id", DEMO_CUSTOMER_USER_ID),
        ),
      );
      setCustomerCounts({
        pending: custResults[0].count ?? 0,
        approved: custResults[1].count ?? 0,
        rejected: custResults[2].count ?? 0,
      });

      const { data: recentRows } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecent(recentRows ?? []);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <AppShell hideNav desktopWide>
      <Screen>
        <header className="flex items-center justify-between pt-2">
          <div>
            <Eyebrow>Operations Control Centre</Eyebrow>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Signed in as {auth.user?.email} ·{" "}
              {auth.hasRole("super_admin") ? "Super admin" : "Admin"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        <Display className="text-[48px]">CashNear.</Display>
        <Muted>
          Manual verification of customers and operators. Auditable trail on every decision.
        </Muted>

        <section>
          <Eyebrow>Operators</Eyebrow>
          <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Submitted" value={operatorCounts?.submitted ?? "—"} />
            <Stat label="Under review" value={operatorCounts?.under_review ?? "—"} />
            <Stat label="Approved" value={operatorCounts?.approved ?? "—"} />
            <Stat label="Rejected" value={operatorCounts?.rejected ?? "—"} />
            <Stat label="Suspended" value={operatorCounts?.suspended ?? "—"} />
          </div>
        </section>

        <section>
          <Eyebrow>Customers</Eyebrow>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <Stat label="Awaiting review" value={customerCounts?.pending ?? "—"} />
            <Stat label="Approved" value={customerCounts?.approved ?? "—"} />
            <Stat label="Rejected" value={customerCounts?.rejected ?? "—"} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Link to="/admin/customers">
            <Card variant="lift" className="cursor-pointer h-full">
              <CardBody>
                <Eyebrow className="text-gold">Verification queue</Eyebrow>
                <h3 className="mt-2 font-display text-[22px] leading-tight">Review customer KYC</h3>
                <Body className="mt-2 text-[14px] text-muted-foreground">
                  Approve or reject identity verification submissions.
                </Body>
              </CardBody>
            </Card>
          </Link>

          <Link to="/admin/operators">
            <Card variant="lift" className="cursor-pointer h-full">
              <CardBody>
                <Eyebrow className="text-gold">Verification queue</Eyebrow>
                <h3 className="mt-2 font-display text-[22px] leading-tight">
                  Review operator applications
                </h3>
                <Body className="mt-2 text-[14px] text-muted-foreground">
                  Approve, request info, reject, suspend, or reinstate. Every decision is audited.
                </Body>
              </CardBody>
            </Card>
          </Link>

          <Link to="/admin/audit">
            <Card variant="outline" className="cursor-pointer h-full">
              <CardBody>
                <Eyebrow>Read-only</Eyebrow>
                <h3 className="mt-2 font-display text-[22px] leading-tight">Audit activity</h3>
                <Body className="mt-2 text-[14px] text-muted-foreground">
                  Every privileged decision, self-attributed and append-only.
                </Body>
              </CardBody>
            </Card>
          </Link>
        </div>

        <section>
          <Eyebrow>Recent activity</Eyebrow>
          <div className="mt-3 flex flex-col gap-1.5">
            {recent === null ? (
              <Muted>Loading…</Muted>
            ) : recent.length === 0 ? (
              <Muted>No recent activity.</Muted>
            ) : (
              recent.map((r) => (
                <p key={r.id} className="text-[13px] text-muted-foreground">
                  <span className="text-foreground">{r.action}</span> ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              ))
            )}
          </div>
        </section>

        {auth.hasRole("super_admin") ? <DemoControls /> : null}
      </Screen>
    </AppShell>
  );
}

/**
 * Founder-only (super_admin-only) demo reset controls. Deliberately not a
 * generic "delete any account" tool -- each button maps to a fixed
 * `target: "customer" | "operator"` that the server resolves to the
 * hardcoded DEMO_CUSTOMER_USER_ID / DEMO_OPERATOR_OWNER_USER_ID constants
 * (see demo-accounts.ts and demo-admin.functions.ts). There is no input
 * here a client could use to target a real account.
 */
function DemoControls() {
  const reset = useServerFn(resetDemoAccount);
  const [pending, setPending] = useState<"customer" | "operator" | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  return (
    <section>
      <Eyebrow>Founder demo controls</Eyebrow>
      <Card variant="outline" className="mt-3">
        <CardBody className="flex flex-col gap-3">
          <Body className="text-[14px] text-muted-foreground">
            Resets the synthetic demo customer/operator back to a blank, freshly-signed-up state --
            for use before or after a founder demonstration. This can never affect a real customer
            or operator account.
          </Body>
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={() => setPending("customer")}>
              Reset demo customer
            </Button>
            <Button variant="ghost" onClick={() => setPending("operator")}>
              Reset demo operator
            </Button>
          </div>
          {lastResult ? <Muted>{lastResult}</Muted> : null}
        </CardBody>
      </Card>

      <ConfirmActionDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending === "customer" ? "Reset the demo customer?" : "Reset the demo operator?"}
        description="This deletes the demo account's application/verification data and uploaded demo documents, returning it to a blank, freshly-signed-up state. This only ever affects the designated demo account."
        confirmLabel="Reset"
        onConfirm={async () => {
          if (!pending) return;
          await reset({ data: { target: pending } });
        }}
        onSuccess={() => setLastResult(`Demo ${pending} reset.`)}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="quiet">
      <CardBody className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </span>
        <span className="font-display text-[36px] tabular text-foreground">{value}</span>
      </CardBody>
    </Card>
  );
}
