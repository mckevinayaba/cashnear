import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Screen, Display, Muted, Card, CardBody } from "@/components/ds";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [{ title: "Activity — CashNear" }],
  }),
  component: Activity,
});

function Activity() {
  return (
    <AppShell>
      <Screen>
        <div>
          <Display>Activity</Display>
          <Muted className="mt-2">Your recent cash access.</Muted>
        </div>
        <Card>
          <CardBody>
            <Muted>No activity yet.</Muted>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}
