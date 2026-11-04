import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityRow } from "@/components/ActivityRow";
import { AppShell, Body, Button, Card, CardBody, Display, Eyebrow, Screen } from "@/components/ds";
import { cashMyHistory } from "@/lib/cash-api";
import type { CashHistoryItem } from "@/lib/cash";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "Activity · CashNear" }] }),
  component: ActivityPage,
});

function ActivityPage() {
  const [items, setItems] = useState<CashHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await cashMyHistory(50));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <Screen className="gap-8">
        <header className="pt-2">
          <Eyebrow>Activity</Eyebrow>
          <Display className="mt-2 text-[40px] leading-[1.05]">Your cash.</Display>
        </header>

        {error ? (
          <Card variant="outline">
            <CardBody className="flex flex-col gap-3">
              <p role="alert" className="text-[14px] text-destructive">
                {error}
              </p>
              <Button variant="secondary" onClick={() => void load()}>
                Try again
              </Button>
            </CardBody>
          </Card>
        ) : items === null ? (
          <ul aria-label="Loading" className="flex flex-col gap-3">
            {[0, 1, 2].map((n) => (
              <li key={n} className="h-[76px] animate-pulse rounded-2xl bg-surface-2/60" />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <Card variant="quiet">
            <CardBody className="flex flex-col gap-4">
              <Display className="text-[26px] leading-[1.1]">Nothing here yet.</Display>
              <Body className="text-[14px] text-muted-foreground">
                When you get cash, it shows up here, so you can always look back.
              </Body>
              <Link to="/cash">
                <Button size="lg" fullWidth>
                  Get cash
                </Button>
              </Link>
            </CardBody>
          </Card>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Screen>
    </AppShell>
  );
}
