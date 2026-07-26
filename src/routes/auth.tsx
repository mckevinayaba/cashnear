import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen, Display, Muted, Eyebrow, Body, Button } from "@/components/ds";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · CashNear" },
      {
        name: "description",
        content: "Sign in or create your CashNear account.",
      },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8).max(72);

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const ep = emailSchema.safeParse(email);
    const pp = passwordSchema.safeParse(password);
    if (!ep.success) return setError("Enter a valid email address.");
    if (!pp.success) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: ep.data,
          password: pp.data,
          options: {
            emailRedirectTo: window.location.origin + "/home",
            data: { full_name: name.trim() || null },
          },
        });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode("signin");
          setError("An account with this email already exists. Please sign in.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: ep.data,
          password: pp.data,
        });
        if (error) throw error;
      }
      navigate({ to: "/home", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "We could not do that. Please try again.";
      if (/invalid login credentials/i.test(msg) && mode === "signin") {
        setError("Your email or password is not correct. Try again, or reset your password.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell hideNav>
      <Screen>
        <div className="pt-4">
          <Link to="/" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            ← CashNear
          </Link>
        </div>

        <div>
          <Eyebrow>{mode === "signin" ? "Welcome back" : "Create account"}</Eyebrow>
          <Display className="mt-4 text-[44px]">
            {mode === "signin" ? "Sign in." : "Create your CashNear account"}
          </Display>
          <Muted className="mt-3 max-w-[34ch]">
            {mode === "signin" ? "Check your account." : "Create an account to get started."}
          </Muted>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "signup" ? (
            <Field
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="As on your ID"
              autoComplete="name"
            />
          ) : null}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@domain.co.za"
            autoComplete="email"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />

          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>

          <div className="flex items-center justify-between pt-2 text-[12px] text-muted-foreground">
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="underline decoration-border-strong underline-offset-4 hover:text-foreground"
            >
              {mode === "signin" ? "Create an account" : "I already have an account"}
            </button>
            {mode === "signin" ? (
              <Link
                to="/reset-password"
                className="underline decoration-border-strong underline-offset-4 hover:text-foreground"
              >
                Forgot password?
              </Link>
            ) : null}
          </div>
        </form>

        <Body className="mt-auto pt-8 text-[12px] text-muted-foreground">
          By continuing, you agree to our{" "}
          <Link to="/legal/terms" className="underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/legal/privacy" className="underline underline-offset-4">
            Privacy Notice
          </Link>
          . These explain our rules and how we use your information.
        </Body>
      </Screen>
    </AppShell>
  );
}

function Field({
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
        className="h-12 rounded-2xl border border-border-strong bg-surface px-4 text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:border-gold focus:outline-none"
      />
    </label>
  );
}
