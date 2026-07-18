import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AppShell,
  Screen,
  Display,
  Muted,
  Eyebrow,
  Card,
  CardBody,
  Button,
  Body,
} from "@/components/ds";
import { DEFAULT_LOCALE, formatAmount } from "@/lib/currency";
import type { Database } from "@/integrations/supabase/types";

type CustomerProfile = Database["public"]["Tables"]["customer_profiles"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const Route = createFileRoute("/_authenticated/customer")({
  head: () => ({ meta: [{ title: "Home · CashNear" }] }),
  component: Customer,
});

function Customer() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const [p, c] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userData.user.id).maybeSingle(),
        supabase
          .from("customer_profiles")
          .select("*")
          .eq("user_id", userData.user.id)
          .maybeSingle(),
      ]);
      setProfile(p.data);
      setCustomer(c.data);
      setLoading(false);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const status = customer?.verification_status ?? "unverified";
  const statusLabel: Record<string, string> = {
    unverified: "Not verified",
    pending: "Under review",
    approved: "Verified",
    rejected: "Rejected",
    suspended: "Suspended",
  };

  return (
    <AppShell hideNav>
      <Screen>
        <header className="flex items-center justify-between pt-2">
          <div>
            <Eyebrow>CashNear</Eyebrow>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {profile?.full_name ?? profile?.email ?? "Customer"}
            </p>
          </div>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </header>

        <div>
          <Display className="text-[44px]">
            Cash,
            <br />
            near you.
          </Display>
          <Muted className="mt-3 max-w-[32ch]">
            Verified customers can request cash from R{50} up to{" "}
            {formatAmount(2000, DEFAULT_LOCALE)} per pilot transaction.
          </Muted>
        </div>

        <Card variant="lift">
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Eyebrow>Verification</Eyebrow>
              <span
                className={
                  status === "approved"
                    ? "text-[12px] text-success"
                    : status === "rejected" || status === "suspended"
                      ? "text-[12px] text-destructive"
                      : "text-[12px] text-muted-foreground"
                }
              >
                {statusLabel[status]}
              </span>
            </div>
            <h3 className="font-display text-[22px] leading-tight text-foreground">
              {status === "approved"
                ? "You're verified."
                : status === "pending"
                  ? "We're reviewing your documents."
                  : "Verify your identity to unlock cash requests."}
            </h3>
            <Body className="text-[14px] text-muted-foreground">
              {loading
                ? "…"
                : "During the pilot, verification is manually reviewed by our operations team, typically within 24 hours."}
            </Body>

            <Button variant="secondary" disabled className="mt-2">
              Start verification (coming in Stage 2)
            </Button>
          </CardBody>
        </Card>

        <Card variant="outline">
          <CardBody className="flex flex-col gap-3">
            <Eyebrow>Also available</Eyebrow>
            <Body className="text-[14px] text-muted-foreground">
              Run a business with card acceptance? Apply to become a verified CashNear operator.
            </Body>
            <Link to="/operator/apply">
              <Button variant="ghost" fullWidth>
                Apply to become an operator →
              </Button>
            </Link>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}
