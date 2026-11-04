# Environment Configuration

This project reads configuration from a local `.env` file, which is git-ignored
and must never be committed. Use [`.env.example`](../.env.example) as the
template:

```sh
cp .env.example .env
```

Then fill in the real values from your Supabase project settings
(Project Settings → API).

## Variables

| Variable | Scope | Sensitivity | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Client (bundled into browser build) | Public | Supabase project API URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client (bundled into browser build) | Public | Supabase anon/publishable key. Safe to expose — access is enforced by Row Level Security (RLS), not by keeping this secret. |
| `VITE_SUPABASE_PROJECT_ID` | Client (bundled into browser build) | Public | Project ref, derivable from the URL above. |
| `SUPABASE_URL` | Server (`process.env`) | Public | Same value as `VITE_SUPABASE_URL`, used by server routes/middleware. |
| `SUPABASE_PUBLISHABLE_KEY` | Server (`process.env`) | Public | Same value as `VITE_SUPABASE_PUBLISHABLE_KEY`, used server-side. |
| `SUPABASE_PROJECT_ID` | Server (`process.env`) | Public | Same value as `VITE_SUPABASE_PROJECT_ID`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** (`process.env`) | **Secret** | Bypasses Row Level Security entirely. **Never** prefix with `VITE_`, never import into client-bundled code, never commit. Only load inside `*.server.ts` modules or trusted server handlers — see [`src/integrations/supabase/client.server.ts`](../src/integrations/supabase/client.server.ts). |

## Rules of thumb

- Anything prefixed `VITE_` ends up in the public JS bundle shipped to every
  browser — treat it as public by definition.
- `SUPABASE_SERVICE_ROLE_KEY` is the only credential in this project that
  grants admin-level database access. If it is ever exposed (committed,
  logged, sent to the client), rotate it immediately in the Supabase
  dashboard.

## No fallback to a shared/production project

[`vite.config.ts`](../vite.config.ts) never hardcodes a Supabase URL or key. An
earlier version of this file hardcoded a literal production URL and anon key as a
fallback, which meant a preview or staging build with a missing variable would
silently connect to the production database. That failure mode is gone: every
environment (local dev, preview, staging, production) must supply its own
values, pointing at that environment's own Supabase project.

How a missing variable is reported:

- **At config load**, `vite.config.ts` prints a warning naming the missing
  variables (never their values). It does **not** throw, because Lovable's
  managed build wraps this config and injects the variables after it loads;
  throwing here broke managed builds. This rule is recorded in `AGENTS.md`.
- **At runtime**, the Supabase client (`src/integrations/supabase/client.ts`)
  throws "Missing Supabase environment variable(s)" the first time it is used
  without values, so a misconfigured build fails visibly instead of connecting
  anywhere.

**Running locally:** `vite.config.ts` reads `.env`/`.env.local` through Vite's
own `loadEnv()` (real, already-exported variables take priority), so
`bun run dev` and `bun run build` work once `.env` or `.env.local` has real
values. With neither present you get the warning at startup and the runtime error
on first use.

## Uptime monitoring

The app exposes a public, unauthenticated health endpoint at `/health`
(see [`src/routes/health.ts`](../src/routes/health.ts)). It reports only
`{ status, version, timestamp, supabase }` -- never a DB URL, project
ref, key, table name, row count, or stack trace -- and returns HTTP 503
(not a silent 200) when Supabase is unreachable or misconfigured.

An external uptime service (e.g. UptimeRobot, Better Uptime, Pingdom)
should be pointed at, at minimum:

- `GET /` -- the homepage renders at all (catches a fully broken build/deploy).
- `GET /health` -- expect HTTP 200 and `"status":"ok"` in the body; treat
  HTTP 503 or a non-`ok` status as an incident.
- `GET /auth` (the sign-in route) -- confirms the auth-dependent part of
  the app renders, not just the static shell.

No third-party monitoring account has been set up as part of this pass
-- that requires the founder's own account/billing decision.
