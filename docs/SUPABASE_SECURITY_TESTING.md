# Supabase Security Testing

How to actually execute the Stage 1 SQL security regression suite
(`supabase/tests/`), which proves the RLS/trigger/storage/audit fixes from
`docs/STAGE1_SECURITY_REMEDIATION_PLAN.md` and
`docs/STAGE1_SECURITY_REMEDIATION_REPORT.md`. Those two documents state
plainly that the SQL scripts were **written but not executed** — no
Supabase CLI, Docker, or `psql` is available in the environment they were
authored in. This document is how someone with that tooling closes the gap.

**Nothing in this document has been executed either.** It was written by
reading the Supabase CLI's documented behavior and the test scripts
themselves, not by running them. Treat every command below as unverified
until you actually run it.

---

## 1. Prerequisites

- **Supabase CLI** (`supabase`) — manages the local Postgres/GoTrue/Storage
  stack and applies migrations. Install per Supabase's docs for your OS
  (`brew install supabase/tap/supabase`, `scoop install supabase`, or the
  standalone binary). Verify: `supabase --version`.
- **Docker** (or a Docker-compatible runtime) — the Supabase CLI runs
  Postgres, GoTrue, Storage, etc. as containers. Verify: `docker --version`
  and that the daemon is actually running (`docker info`).
- **`psql`** — the PostgreSQL client, used to run the test scripts
  themselves. Comes with a full PostgreSQL install, `postgresql-client`
  (Debian/Ubuntu), or Postgres.app (macOS). Verify: `psql --version`.
- **`bash`** — to run `supabase/tests/run.sh` / `bun run test:db`. Git Bash
  on Windows works; native PowerShell/cmd does not run the script directly
  (invoke it via Git Bash, WSL, or adapt the two commands inside it by hand).
- This repository, on a branch that includes all 11 committed migrations
  (`supabase/migrations/20260718061518_...` through
  `20260718080000_operator_reinstatement_governance.sql`).

None of these were available in the environment this remediation was
authored in, which is exactly why the SQL suite is unexecuted — this
document assumes you have them.

---

## 2. Use a local or dedicated staging project — never production first

Three tiers, in the order you should actually use them:

1. **Local (`supabase start`) — always start here.** Fast, free, fully
   disposable, and `supabase/tests/run.sh` only ever targets this tier by
   construction (see §9). This is where you'll iterate if a script needs a
   fix.
2. **A dedicated staging Supabase project** (a separate cloud project from
   the live Lovable Cloud one, created via the Supabase dashboard or
   `supabase projects create`) — recommended before touching the live
   project at all, especially the first time. Link it with `supabase link
   --project-ref <staging-ref>` and push migrations with `supabase db push`.
   Running the test suite here is still a **manual** step (§11) — the
   provided script will not do this for you.
3. **The live Lovable Cloud project** — read-only inspection only in the
   normal course of things (§8); a full mutating test run against it is
   optional, high-caution, and covered separately in §11. Never automated.

Do not skip straight to tier 3. The whole point of tiers 1–2 is to catch a
broken script or an unapplied migration somewhere that isn't the one
project CashNear actually depends on.

---

## 3. Supabase CLI setup

```sh
supabase --version        # confirm install
cd /path/to/CashNear       # repo root -- supabase/config.toml lives here
supabase start             # first run pulls Docker images, can take a few minutes
supabase status             # confirms API/DB/Studio URLs once it's up
```

`supabase/config.toml` in this repo is minimal (`project_id` only), so
`supabase start` uses the CLI's defaults for everything else (ports,
Studio, Storage, etc.) — no additional local config is required.

`supabase stop` shuts the local stack down; `supabase stop --no-backup`
also discards the local database volume entirely (use this if you want a
truly clean slate rather than `db reset`, e.g., if you suspect the local
Postgres data directory itself is in a bad state).

---

## 4. Applying migrations from an empty database

```sh
supabase db reset
```

This drops and recreates the **local** database and replays every file in
`supabase/migrations/` in filename (timestamp) order — all 11 of them:

