import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen, Display, Muted, Eyebrow, Button } from "@/components/ds";
import { describeAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · CashNear" },
      { name: "description", content: "Reset your CashNear account password." },
    ],
  }),
  component: ResetPasswordPage,
});

const EXPIRED = "This link has expired or was already used. Ask for a new one below.";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("error_code=") || hash.includes("error=access_denied")) {
      setErr(EXPIRED);
    } else if (hash.includes("type=recovery")) {
      setMode("update");
    }
    // The reset link signs the person in for this one job. Listening for it
    // works whichever way the link arrives.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setErr(null);
        setMode("update");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return setErr("Enter the email you joined with.");
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Only a limit on tries is worth telling the person. Anything else gets
    // the same answer, so nobody can use this page to find out who has an account.
    if (error && /rate limit|too many|security purposes/i.test(error.message)) {
      setErr(describeAuthError(error));
    } else {
      setMsg("If that email has an account, we sent a link to it. Check your spam folder too.");
    }
  };

  const update = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr("Your password must be at least 8 characters.");
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      const text = describeAuthError(error);
      setErr(text);
      if (text.startsWith("This link has expired")) setMode("request");
      return;
    }
    setDone(true);
    setMsg("Your password is changed.");
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
            {mode === "request" ? "Reset it." : "Choose a new one."}
          </Display>
          <Muted className="mt-3 max-w-[34ch]">
            {mode === "request"
              ? "Enter your email. We will send you a link."
              : "Choose a new password for your account."}
          </Muted>
        </div>

        {mode === "request" ? (
          <form onSubmit={request} className="flex flex-col gap-4" noValidate>
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
            />
            {err ? (
              <p className="text-[13px] text-destructive" role="alert">
                {err}
              </p>
            ) : null}
            {msg ? (
              <p className="text-[13px] text-success" role="status">
                {msg}
              </p>
            ) : null}
            <Button size="lg" fullWidth disabled={busy}>
              {busy ? "Please wait" : "Send me the link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={update} className="flex flex-col gap-4" noValidate>
            <Input
              label="New password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              action={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  className="text-[12px] text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              }
            />
            {err ? (
              <p className="text-[13px] text-destructive" role="alert">
                {err}
              </p>
            ) : null}
            {msg ? (
              <p className="text-[13px] text-success" role="status">
                {msg}
              </p>
            ) : null}
            {done ? (
              <Button
                type="button"
                size="lg"
                fullWidth
                onClick={() => navigate({ to: "/home", replace: true })}
              >
                Continue
              </Button>
            ) : (
              <Button size="lg" fullWidth disabled={busy}>
                {busy ? "Please wait" : "Save my new password"}
              </Button>
            )}
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
  action,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  action?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        {action}
      </span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 rounded-2xl border border-border-strong bg-surface px-4 text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none"
      />
    </label>
  );
}
