import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen, Display, Body, Eyebrow, Muted } from "@/components/ds";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy · CashNear" },
      { name: "description", content: "CashNear privacy notice." },
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
        <Muted>Governed by South African POPIA.</Muted>
        <div className="rounded-2xl border border-border-strong bg-surface p-5 text-[14px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">In simple words: </span>
          This page explains what information we collect, why we need it and how we use it. Read the
          full details below.
        </div>
        <Body>
          CashNear collects identification, contact, and business-verification information solely to
          verify participants, prevent fraud, and enable safe cash matching. Verification documents
          are stored privately and accessible only to CashNear operations reviewers.
        </Body>
      </Screen>
    </AppShell>
  ),
});
