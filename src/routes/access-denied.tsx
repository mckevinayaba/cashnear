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
        <Display className="text-[40px]">You can't open this page.</Display>
        <Muted className="max-w-[38ch]">
          This page is for CashNear staff only. If you think this is wrong, contact us.
        </Muted>
        <Link to="/home">
          <Button size="lg">Back to your account</Button>
        </Link>
      </Screen>
    </AppShell>
  );
}
