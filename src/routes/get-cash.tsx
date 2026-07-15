import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  AppShell,
  Screen,
  Display,
  Muted,
  Card,
  CardBody,
  Eyebrow,
  Numeric,
  Button,
} from "@/components/ds";

export const Route = createFileRoute("/get-cash")({
  head: () => ({
    meta: [{ title: "Get Cash — CashNear" }],
  }),
  component: GetCash,
});

function GetCash() {
  return (
    <AppShell>
      <Screen>
        <div>
          <Display>How much
            <br />do you need?</Display>
          <Muted className="mt-2">Enter an amount to see the neighbourhood fee.</Muted>
        </div>

        <Card variant="elevated">
          <CardBody className="flex flex-col gap-6">
            <Eyebrow>Amount</Eyebrow>
            <div className="flex items-end gap-2">
              <Numeric className="text-6xl">0</Numeric>
              <span className="pb-2 text-base text-muted-foreground">NGN</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {["2,000", "5,000", "10,000", "20,000"].map((v) => (
                <button
                  key={v}
                  className="rounded-full border border-border-strong bg-surface-elevated px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface"
                >
                  ₦{v}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        <Button variant="gold" size="lg" fullWidth>
          See fee & find cash
          <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
        </Button>
      </Screen>
    </AppShell>
  );
}
