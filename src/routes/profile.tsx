import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Screen, Display, Muted, Card, CardBody, Title } from "@/components/ds";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [{ title: "Profile — CashNear" }],
  }),
  component: Profile,
});

function Profile() {
  return (
    <AppShell>
      <Screen>
        <div>
          <Display>Profile</Display>
          <Muted className="mt-2">Your identity & trust score.</Muted>
        </div>
        <Card>
          <CardBody className="flex flex-col gap-2">
            <Title>Verified account</Title>
            <Muted>Security influences every interaction.</Muted>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}
