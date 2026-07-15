import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Screen,
  Section,
  Display,
  Muted,
  Eyebrow,
  Numeric,
} from "@/components/ds";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile — CashNear" }],
  }),
  component: Profile,
});

const GROUPS: { title: string; rows: { label: string; value?: string; hint?: string }[] }[] = [
  {
    title: "Identity",
    rows: [
      { label: "Legal name", value: "Amara N.", hint: "Verified" },
      { label: "National ID", value: "•••• 4821", hint: "Verified" },
      { label: "Home neighbourhood", value: "Rosebank, Johannesburg" },
    ],
  },
  {
    title: "Verification",
    rows: [
      { label: "Selfie match", value: "Passed" },
      { label: "Address proof", value: "Passed" },
      { label: "Banking link", value: "Standard Bank", hint: "Active" },
    ],
  },
  {
    title: "Devices",
    rows: [
      { label: "iPhone 15", hint: "Cape Town · This device" },
      { label: "MacBook Air", hint: "Cape Town · 2 days ago" },
    ],
  },
  {
    title: "Notifications",
    rows: [
      { label: "Match alerts", value: "On" },
      { label: "Security alerts", value: "On" },
      { label: "Marketing", value: "Off" },
    ],
  },
  {
    title: "Privacy & support",
    rows: [
      { label: "Data & privacy" },
      { label: "Help centre" },
      { label: "Contact CashNear" },
    ],
  },
];

function Profile() {
  return (
    <AppShell
      header={
        <div className="flex items-baseline justify-between">
          <Eyebrow>Profile</Eyebrow>
          <span className="text-[11px] text-muted-foreground">Encrypted</span>
        </div>
      }
    >
      <Screen className="!gap-14">
        <section className="pt-2">
          <Display>Amara N.</Display>
          <Muted className="mt-3">Verified since March 2026.</Muted>
        </section>

        {/* Trust score */}
        <Section>
          <div className="flex items-baseline justify-between">
            <Eyebrow>Trust score</Eyebrow>
            <span className="text-[11px] text-muted-foreground">Top 6%</span>
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <Numeric className="text-[72px] leading-none">98</Numeric>
            <span className="pb-3 text-[13px] text-muted-foreground">/ 100</span>
          </div>
          <div className="mt-4 h-[2px] w-full overflow-hidden rounded-full bg-border-strong">
            <div className="h-full w-[98%] bg-gold" />
          </div>
        </Section>

        {GROUPS.map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {g.title}
            </span>
            <ul className="mt-2 flex flex-col divide-y divide-border border-t border-b border-border">
              {g.rows.map((r) => (
                <li
                  key={r.label}
                  className="flex items-baseline justify-between gap-4 py-4"
                >
                  <span className="text-[14.5px] text-foreground">{r.label}</span>
                  <div className="flex items-baseline gap-3 text-right">
                    {r.value ? (
                      <span className="text-[13.5px] text-foreground/90">
                        {r.value}
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">›</span>
                    )}
                    {r.hint ? (
                      <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {r.hint}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Screen>
    </AppShell>
  );
}
