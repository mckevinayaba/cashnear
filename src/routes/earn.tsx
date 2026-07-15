import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Screen, Display, Muted, Card, CardBody, Title } from "@/components/ds";

export const Route = createFileRoute("/earn")({
  head: () => ({
    meta: [{ title: "Earn — CashNear" }],
  }),
  component: Earn,
});

function Earn() {
  return (
    <AppShell>
      <Screen>
        <div>
          <Display>Earn</Display>
          <Muted className="mt-2">Become part of the trusted network.</Muted>
        </div>
        <Card variant="gold">
          <CardBody className="flex flex-col gap-2">
            <Title>Operate near you</Title>
            <Muted>
              Verified operators earn on every cash transaction they facilitate in
              their neighbourhood.
            </Muted>
          </CardBody>
        </Card>
      </Screen>
    </AppShell>
  );
}
