import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AppShell,
  Screen,
  Display,
  Muted,
  Eyebrow,
  Body,
  Button,
  Card,
  CardBody,
} from "@/components/ds";
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
        <Display className="text-[44px]">Welcome to CashNear.</Display>
        <Muted className="max-w-[38ch]">
          You are one of our first members. Choose what you want to do. You can do both.
        </Muted>

        <div className="flex flex-col gap-4">
          <Card variant="lift">
            <CardBody className="flex flex-col gap-3">
              <Eyebrow className="text-gold">For customers</Eyebrow>
              <h3 className="font-display text-[26px] leading-tight text-foreground">
                I need cash
              </h3>
              <Body className="text-[14px] text-muted-foreground">
                Find a shop near you that keeps your cash aside. You see the fee before you go.
              </Body>
              <Link to="/customer" className="mt-2">
                <Button fullWidth>Get cash</Button>
              </Link>
            </CardBody>
          </Card>

          <Card variant="outline">
            <CardBody className="flex flex-col gap-3">
              <Eyebrow className="text-gold">For businesses</Eyebrow>
              <h3 className="font-display text-[26px] leading-tight text-foreground">
                I own a business
              </h3>
              <Body className="text-[14px] text-muted-foreground">
                Register your shop. It is free. We check it, then you can help people near you get
                cash.
              </Body>
              <Link to="/operator/apply" className="mt-2">
                <Button variant="secondary" fullWidth>
                  Register my shop
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </Screen>
    </AppShell>
  );
}
