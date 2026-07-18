import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppShell, Screen, Display, Muted, Eyebrow, Body, Button, Card, CardBody } from "@/components/ds";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Get started · CashNear" }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <AppShell hideNav>
      <Screen>
        <div className="flex items-center justify-between pt-2">
          <Eyebrow>Welcome</Eyebrow>
          <button
            onClick={signOut}
            className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        </div>
        <Display className="text-[44px]">Choose your path.</Display>
        <Muted className="max-w-[38ch]">
          CashNear is a two-sided network. You can request cash, run cash for your neighbourhood, or
          both.
        </Muted>

        <div className="flex flex-col gap-4">
          <Card variant="lift">
            <CardBody className="flex flex-col gap-3">
              <Eyebrow className="text-gold">For customers</Eyebrow>
              <h3 className="font-display text-[26px] leading-tight text-foreground">
                Request cash nearby.
              </h3>
              <Body className="text-[14px] text-muted-foreground">
                Once verified, request cash from a neighbourhood operator up to R2 000 per pilot
                transaction.
              </Body>
              <Link to="/customer" className="mt-2">
                <Button fullWidth>Continue as customer</Button>
              </Link>
            </CardBody>
          </Card>

          <Card variant="outline">
            <CardBody className="flex flex-col gap-3">
              <Eyebrow className="text-gold">For operators</Eyebrow>
              <h3 className="font-display text-[26px] leading-tight text-foreground">
                Run cash for your neighbourhood.
              </h3>
              <Body className="text-[14px] text-muted-foreground">
                Businesses with card acceptance can apply to serve as verified CashNear operators.
                Manual review by our operations team.
              </Body>
              <Link to="/operator/apply" className="mt-2">
                <Button variant="secondary" fullWidth>
                  Apply to become an operator
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </Screen>
    </AppShell>
  );
}