| # | File | What it does |
|---|---|---|
| 1 | `20260718061518_...` | Original Stage 1 schema: enums, tables, RLS, `has_role`/`is_admin`/`is_business_member`, seed pilot config |
| 2 | `20260718061532_...` | Revokes EXECUTE on the helper functions (the bug H-01 fixes) |
| 3 | `20260718061546_...` | `operator-documents` bucket storage policies |
| 4 | `20260718064316_...` | Customer KYC columns + `customer-documents` bucket storage policies |
| 5 | `20260718070000_...` | **C-01** — column-level lockdown on `customer_profiles` |
| 6 | `20260718070100_...` | **C-02** — column-level lockdown on `operator_businesses` |
| 7 | `20260718070200_...` | **C-04** — staff-active sync trigger, backfill, document-policy status gate |
| 8 | `20260718070300_...` | **H-01** — re-grants EXECUTE on the 3 helper functions |
| 9 | `20260718070400_...` | **H-02** — revokes direct `audit_logs` INSERT, adds `log_audit_event()` |
| 10 | `20260718070500_...` | **H-03** — provisions both storage buckets |
| 11 | `20260718080000_...` | Founder governance — `deactivated_by_suspension_at`, refined reinstatement trigger |

There is no separate seed step beyond what migration 1 inserts
(`pilot_configuration` rows) — the test scripts create their own fixture
data per-script and roll it back (§6).

**Do not run `supabase db reset --linked`** — that flag targets whatever
project you last ran `supabase link` against, which could be staging *or*
production depending on what you linked most recently. This document never
recommends that flag; if you ever type it, confirm with `supabase status`
which project you're actually linked to first.

---

## 5. Running the test suite

**Preferred — single command:**

```sh
bun run test:db
```

Runs `supabase/tests/run.sh`, which does exactly this, and nothing more:
1. Checks `supabase` and `psql` are on `PATH`.
2. Runs `supabase db reset` (§4).
3. Derives the local `DB_URL` from `supabase status -o env` — refuses to
   proceed if it can't, or if the URL doesn't contain `127.0.0.1`/
   `localhost` (see §9 for why).
4. Runs `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql`.

**By hand, one script at a time** (useful while debugging a single test):

```sh
DB_URL="$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
cd supabase/tests
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 001_customer_kyc_lockdown.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 002_operator_application_lockdown.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 003_operator_suspension.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 004_rls_helper_execute.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 005_audit_log_integrity.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 006_storage_provisioning.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f 007_operator_reinstatement_governance.sql
```

### Execution order

`001` → `007`, matching the finding IDs they prove (C-01, C-02, C-04, H-01,
H-02, H-03, then the governance decisions). Each script is fully
self-contained — its own `BEGIN`/fixtures/`ROLLBACK` — so there is no hard
dependency between them and running them individually or out of order
during debugging is safe. Numeric order is the recommended default because
it matches the finding IDs in the remediation report, making it easy to
cross-reference a failure with the corresponding write-up.

`_helpers.sql` is never run directly — each numbered script pulls it in via
`\ir _helpers.sql` (path-relative include, works regardless of your current
directory when you invoke `run_all.sql`).

---

## 6. Expected successful results

Every check inside every script ends with either:

```
NOTICE:  PASS - <description of what was just proven>
```

or, on failure:

```
ERROR:  FAIL - <description of what went wrong>
```

A fully successful run of `bun run test:db` prints a long sequence of
`NOTICE: PASS - ...` lines (roughly 40 across all 7 scripts) and ends with:

```
==> Done. Every line above should read NOTICE: PASS - ...; psql would have exited non-zero on the first FAIL/ERROR (ON_ERROR_STOP=1).
```

with exit code `0`. **Skim for the word `FAIL` or `ERROR` — don't assume
success just because the script finished output; check the exit code**
(`echo $?` immediately after, or rely on `set -e` in a wrapping script,
which `run.sh` already has).

---

## 7. What constitutes a failure

Any of the following means the suite failed and the corresponding fix is
not confirmed working:

- Any `ERROR: FAIL - ...` line — the script's own assertion caught a
  regression (e.g., a customer *was* able to self-approve).
