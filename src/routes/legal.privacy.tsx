import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen, Display, Body, Eyebrow, Muted } from "@/components/ds";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · CashNear" },
      { name: "description", content: "CashNear pilot privacy notice." },
    ],
  }),
  component: () => (
    <AppShell hideNav>
      <Screen>
        <Link to="/" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
          ← CashNear
        </Link>
        <Eyebrow>Legal</Eyebrow>
        <Display className="text-[44px]">Privacy notice.</Display>
        <Muted>Pilot version. Governed by South African POPIA.</Muted>
        <Body>
          CashNear collects identification, contact, and business-verification information solely
          to verify pilot participants, prevent fraud, and enable safe cash matching. Verification
          documents are stored privately and accessible only to CashNear operations reviewers.
        </Body>
      </Screen>
    </AppShell>
  ),
});
