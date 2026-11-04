import { createFileRoute, Link } from "@tanstack/react-router";
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
import { ShareJoinLink } from "@/components/ShareJoinLink";
import { ShopCashDesk } from "@/components/cash/ShopCashDesk";
import { useShopTheme } from "@/hooks/use-shop-theme";
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
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [cashEnrolled, setCashEnrolled] = useState(false);
  const [theme, toggleTheme] = useShopTheme();

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
      if (data?.id) {
        const { data: point } = await supabase
          .from("cash_points")
          .select("enrolled")
          .eq("business_id", data.id)
          .maybeSingle();
        setCashEnrolled(!!point?.enrolled);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <AppShell size="medium">
        <Screen>
          <Muted>Loading…</Muted>
        </Screen>
      </AppShell>
    );
  }

  if (!business) {
    return (
      <AppShell size="medium">
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
    <AppShell size="medium">
      <Screen>
        <header className="flex items-center justify-between pt-2">
          <Eyebrow>Your business</Eyebrow>
          <button
            onClick={toggleTheme}
            aria-pressed={theme === "day"}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            {theme === "day" ? "Night mode" : "Daylight"}
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
            {business.application_status !== "approved" ? (
              <Body className="text-[14px] text-muted-foreground">
                We are checking your business. This usually takes 24 hours.
              </Body>
            ) : null}
            {editable ? (
              <Link to="/operator/apply" className="mt-2">
                <Button fullWidth>Continue registering</Button>
              </Link>
            ) : null}
          </CardBody>
        </Card>

        {business.application_status === "approved" && cashEnrolled ? (
          <section className="flex flex-col gap-4">
            <Eyebrow>Cash desk</Eyebrow>
            <ShopCashDesk businessId={business.id} />
          </section>
        ) : null}

        {business.application_status === "approved" && !cashEnrolled ? (
          <Card variant="lift">
            <CardBody className="flex flex-col gap-3">
              <Display className="text-[24px]">Your business is approved.</Display>
              <Body className="text-[14px] text-muted-foreground">
                You are one of the first CashNear shops. We are setting up your cash desk now, and
                we will contact you when it is ready for you to use.
              </Body>
              <dl className="flex flex-col gap-2 text-[14px]">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Application approved</dt>
                  <dd className="text-success">Done</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Documents accepted</dt>
                  <dd className="text-success">Done</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">Your cash desk</dt>
                  <dd className="text-gold">We are setting it up</dd>
                </div>
              </dl>
              <div>
                <Eyebrow>What happens next</Eyebrow>
                <Body className="mt-1 text-[14px] text-muted-foreground">
                  We will contact you using the details on your application. Then you can choose
                  when you take requests and keep cash aside for people near you.
                </Body>
              </div>
              <div>
                <Eyebrow>Need to update your details, or have a question?</Eyebrow>
                <Body className="mt-1 text-[14px] text-muted-foreground">
                  Email{" "}
                  <a href="mailto:support@cashnear.co" className="underline">
                    support@cashnear.co
                  </a>{" "}
                  and we'll help, including updating contact details on file.
                </Body>
              </div>
              <div>
                <Eyebrow>Know another shop?</Eyebrow>
                <Body className="mb-3 mt-1 text-[14px] text-muted-foreground">
                  Send them this link. It is free for them to register.
                </Body>
                <ShareJoinLink audience="shop" label="Send to a shop" />
              </div>
            </CardBody>
          </Card>
        ) : business.application_status !== "approved" ? (
          <Card variant="outline">
            <CardBody className="flex flex-col gap-2">
              <Eyebrow>After we approve you</Eyebrow>
              <Body className="text-[14px] text-muted-foreground">
                You choose when you take requests. You see how much cash a customer wants before you
                say yes. Customers pay you on your own payment machine.
              </Body>
            </CardBody>
          </Card>
        ) : null}
      </Screen>
    </AppShell>
  );
}