- Any other `ERROR:` from Postgres itself (e.g., `function
  public.log_audit_event(...) does not exist`, `column
  "deactivated_by_suspension_at" does not exist`) — this means a migration
  wasn't applied, was applied out of order, or was reverted. Re-run `supabase
  db reset` and confirm all 11 migrations are present (§4) before assuming
  the fix itself is broken.
- A non-zero exit code from `psql` or from `run.sh` — with `-v
  ON_ERROR_STOP=1`, psql stops and exits non-zero on the **first** error
  anywhere in the file, so a clean run must reach the final `\i
  007_operator_reinstatement_governance.sql` line and exit `0`.
- The script hangs — most likely a stale local Postgres session holding a
  lock from a previous interrupted run; `supabase stop && supabase start`
  clears it.

A script that "completes" but never prints any `PASS` lines at all is also
a failure — it means something upstream (fixture setup, an `\ir` path
issue) silently broke before reaching any assertion; investigate rather
than treat silence as success.

---

## 8. Inspecting RLS policies, function grants, triggers, and storage policies directly

Useful for spot-checking a specific fix, or for the read-only live-project
check in §11. Run these via `psql` or the Supabase Studio SQL editor
(`supabase status` prints the local Studio URL).

**RLS policies on a table:**
```sql
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'customer_profiles'
ORDER BY policyname;
```

**Is RLS actually enabled on a table** (a table with zero policies and RLS
disabled silently allows everything — this catches that):
```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('customer_profiles', 'operator_businesses', 'operator_staff',
                   'operator_documents', 'audit_logs', 'user_roles');
```

**Column-level grants** (the actual C-01/C-02 enforcement mechanism):
```sql
SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'customer_profiles'
ORDER BY column_name, grantee;
```

**Does `authenticated` have EXECUTE on a specific function** (the exact
H-01 question — cleaner than parsing grant tables):
```sql
SELECT has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE');
SELECT has_function_privilege('authenticated', 'public.is_admin(uuid)', 'EXECUTE');
SELECT has_function_privilege('authenticated', 'public.is_business_member(uuid, uuid)', 'EXECUTE');
SELECT has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE'); -- expect false, it's trigger-only
```

**Triggers on a table:**
```sql
SELECT tgname, tgenabled, tgtype
FROM pg_trigger
WHERE tgrelid = 'public.operator_businesses'::regclass AND NOT tgisinternal;
```
Or in `psql` interactively: `\d public.operator_businesses` shows triggers
at the bottom of the table description.

**Function security mode and search_path** (SECURITY DEFINER + fixed
search_path is the H-01 requirement):
```sql
SELECT proname, prosecdef AS security_definer, proconfig
FROM pg_proc
WHERE proname IN ('has_role', 'is_admin', 'is_business_member', 'log_audit_event',
                   'sync_operator_staff_on_status_change');
```
`prosecdef = true` means SECURITY DEFINER; `proconfig` should show
`{search_path=public}` for each.

**Storage buckets and their limits (H-03):**
```sql
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets;
```

**Storage object policies:**
```sql
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
```

---

## 9. Resetting the test database safely

`supabase db reset` (no flags) is always safe — it only ever operates on
the local Docker Postgres instance belonging to the current project's
`supabase start` session. It drops and recreates that local database and
replays every migration from scratch. Run it as often as you like; there is
nothing in it to lose (it's not where you'd keep real data).

**Two things that are not safe, and neither this document nor
`run.sh` ever uses them:**

- `supabase db reset --linked` — targets whatever remote project you most
  recently `supabase link`-ed, which is not necessarily local.
- Passing a remote `--db-url` to `db reset` or `db push` without first
  triple-checking which project that URL points to.

`supabase/tests/run.sh` is deliberately incapable of the unsafe form: it
derives its target exclusively from `supabase status` (never accepts a URL
as a parameter or environment variable) and hard-refuses to proceed if that
URL doesn't contain `127.0.0.1` or `localhost`. If you ever see it about to
run against something else, that's a bug in the script or a wildly
misconfigured local Supabase CLI, either way — stop and investigate rather
than proceeding.

If `db reset` itself seems stuck or the local instance is in a bad state:
```sh
supabase stop --no-backup   # discards the local DB volume entirely
supabase start                # rebuilds from scratch
supabase db reset
```

---

## 10. Environment variables

**For running the SQL suite locally (the normal case):** none required.
`supabase/tests/run.sh` derives everything it needs from `supabase status`.

**For running `psql` by hand against a connection string that isn't the
local default:** the standard `psql`/`libpq` variables —
`PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`, or a single
`DATABASE_URL`/connection-string argument to `psql`. This only applies to
the manual staging/live-project procedures in §11 — never set these when
running `bun run test:db` / `run.sh`, which ignores them by design.

**Not related to this SQL suite at all:** the application's own `.env`
(`SUPABASE_URL`, `VITE_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, see
`docs/ENVIRONMENT_REQUIREMENTS.md`). The SQL tests connect directly via
`psql`, never through the app's Supabase client — there's no overlap, and
you don't need the app's `.env` populated to run this suite.

