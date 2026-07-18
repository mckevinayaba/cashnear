import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen, Eyebrow, Display, Muted, Body, Card, CardBody } from "@/components/ds";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Operations Control · CashNear" }] }),
  component: AdminHome,
});

function AdminHome() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<{ submitted: number; under_review: number; approved: number; rejected: number } | null>(null);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.isAdmin) navigate({ to: "/home", replace: true });
  }, [auth, navigate]);

  useEffect(() => {
    (async () => {
      const statuses = ["submitted", "under_review", "approved", "rejected"] as const;
      const results = await Promise.all(
        statuses.map((s) =>
          supabase
            .from("operator_businesses")
            .select("id", { count: "exact", head: true })
            .eq("application_status", s),
        ),
      );
      setCounts({
        submitted: results[0].count ?? 0,
        under_review: results[1].count ?? 0,
        approved: results[2].count ?? 0,
        rejected: results[3].count ?? 0,
      });
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
              Signed in as {auth.user?.email} · {auth.isAdmin ? "Admin" : ""}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        <Display className="text-[48px]">CashNear pilot.</Display>
        <Muted>Manual verification of operators. Auditable trail on every decision.</Muted>

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Submitted" value={counts?.submitted ?? "—"} />
          <Stat label="Under review" value={counts?.under_review ?? "—"} />
          <Stat label="Approved" value={counts?.approved ?? "—"} />
          <Stat label="Rejected" value={counts?.rejected ?? "—"} />
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Link to="/admin/operators">
            <Card variant="lift" className="cursor-pointer">
              <CardBody>
                <Eyebrow className="text-gold">Verification queue</Eyebrow>
                <h3 className="mt-2 font-display text-[24px] leading-tight">
                  Review operator applications
                </h3>
                <Body className="mt-2 text-[14px] text-muted-foreground">
                  Approve, request info, or reject applications. Every decision is audited.
                </Body>
              </CardBody>
            </Card>
          </Link>

          <Card variant="outline">
            <CardBody>
              <Eyebrow>Coming in Stage 2</Eyebrow>
              <h3 className="mt-2 font-display text-[24px] leading-tight">Transaction oversight</h3>
              <Body className="mt-2 text-[14px] text-muted-foreground">
                Live transaction feed, dispute resolution, and network health.
              </Body>
            </CardBody>
          </Card>
        </div>
      </Screen>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card variant="quiet">
      <CardBody className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{label}</span>
        <span className="font-display text-[36px] tabular text-foreground">{value}</span>
      </CardBody>
    </Card>
  );
}
