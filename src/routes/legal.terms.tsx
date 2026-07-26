import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen, Display, Body, Eyebrow, Muted } from "@/components/ds";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms · CashNear" },
      { name: "description", content: "CashNear terms of service." },
    ],
  }),
  component: () => (
    <AppShell hideNav>
      <Screen>
        <Link to="/" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
          ← CashNear
        </Link>
        <Eyebrow>Legal</Eyebrow>
        <Display className="text-[44px]">Terms of service.</Display>
        <Muted>South Africa only.</Muted>
        <div className="rounded-2xl border border-border-strong bg-surface p-5 text-[14px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">In simple words: </span>
          These are the rules for using CashNear. They explain what you can expect from us and what
          we expect from you. Read the full rules below.
        </div>
        <Body>
          CashNear is building a service that will enable approved customers to request cash from
          approved neighbourhood businesses when cash-request services become available.
          Participation is limited to invited users during this early phase. Full terms will be
          published prior to public launch.
        </Body>
      </Screen>
    </AppShell>
  ),
});