---

## 11. Credentials that must never be committed

- Any staging or production Postgres **connection string** (it embeds a
  password) — pass it on the command line or via a shell variable at the
  moment you use it, never write it into a file that gets committed, never
  put it in this repo's `.env` (which is already git-ignored, but that's
  not a reason to put a *production* credential there either — see
  `docs/ENVIRONMENT_REQUIREMENTS.md` for why `SUPABASE_SERVICE_ROLE_KEY`
  specifically must never be committed).
- The live Lovable Cloud project's `SUPABASE_SERVICE_ROLE_KEY` or database
  password, for the same reason.
- Real user credentials of any kind. The SQL fixtures in `_helpers.sql`
  intentionally use an obviously-fake password
  (`crypt('test-password-not-real', gen_salt('bf'))`) — never substitute a
  real one, even temporarily, even locally.

If you ever need to hand a connection string to someone else for this
purpose, use a secrets manager or a private, ephemeral channel — not a git
commit, not a PR comment, not this repo in any form.

---

## 12. Verifying the live Lovable Cloud project — after staging passes, and manually

This is intentionally **not automated by any script in this repository**,
per the instruction that produced this document. Do it yourself, once
you've confirmed the suite passes locally (§5) and ideally against a
dedicated staging project (§2):

1. **Start with read-only inspection**, using the queries in §8, run
   through the Supabase Studio SQL editor for the live project (or `psql`
   against its connection string obtained from the dashboard — Settings →
   Database → Connection string). This confirms the migrations actually
   applied to the real project and carries essentially no risk, since
   nothing in §8 writes data.
2. **Only run the full mutating suite (`run_all.sql`) against the live
   project if you specifically intend to and accept the residual risk.**
   Every script wraps its fixtures in `BEGIN; ... ROLLBACK;`, so a normal
   run leaves nothing behind — but a dropped connection mid-transaction, a
   future edit to a script that removes the `ROLLBACK`, or any other
   unexpected interruption could leave test fixture rows (fake users named
   like `kyc-customer@example.test`, test businesses, etc.) in the real
   project. Treat this as a deliberate, supervised action, not a routine
   one — ideally during a low-traffic window, with someone watching.
3. To run it: obtain the live project's connection string from the
   Supabase dashboard, then:
   ```sh
   psql "$LIVE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
   ```
   typed by hand, with `$LIVE_DB_URL` set in your own shell for that one
   command — never scripted, never defaulted, never committed.
4. Separately confirm the things this repository's tests can't see from a
   fresh migration replay: whether any real accounts are currently
   `suspended`/`rejected`/`deactivated` (the C-04 backfill only ran once,
   at migration-apply time, against whatever state existed then), and
   whether the live storage buckets' actual current settings match what
   `20260718070500_storage_bucket_provisioning.sql` asserts (the migration
   is self-correcting on re-apply, but confirm it actually got applied).

If the live project fails any check that staging passed, that's a real,
specific finding — not a "trust the migration" gap — and should be treated
with the same seriousness as anything in the original assessment.
