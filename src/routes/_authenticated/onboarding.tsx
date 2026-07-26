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
        <Display className="text-[44px]">What do you need?</Display>
        <Muted className="max-w-[38ch]">Get cash, or help people get cash. You can do both.</Muted>

        <div className="flex flex-col gap-4">
          <Card variant="lift">
            <CardBody className="flex flex-col gap-3">
              <Eyebrow className="text-gold">For customers</Eyebrow>
              <h3 className="font-display text-[26px] leading-tight text-foreground">
                I need cash
              </h3>
              <Body className="text-[14px] text-muted-foreground">
                Create an account. We will tell you when cash requests open.
              </Body>
              <Link to="/customer" className="mt-2">
                <Button fullWidth>Continue</Button>
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
                Register your business so we can check it.
              </Body>
              <Link to="/operator/apply" className="mt-2">
                <Button variant="secondary" fullWidth>
                  Continue
                </Button>
              </Link>
            </CardBody>
          </Card>
        </div>
      </Screen>
    </AppShell>
  );
}
