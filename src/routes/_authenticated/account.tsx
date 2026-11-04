import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen } from "@/components/ds";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Your account — CashNear" }, { name: "description", content: "Your CashNear account and settings." }] }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);
  return (
    <AppShell>
      <Screen>
        <h1 className="font-display text-[40px] leading-tight text-foreground">Your account</h1>
        <div className="rounded-3xl border border-border bg-card p-6">
          <p className="text-[14px] text-muted-foreground">Signed in as</p>
          <p className="mt-1 break-all text-[18px] text-foreground">{email}</p>
        </div>
        <button
          onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}
          className="min-h-14 rounded-full border border-border text-[16px] font-medium text-foreground"
        >
          Sign out
        </button>
      </Screen>
    </AppShell>
  );
}
