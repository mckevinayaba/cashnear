import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen, Display, Muted, Eyebrow, Numeric, Button } from "@/components/ds";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CashNear — Neighbourhood cash access · South Africa" },
      {
        name: "description",
        content:
          "CashNear is a controlled pilot connecting South African customers with verified neighbourhood operators for trusted, on-demand cash.",
      },
      { property: "og:title", content: "CashNear" },
      {
        property: "og:description",
        content: "Neighbourhood cash access. South Africa pilot.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AppShell hideNav>
      <Screen className="!gap-16">
        <header className="flex items-center justify-between pt-2">
          <Wordmark />
          <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" /> ZA · Pilot
          </span>
        </header>

        <section className="pt-4">
          <Eyebrow>Neighbourhood cash access</Eyebrow>
          <Display className="mt-6">
            Cash,
            <br />
            near you.
          </Display>
          <Muted className="mt-5 max-w-[34ch]">
            A controlled South African pilot connecting people who need cash with verified
            neighbourhood operators. Invitation only.
          </Muted>

          <div className="mt-8 flex flex-col gap-3">
            {signedIn ? (
              <Link to="/home">
                <Button size="lg" fullWidth>
                  Continue to CashNear
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth">
                  <Button size="lg" fullWidth>
                    Sign in
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button variant="ghost" size="lg" fullWidth>
                    Create account
                  </Button>
                </Link>
              </>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-x-8 gap-y-8 border-t border-border pt-8">
          <Stat label="Market" value="ZA" hint="South Africa · pilot" />
          <Stat label="Currency" value="R" hint="South African Rand" />
          <Stat label="Fee band" value="R2–8" hint="per pilot request" />
          <Stat label="Verification" value="Manual" hint="ops-reviewed" />
        </section>

        <section className="border-t border-border pt-8">
          <Eyebrow>Infrastructure</Eyebrow>
          <p className="mt-4 font-display text-2xl leading-tight tracking-tight text-foreground/90">
            Building South Africa's most trusted neighbourhood cash network — one verified operator
            at a time.
          </p>
        </section>
      </Screen>
    </AppShell>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-[19px] tracking-[-0.02em] text-foreground">
      Cash<span className="text-gold">·</span>Near
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <Numeric className="text-[30px] leading-none">{value}</Numeric>
      <span className="text-[12px] text-muted-foreground">{hint}</span>
    </div>
  );
}
