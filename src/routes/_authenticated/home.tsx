import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { landingFor, readJoinIntent } from "@/lib/auth-routing";
import { AppShell, Screen, Muted, Eyebrow } from "@/components/ds";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomeRouter,
});

function HomeRouter() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.loading) return;
    navigate({
      to: landingFor({
        isAdmin: auth.isAdmin,
        isOperator: auth.isOperator,
        roles: auth.roles,
        intent: readJoinIntent(auth.user?.user_metadata),
      }),
      replace: true,
    });
  }, [auth, navigate]);

  return (
    <AppShell hideNav>
      <Screen>
        <Eyebrow>One moment</Eyebrow>
        <Muted>Taking you to your account…</Muted>
      </Screen>
    </AppShell>
  );
}
