import { createFileRoute } from "@tanstack/react-router";
import {
  AppShell,
  Screen,
  Display,
  Muted,
  Eyebrow,
  Numeric,
} from "@/components/ds";
import { DEFAULT_LOCALE, formatAmount } from "@/lib/currency";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [{ title: "Activity — CashNear" }],
  }),
  component: Activity,
});

interface Entry {
  id: string;
  type: "collected" | "cancelled" | "security" | "requested";
  title: string;
  meta: string;
  amount?: number;
  time: string;
}

const GROUPS: { label: string; entries: Entry[] }[] = [
  {
    label: "Today",
    entries: [
      {
        id: "1",
        type: "collected",
        title: "Collected from Thandi K.",
        meta: "Rosebank · Trust 4.98",
        amount: 500,
        time: "18:42",
      },
      {
        id: "2",
        type: "security",
        title: "New device verified",
        meta: "iPhone · Cape Town",
        time: "12:07",
      },
    ],
  },
  {
    label: "This week",
    entries: [
      {
        id: "3",
        type: "collected",
        title: "Collected from Sipho M.",
        meta: "Sandton · Trust 4.91",
        amount: 1200,
        time: "Tue",
      },
      {
        id: "4",
        type: "cancelled",
        title: "Request cancelled",
        meta: "No verified match nearby",
        time: "Mon",
      },
    ],
  },
];

function Activity() {
  const loc = DEFAULT_LOCALE;

  return (
    <AppShell
      header={
        <div className="flex items-baseline justify-between">
          <Eyebrow>Activity</Eyebrow>
          <span className="text-[11px] text-muted-foreground">Last 30 days</span>
        </div>
      }
    >
      <Screen className="!gap-12">
        <section className="pt-2">
          <Display>Timeline.</Display>
          <Muted className="mt-3">Every collection, every verification.</Muted>
        </section>

        {GROUPS.map((group) => (
          <section key={group.label} className="flex flex-col gap-6">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {group.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {group.entries.length}
              </span>
            </div>
            <ol className="relative flex flex-col gap-8 border-l border-border pl-6">
              {group.entries.map((e) => (
                <li key={e.id} className="relative">
                  <span
                    className={
                      "absolute -left-[27px] top-1.5 h-2 w-2 rounded-full " +
                      badgeColor(e.type)
                    }
                  />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[14.5px] text-foreground">{e.title}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {e.meta}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {e.amount !== undefined ? (
                        <Numeric className="text-[15px]">
                          {formatAmount(e.amount, loc)}
                        </Numeric>
                      ) : null}
                      <span className="text-[11px] text-muted-foreground">
                        {e.time}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </Screen>
    </AppShell>
  );
}

function badgeColor(t: Entry["type"]) {
  switch (t) {
    case "collected":
      return "bg-success";
    case "cancelled":
      return "bg-destructive";
    case "security":
      return "bg-gold";
    default:
      return "bg-foreground/60";
  }
}
