import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import type { Database } from "@/integrations/supabase/types";

type Business = Database["public"]["Tables"]["operator_businesses"]["Row"];

export const Route = createFileRoute("/_authenticated/operator/dashboard")({
  head: () => ({ meta: [{ title: "Operator · CashNear" }] }),
  component: OperatorDashboard,
});

const STATUS_LABEL: Record<string, { label: string; tone: "muted" | "success" | "warn" | "danger" }> = {
  draft: { label: "Draft", tone: "muted" },
  submitted: { label: "Submitted", tone: "warn" },
  under_review: { label: "Under review", tone: "warn" },
  info_requested: { label: "More info requested", tone: "warn" },
  site_verification_required: { label: "Site visit required", tone: "warn" },
  approved: { label: "Approved & live", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  suspended: { label: "Suspended", tone: "danger" },
  deactivated: { label: "Deactivated", tone: "danger" },
};

function OperatorDashboard() {
  const navigate = useNavigate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("operator_businesses")
        .select("*")
        .eq("owner_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setBusiness(data);
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  if (loading) {
    return (
      <AppShell hideNav>
        <Screen>
          <Muted>Loading…</Muted>
        </Screen>
      </AppShell>
    );
  }

  if (!business) {
    return (
      <AppShell hideNav>
        <Screen>
          <Eyebrow>Operator</Eyebrow>
          <Display className="text-[42px]">No application yet.</Display>
          <Link to="/operator/apply">
            <Button size="lg">Start application</Button>
          </Link>
        </Screen>
      </AppShell>
    );
  }

  const status = STATUS_LABEL[business.application_status] ?? STATUS_LABEL.draft;
  const editable =
    business.application_status === "draft" || business.application_status === "info_requested";

  return (
    <AppShell hideNav>
      <Screen>
        <header className="flex items-center justify-between pt-2">
          <Eyebrow>Operator</Eyebrow>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        <div>
          <Display className="text-[42px]">{business.trading_name ?? "Your operator"}.</Display>
          <Muted className="mt-2">
            {business.suburb ?? ""}
            {business.city ? `, ${business.city}` : ""}
          </Muted>
        </div>

        <Card variant="lift">
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Eyebrow>Application status</Eyebrow>
              <span
                className={
                  status.tone === "success"
                    ? "text-[12px] text-success"
                    : status.tone === "danger"
                      ? "text-[12px] text-destructive"
                      : status.tone === "warn"
                        ? "text-[12px] text-gold"
                        : "text-[12px] text-muted-foreground"
                }
              >
                {status.label}
              </span>
            </div>
            {business.review_notes ? (
              <Body className="text-[14px] text-muted-foreground">
                Reviewer note: {business.review_notes}
              </Body>
            ) : null}
            {business.application_status === "approved" ? (
              <Body className="text-[14px] text-muted-foreground">
                You are live in the pilot. Matching and transaction flows unlock in Stage 2.
              </Body>
            ) : (
              <Body className="text-[14px] text-muted-foreground">
                We'll notify you as soon as the operations team completes review — typically within
                24 hours during pilot hours.
              </Body>
            )}
            {editable ? (
              <Link to="/operator/apply" className="mt-2">
                <Button fullWidth>Continue application</Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>

        <Card variant="outline">
          <CardBody className="flex flex-col gap-2">
            <Eyebrow>Coming in Stage 2</Eyebrow>
            <Body className="text-[14px] text-muted-foreground">
              Availability toggle, incoming cash requests, transaction ledger, and payouts.
            </Body>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}
