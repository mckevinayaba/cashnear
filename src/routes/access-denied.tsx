import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Screen, Eyebrow, Display, Muted, Button } from "@/components/ds";

export const Route = createFileRoute("/access-denied")({
  head: () => ({
    meta: [{ title: "Access denied · CashNear" }, { name: "robots", content: "noindex" }],
  }),
  component: AccessDenied,
});

function AccessDenied() {
  return (
    <AppShell hideNav>
      <Screen>
        <Eyebrow>Restricted</Eyebrow>
        <Display className="text-[40px]">You don't have access to this page.</Display>
        <Muted className="max-w-[38ch]">
          This area is limited to CashNear operations staff. If you believe you should have access,
          contact your administrator.
        </Muted>
        <Link to="/home">
          <Button size="lg">Back to your account</Button>
        </Link>
      </Screen>
    </AppShell>
  );
}
