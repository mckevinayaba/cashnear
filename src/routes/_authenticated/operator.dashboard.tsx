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
  head: () => ({ meta: [{ title: "Your business · CashNear" }] }),
  component: OperatorDashboard,
});

const STATUS_LABEL: Record<
  string,
  { label: string; tone: "muted" | "success" | "warn" | "danger" }
> = {
  draft: { label: "Draft", tone: "muted" },
  submitted: { label: "Sent", tone: "warn" },
  under_review: { label: "We are checking", tone: "warn" },
  info_requested: { label: "More info needed", tone: "warn" },
  site_verification_required: { label: "Visit needed", tone: "warn" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Not approved", tone: "danger" },
  suspended: { label: "Paused", tone: "danger" },
  deactivated: { label: "Closed", tone: "danger" },
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
          <Eyebrow>Your business</Eyebrow>
          <Display className="text-[42px]">Finish registering your business.</Display>
          <Link to="/operator/apply">
            <Button size="lg">Register my business</Button>
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
          <Eyebrow>Your business</Eyebrow>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        <div>
          <Display className="text-[42px]">{business.trading_name ?? "Your business"}.</Display>
          <Muted className="mt-2">
            {business.suburb ?? ""}
            {business.city ? `, ${business.city}` : ""}
          </Muted>
        </div>

        <Card variant="lift">
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Eyebrow>Status</Eyebrow>
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
                Note from CashNear: {business.review_notes}
              </Body>
            ) : null}
            {business.application_status === "approved" ? (
              <Body className="text-[14px] text-muted-foreground">
                Your business has been approved. Cash requests are not open yet. We will let you
                know when you can start.
              </Body>
            ) : (
              <Body className="text-[14px] text-muted-foreground">
                We are checking your business. This usually takes 24 hours.
              </Body>
            )}
            {editable ? (
              <Link to="/operator/apply" className="mt-2">
                <Button fullWidth>Continue registering</Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>

        <Card variant="outline">
          <CardBody className="flex flex-col gap-2">
            <Eyebrow>Coming soon</Eyebrow>
            <Body className="text-[14px] text-muted-foreground">
              When cash requests open, you will choose when you're available, see requests, and get
              paid.
            </Body>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}
