import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  AppShell,
  Screen,
  Section,
  Headline,
  Muted,
  Eyebrow,
  Numeric,
  Button,
} from "@/components/ds";
import { DEFAULT_LOCALE, formatAmount } from "@/lib/currency";

export const Route = createFileRoute("/get-cash")({
  head: () => ({
    meta: [{ title: "Find cash — CashNear" }],
  }),
  component: GetCash,
});

const STEPS = ["Amount", "Fee", "Match", "Code", "Collect"] as const;
const PRESETS = [200, 500, 1000, 2000];

function GetCash() {
  const loc = DEFAULT_LOCALE;
  const [amount, setAmount] = useState(0);
  const fee = useMemo(() => Math.round(amount * 0.018), [amount]);

  return (
    <AppShell
      header={
        <div className="flex items-center justify-between">
          <Eyebrow>Get cash · Step 1 of 5</Eyebrow>
          <span className="text-[11px] text-muted-foreground">{loc.country}</span>
        </div>
      }
    >
      <Screen className="!gap-12">
        {/* Progress rail */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={
                "h-[2px] flex-1 rounded-full " +
                (i === 0 ? "bg-foreground" : "bg-border-strong")
              }
            />
          ))}
        </div>

        {/* Amount input */}
        <section>
          <Headline className="max-w-[16ch]">How much do you need?</Headline>
          <Muted className="mt-3">Enter any amount in Rand.</Muted>

          <div className="mt-10 flex items-baseline gap-3">
            <span className="font-display text-4xl text-muted-foreground">R</span>
            <Numeric className="text-[92px] leading-none">
              {amount === 0 ? "0" : new Intl.NumberFormat(loc.locale).format(amount)}
            </Numeric>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setAmount(amount + v)}
                className="rounded-full border border-border-strong bg-transparent px-4 py-2 text-[13px] text-foreground transition-colors hover:border-foreground/40"
              >
                +{formatAmount(v, loc, { withSymbol: true })}
              </button>
            ))}
            <button
              onClick={() => setAmount(0)}
              className="rounded-full px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>
        </section>

        {/* Fee line — editorial */}
        <Section>
          <div className="flex items-baseline justify-between border-t border-border pt-6">
            <span className="text-[13px] text-muted-foreground">Network fee</span>
            <Numeric className="text-[18px]">
              {amount === 0 ? "—" : formatAmount(fee, loc)}
            </Numeric>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-muted-foreground">You collect</span>
            <Numeric className="text-[18px]">
              {amount === 0 ? "—" : formatAmount(amount, loc)}
            </Numeric>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-[13px] text-foreground">Total charged</span>
            <Numeric className="text-[22px]">
              {amount === 0 ? "—" : formatAmount(amount + fee, loc)}
            </Numeric>
          </div>
        </Section>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={amount === 0}
          className="mt-4"
        >
          Find cash nearby
        </Button>
      </Screen>
    </AppShell>
  );
}
