import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppShell, Screen, Muted, Eyebrow } from "@/components/ds";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRouter,
});

function HomeRouter() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.loading) return;
    if (auth.isAdmin) {
      navigate({ to: "/admin", replace: true });
    } else if (auth.isOperator) {
      navigate({ to: "/operator/dashboard", replace: true });
    } else if (auth.hasRole("customer") && auth.roles.length === 1) {
      // Customer with no operator/admin role → onboarding chooser
      navigate({ to: "/onboarding", replace: true });
    } else {
      navigate({ to: "/customer", replace: true });
    }
  }, [auth, navigate]);

  return (
    <AppShell hideNav>
      <Screen>
        <Eyebrow>Loading</Eyebrow>
        <Muted>Routing you to the right place…</Muted>
      </Screen>
    </AppShell>
  );
}
