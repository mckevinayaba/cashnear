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
