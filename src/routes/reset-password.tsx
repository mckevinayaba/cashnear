import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen, Display, Muted, Eyebrow, Button } from "@/components/ds";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · CashNear" },
      { name: "description", content: "Reset your CashNear account password." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setMode("update");
    }
  }, []);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("If that email has an account, we sent a link to it.");
  };

  const update = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(error.message);
    else setMsg("Password updated. You can now sign in.");
  };

  return (
    <AppShell hideNav>
      <Screen>
        <div className="pt-4">
          <Link to="/auth" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            ← Sign in
          </Link>
        </div>
        <div>
          <Eyebrow>Password</Eyebrow>
          <Display className="mt-4 text-[44px]">
            {mode === "request" ? "Reset it." : "Choose new."}
          </Display>
          <Muted className="mt-3 max-w-[34ch]">
            {mode === "request"
              ? "We'll email you a secure link."
              : "Choose a new password for your account."}
          </Muted>
        </div>

        {mode === "request" ? (
          <form onSubmit={request} className="flex flex-col gap-4">
            <Input label="Email" type="email" value={email} onChange={setEmail} />
            {err ? <p className="text-[13px] text-destructive">{err}</p> : null}
            {msg ? <p className="text-[13px] text-success">{msg}</p> : null}
            <Button size="lg" fullWidth disabled={busy}>
              {busy ? "…" : "Send reset link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={update} className="flex flex-col gap-4">
            <Input label="New password" type="password" value={password} onChange={setPassword} />
            {err ? <p className="text-[13px] text-destructive">{err}</p> : null}
            {msg ? <p className="text-[13px] text-success">{msg}</p> : null}
            <Button size="lg" fullWidth disabled={busy}>
              {busy ? "…" : "Update password"}
            </Button>
          </form>
        )}
      </Screen>
    </AppShell>
  );
}

function Input({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-2xl border border-border-strong bg-surface px-4 text-[15px] focus:border-gold focus:outline-none"
      />
    </label>
  );
}
