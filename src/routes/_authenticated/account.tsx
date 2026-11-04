import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ShareJoinLink } from "@/components/ShareJoinLink";
import { AppShell, Button, Eyebrow, Screen } from "@/components/ds";
import { useAuth } from "@/hooks/use-auth";
import { useShopTheme } from "@/hooks/use-shop-theme";
import { supabase } from "@/integrations/supabase/client";
import { initialsOf } from "@/lib/cash";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account · CashNear" },
      { name: "description", content: "Your CashNear account and settings." },
    ],
  }),
  component: AccountPage,
});

const rowClass =
  "flex min-h-14 items-center justify-between gap-4 px-5 text-[16px] text-foreground transition-colors hover:bg-surface-2/60";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <Eyebrow>{title}</Eyebrow>
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-surface">
        {children}
      </div>
    </section>
  );
}

function AccountPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [theme, toggleTheme] = useShopTheme();
  const [signingOut, setSigningOut] = useState(false);

  const meta = auth.user?.user_metadata as { full_name?: string | null } | undefined;
  const name = meta?.full_name?.trim() ?? "";
  const email = auth.user?.email ?? "";

  const signOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  return (
    <AppShell>
      <Screen className="gap-8">
        <header className="flex items-center gap-4 pt-2">
          <span
            aria-hidden="true"
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-[24px] text-foreground"
          >
            {initialsOf(name || email)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[30px] leading-[1.05]">
              {name || "Your account"}
            </h1>
            {email ? (
              <p className="mt-1 truncate text-[14px] text-muted-foreground">{email}</p>
            ) : null}
          </div>
        </header>

        <Group title="Look">
          <div className="flex min-h-14 items-center justify-between gap-4 px-5 py-3">
            <span className="text-[16px] text-foreground">Screen</span>
            <div
              role="radiogroup"
              aria-label="Screen look"
              className="grid grid-cols-2 rounded-full bg-surface-2 p-1"
            >
              {(
                [
                  ["day", "Daylight"],
                  ["night", "Night"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  onClick={() => theme !== value && toggleTheme()}
                  className={cn(
                    "min-h-10 rounded-full px-4 text-[14px] font-medium transition-colors",
                    theme === value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Group>

        {auth.isAdmin || auth.isOperator ? (
          <Group title="Switch view">
            <Link to="/customer" className={rowClass}>
              Customer
            </Link>
            {auth.isOperator ? (
              <Link to="/operator/dashboard" className={rowClass}>
                My shop
              </Link>
            ) : null}
            {auth.isAdmin ? (
              <Link to="/admin" className={rowClass}>
                Admin
              </Link>
            ) : null}
          </Group>
        ) : null}

        <Group title="Help and rules">
          <a href="mailto:support@cashnear.co" className={rowClass}>
            Email us for help
            <span className="text-[14px] text-muted-foreground">support@cashnear.co</span>
          </a>
          <Link to="/legal/terms" className={rowClass}>
            Terms
          </Link>
          <Link to="/legal/privacy" className={rowClass}>
            Privacy
          </Link>
        </Group>

        <section className="flex flex-col gap-3">
          <Eyebrow>Tell someone</Eyebrow>
          <ShareJoinLink audience="customer" label="Share CashNear" />
        </section>

        <div className="flex flex-col gap-3">
          <Button variant="outline" size="lg" fullWidth disabled={signingOut} onClick={signOut}>
            {signingOut ? "Signing out" : "Sign out"}
          </Button>
          <p className="text-center text-[12px] text-muted-foreground">CashNear · South Africa</p>
        </div>
      </Screen>
    </AppShell>
  );
}
