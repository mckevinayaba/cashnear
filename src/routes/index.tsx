import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AppShell,
  Screen,
  Section,
  Display,
  Headline,
  Muted,
  Eyebrow,
  Numeric,
  Button,
} from "@/components/ds";
import { DEFAULT_LOCALE, formatAmount } from "@/lib/currency";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CashNear — Cash, near you" },
      {
        name: "description",
        content:
          "CashNear is Africa's neighbourhood financial access infrastructure. Trusted cash, everywhere.",
      },
      { property: "og:title", content: "CashNear" },
      {
        property: "og:description",
        content: "Cash, near you. Africa's trusted neighbourhood cash network.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const loc = DEFAULT_LOCALE;

  return (
    <AppShell header={<HomeHeader />}>
      <Screen className="!gap-14">
        {/* Hero */}
        <section className="pt-6">
          <Eyebrow>Cash access · {loc.country}</Eyebrow>
          <Display className="mt-6">
            Cash,
            <br />
            near you.
          </Display>
          <Muted className="mt-5 max-w-[32ch]">
            Request cash from verified neighbourhood operators. No queues, no
            branches — just people you can trust.
          </Muted>

          <div className="mt-8 flex flex-col gap-3">
            <Link to="/get-cash">
              <Button variant="primary" size="lg" fullWidth>
                Find cash nearby
              </Button>
            </Link>
            <Link to="/earn">
              <Button variant="ghost" size="lg" fullWidth>
                Become an operator
              </Button>
            </Link>
          </div>
        </section>

        {/* Network pulse — quiet trust signal */}
        <Section>
          <div className="flex items-baseline justify-between">
            <Headline>The network</Headline>
            <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 animate-fade rounded-full bg-success" />
              Live
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-8 border-t border-border pt-8">
            <Stat label="Verified operators" value="1,248" hint="within 3 km" />
            <Stat label="Avg. match time" value="2m 14s" hint="tonight" />
            <Stat label="Cash available" value={formatAmount(482000, loc)} hint="in your area" />
            <Stat label="Trust rating" value="4.94" hint="last 30 days" />
          </div>
        </Section>

        {/* Editorial footer */}
        <section className="border-t border-border pt-8">
          <Eyebrow>Infrastructure</Eyebrow>
          <p className="mt-4 font-display text-2xl leading-tight tracking-tight text-foreground/90">
            Connecting people, merchants, banks and institutions through
            Africa's largest trusted cash network.
          </p>
        </section>
      </Screen>
    </AppShell>
  );
}

function HomeHeader() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Wordmark />
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        ZA
      </div>
    </div>
  );
}

export function Wordmark() {
  return (
    <span className="font-display text-[19px] tracking-[-0.02em] text-foreground">
      Cash<span className="text-gold">·</span>Near
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <Numeric className="text-[30px] leading-none">{value}</Numeric>
      <span className="text-[12px] text-muted-foreground">{hint}</span>
    </div>
  );
}
