import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen, Display, Body, Eyebrow, Muted } from "@/components/ds";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms · CashNear" },
      { name: "description", content: "CashNear pilot terms of service." },
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
        <Muted>Pilot version. South Africa only.</Muted>
        <Body>
          CashNear operates a controlled pilot enabling verified customers to request cash from
          verified neighbourhood operators. Participation is limited to invited users during the
          pilot phase. Full terms will be published prior to public launch.
        </Body>
      </Screen>
    </AppShell>
  ),
});
