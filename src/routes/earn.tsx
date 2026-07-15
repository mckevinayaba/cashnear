import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/earn")({
  head: () => ({
    meta: [
      { title: "Earn — Become an Operator" },
      {
        name: "description",
        content:
          "Earn from cash requests in your neighbourhood. Verified. Protected. Local.",
      },
    ],
  }),
  component: Earn,
});

const PILLARS = [
  {
    label: "Trust",
    body: "Every operator is identity-verified with continuous behavioural review.",
  },
  {
    label: "Safety",
    body: "Escrow-backed transactions and secure one-time codes protect every collection.",
  },
  {
    label: "Community",
    body: "Serve your neighbours. Build a trust score that opens the network to you.",
  },
];

function Earn() {
  const loc = DEFAULT_LOCALE;

  return (
    <AppShell
      header={
        <div className="flex items-baseline justify-between">
          <Eyebrow>Operator programme</Eyebrow>
          <span className="text-[11px] text-muted-foreground">Invite-based · {loc.country}</span>
        </div>
      }
    >
      <Screen className="!gap-16">
        {/* Hero */}
        <section className="pt-4">
          <Eyebrow>Potential monthly earnings</Eyebrow>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="font-display text-3xl text-muted-foreground">R</span>
            <Numeric className="text-[80px] leading-none">8,400</Numeric>
          </div>
          <Muted className="mt-4">
            Average verified operator, 3 km radius, evening hours.
          </Muted>

          <Display className="mt-12 max-w-[14ch]">
            The neighbourhood works.
          </Display>
          <Muted className="mt-5 max-w-[34ch]">
            Every day, thousands convert digital money into cash through trusted
            neighbours. CashNear brings that market into one protected network —
            and pays the people who make it work.
          </Muted>
        </section>

        {/* Pillars */}
        <Section>
          <Headline>Why operators join</Headline>
          <ul className="mt-2 flex flex-col divide-y divide-border border-t border-border">
            {PILLARS.map((p) => (
              <li key={p.label} className="flex flex-col gap-2 py-6">
                <span className="text-[11px] uppercase tracking-[0.22em] text-gold">
                  {p.label}
                </span>
                <p className="max-w-[42ch] text-[15px] leading-[1.55] text-foreground/90">
                  {p.body}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {/* Earnings table */}
        <Section>
          <Headline>What you'd take home</Headline>
          <div className="mt-2 flex flex-col divide-y divide-border border-t border-b border-border">
            {[
              { hours: "4 hrs / week", amount: 1200 },
              { hours: "10 hrs / week", amount: 3600 },
              { hours: "Full evenings", amount: 8400 },
              { hours: "Full-time", amount: 21000 },
            ].map((row) => (
              <div
                key={row.hours}
                className="flex items-baseline justify-between py-4"
              >
                <span className="text-[14px] text-muted-foreground">
                  {row.hours}
                </span>
                <Numeric className="text-[18px]">
                  {formatAmount(row.amount, loc)}
                  <span className="ml-1 text-[12px] text-muted-foreground">/ mo</span>
                </Numeric>
              </div>
            ))}
          </div>
        </Section>

        <Button variant="gold" size="lg" fullWidth>
          Apply to become an operator
        </Button>
      </Screen>
    </AppShell>
  );
}
