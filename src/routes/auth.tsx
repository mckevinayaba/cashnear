import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, Screen, Display, Muted, Eyebrow, Body, Button } from "@/components/ds";
import { describeAuthError, isUnconfirmedEmail } from "@/lib/auth-errors";
import type { JoinIntent } from "@/lib/auth-routing";

type AuthSearch = { mode?: "signup"; as?: "shop" };

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const out: AuthSearch = {};
    if (search.mode === "signup") out.mode = "signup";
    if (search.as === "shop") out.as = "shop";
    return out;
  },
  head: () => ({
    meta: [
      { title: "Join or sign in · CashNear" },
      {
        name: "description",
        content: "Join CashNear free, or sign in to your account.",
      },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(8).max(72);

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(
    search.mode === "signup" || search.as === "shop" ? "signup" : "signin",
  );
  const [intent, setIntent] = useState<JoinIntent>(search.as === "shop" ? "shop" : "customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      // A saved login can be out of date (expired, or ended on another phone).
      // Check it with the server first. If it is dead, clear it, so the person
      // stays here and sees the form instead of being sent in a circle.
      const { data: current, error } = await supabase.auth.getUser();
      if (cancelled) return;
      if (error || !current.user) {
        // Only clear the login when the server says it is no longer good. If
        // the phone is simply offline, keep it so the person is not signed out
        // by a weak signal.
        const offline =
          !!error &&
          (error.name === "AuthRetryableFetchError" ||
            /failed to fetch|network|load failed/i.test(error.message));
        if (!offline) await supabase.auth.signOut({ scope: "local" });
        return;
      }
      navigate({ to: "/home", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const confirmRedirect = () => `${window.location.origin}/home`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsConfirm(false);
    const ep = emailSchema.safeParse(email);
    const pp = passwordSchema.safeParse(password);
    if (!ep.success) return setError("Enter a valid email address.");
    if (!pp.success) return setError("Your password must be at least 8 characters.");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: ep.data,
          password: pp.data,
          options: {
            emailRedirectTo: confirmRedirect(),
            data: { full_name: name.trim() || null, joined_as: intent },
          },
        });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode("signin");
          setError("An account with this email already exists. Sign in instead.");
          return;
        }
        // When email confirmation is on, there is no session yet. Tell the
        // person plainly what to do next instead of sending them to a screen
        // that would only bounce them back here.
        if (!data.session) {
          setCheckEmail(true);
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
      setNeedsConfirm(mode === "signin" && isUnconfirmedEmail(err));
      setError(describeAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    const ep = emailSchema.safeParse(email);
    if (!ep.success) return setError("Enter a valid email address.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: ep.data,
      options: { emailRedirectTo: confirmRedirect() },
    });
    setBusy(false);
    if (error) setError(describeAuthError(error));
    else setResent(true);
  };

  if (checkEmail) {
    return (
      <AppShell hideNav>
        <Screen>
          <div className="pt-4">
            <Link to="/" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
              ← CashNear
            </Link>
          </div>
          <div>
            <Eyebrow>One last step</Eyebrow>
            <Display className="mt-4 text-[44px]">Check your email.</Display>
            <Body className="mt-3 max-w-[38ch] text-muted-foreground">
              We sent a link to <span className="text-foreground">{email.trim()}</span>. Tap it to
              finish joining. If you do not see it, look in your spam folder.
            </Body>
          </div>
          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {resent ? (
            <p className="text-[13px] text-success" role="status">
              We sent it again.
            </p>
          ) : null}
          <div className="flex flex-col gap-3">
            <Button variant="secondary" size="lg" fullWidth disabled={busy} onClick={resend}>
              {busy ? "Please wait" : "Send the link again"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setCheckEmail(false);
                setResent(false);
                setError(null);
              }}
              className="text-[13px] text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground"
            >
              Use a different email
            </button>
          </div>
        </Screen>
      </AppShell>
    );
  }

  const joiningAsShop = mode === "signup" && intent === "shop";

  return (
    <AppShell hideNav>
      <Screen>
        <div className="pt-4">
          <Link to="/" className="text-[12px] uppercase tracking-[0.2em] text-muted-foreground">
            ← CashNear
          </Link>
        </div>

        <div>
          <Eyebrow>
            {mode === "signin" ? "Welcome back" : joiningAsShop ? "For shops" : "Early access"}
          </Eyebrow>
          <Display className="mt-4 text-[44px]">
            {mode === "signin"
              ? "Sign in."
              : joiningAsShop
                ? "Register your shop."
                : "Join CashNear."}
          </Display>
          <Muted className="mt-3 max-w-[36ch]">
            {mode === "signin"
              ? "Pick up where you left off."
              : joiningAsShop
                ? "It is free. We check your papers and visit your shop before you start."
                : "It is free and takes about a minute."}
          </Muted>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {mode === "signup" ? (
            <div role="radiogroup" aria-label="I am joining as" className="grid grid-cols-2 gap-2">
              {(
                [
                  ["customer", "I need cash"],
                  ["shop", "I own a shop"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={intent === value}
                  onClick={() => setIntent(value)}
                  className={`min-h-12 rounded-2xl border px-3 text-[14px] transition-colors ${
                    intent === value
                      ? "border-gold text-gold"
                      : "border-border-strong text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {mode === "signup" ? (
            <Field
              label="Your name"
              value={name}
              onChange={setName}
              placeholder="First and last name"
              autoComplete="name"
            />
          ) : null}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <Field
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
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

          {error ? (
            <p className="text-[13px] text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {needsConfirm ? (
            <div className="flex flex-col gap-2">
              <Button type="button" variant="secondary" disabled={busy} onClick={resend}>
                Send the link again
              </Button>
              {resent ? (
                <p className="text-[13px] text-success" role="status">
                  We sent it again.
                </p>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {busy
              ? "Please wait"
              : mode === "signin"
                ? "Sign in"
                : joiningAsShop
                  ? "Register my shop"
                  : "Join free"}
          </Button>

          <div className="flex items-center justify-between pt-2 text-[13px] text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNeedsConfirm(false);
              }}
              className="underline decoration-border-strong underline-offset-4 hover:text-foreground"
            >
              {mode === "signin" ? "Join free" : "I already have an account"}
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
