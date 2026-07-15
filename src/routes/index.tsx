import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, ShieldCheck, MapPin } from "lucide-react";
import {
  AppShell,
  Screen,
  Card,
  CardBody,
  Display,
  Headline,
  Title,
  Muted,
  Eyebrow,
  Numeric,
  Button,
} from "@/components/ds";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CashNear — Neighbourhood financial access" },
      {
        name: "description",
        content:
          "CashNear connects people, merchants, banks and institutions through Africa's largest trusted cash access network.",
      },
      { property: "og:title", content: "CashNear" },
      {
        property: "og:description",
        content: "Africa's neighbourhood financial access infrastructure.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <AppShell
      header={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-surface-elevated">
              <span className="text-sm font-semibold tracking-tight text-gold">CN</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[13px] text-muted-foreground">Good evening</span>
              <span className="text-sm font-semibold">Welcome to CashNear</span>
            </div>
          </div>
          <button
            aria-label="Notifications"
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-elevated text-foreground"
          >
            <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      }
    >
      <Screen>
        <section className="pt-2">
          <Eyebrow>Available anywhere</Eyebrow>
          <Display className="mt-2">
            Cash, when
            <br />
            you need it.
          </Display>
          <Muted className="mt-3 max-w-[28ch]">
            Request cash from verified operators in your neighbourhood. No queues.
            No branches.
          </Muted>
        </section>

        <Card variant="elevated">
          <CardBody className="flex flex-col gap-5">
            <div className="flex items-baseline justify-between">
              <Eyebrow>Ready to withdraw</Eyebrow>
              <span className="text-[11px] text-muted-foreground">Verified</span>
            </div>
            <div className="flex items-end gap-2">
              <Numeric className="text-5xl">••••</Numeric>
              <span className="pb-1 text-sm text-muted-foreground">NGN</span>
            </div>
            <Button variant="gold" size="lg" fullWidth>
              Get Cash
              <ArrowUpRight className="h-5 w-5" strokeWidth={2.25} />
            </Button>
          </CardBody>
        </Card>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Headline>Nearby trust</Headline>
            <span className="text-xs text-muted-foreground">Live</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardBody className="flex flex-col gap-2">
                <MapPin className="h-5 w-5 text-gold" strokeWidth={1.75} />
                <Title>Verified operators</Title>
                <Numeric className="text-2xl">1,248</Numeric>
                <Muted>within 3 km</Muted>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex flex-col gap-2">
                <ShieldCheck className="h-5 w-5 text-success" strokeWidth={1.75} />
                <Title>Avg. response</Title>
                <Numeric className="text-2xl">2m 14s</Numeric>
                <Muted>tonight</Muted>
              </CardBody>
            </Card>
          </div>
        </section>
      </Screen>
    </AppShell>
  );
}
