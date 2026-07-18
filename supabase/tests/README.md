# Stage 1 security regression tests (SQL)

These scripts prove the C-01/C-02/C-04/H-01/H-02/H-03 fixes at the database
layer — the layer the pure `bun test` suite in `src/lib/__tests__/` cannot
reach (RLS, column grants, triggers, storage). **They were written but not
executed in this session** — no Supabase CLI or Docker is available in this
environment (verified: `supabase --version` and `docker --version` both
fail). Do not treat them as passing until someone runs them.

## How to run

```sh
supabase start          # local Postgres + GoTrue + Storage, from this repo's migrations
supabase db reset        # applies all 10 committed migrations to a clean database
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/run_all.sql
```

Or against any Postgres connection string with the migrations already
applied:

```sh
psql "$DATABASE_URL" -f supabase/tests/run_all.sql
```

Each script uses plain `DO $$ ... RAISE EXCEPTION ...` assertion blocks (no
pgTAP dependency, to stay within "lightest appropriate tooling") and prints
`NOTICE:  PASS - ...` for each check, or aborts the transaction with
`ERROR:  FAIL - ...` on the first failure. Every script runs inside its own
`BEGIN; ... ROLLBACK;` so none of the fixture data (test users, businesses,
audit rows) is left behind.

## Simulating an authenticated user

Supabase's `auth.uid()` reads the `request.jwt.claims` GUC. Fixture rows in
`auth.users` are required to satisfy foreign keys (`owner_id references
auth.users(id)`, etc.) — a minimal insert (`id`, `email`,
`encrypted_password`, `instance_id = '00000000-0000-0000-0000-000000000000'`,
`aud='authenticated'`, `role='authenticated'`) is sufficient for RLS
purposes. `as_user(uuid)` (defined in `_helpers.sql`) sets both the JSON GUC
and `SET LOCAL ROLE authenticated` for the remainder of the transaction;
`as_service_role()` and `as_anon()` do the equivalent for the other two
roles.

## Files

| File | Finding(s) | Proves |
|---|---|---|
| `_helpers.sql` | — | Shared fixtures + `as_user`/`as_service_role`/`as_anon` helpers |
| `001_customer_kyc_lockdown.sql` | C-01 | Customer cannot set own `verification_status`/`reviewed_by`/`reviewed_at`/`review_notes`; can still set `saved_suburb`/`notes`; `reviewCustomerVerification`'s underlying service-role write still works |
| `002_operator_application_lockdown.sql` | C-02 | Owner cannot set own `application_status`/`reviewed_by`/`reviewed_at`/`review_notes`; can still edit business content fields; cross-owner write fails |
| `003_operator_suspension.sql` | C-04 | Suspending a business flips `operator_staff.active` to false via the trigger; staff RLS access is cut immediately; owner loses document upload/delete but keeps read; reinstatement restores staff access |
| `004_rls_helper_execute.sql` | H-01 | A non-owner staff member can SELECT their business (would previously 500 with EXECUTE revoked); `super_admin` can write `pilot_configuration` |
| `005_audit_log_integrity.sql` | H-02 | Direct `INSERT INTO audit_logs` fails for `authenticated`; `log_audit_event()` succeeds and always attributes the real caller, never a spoofed `actor_id`/`actor_role` |
| `006_storage_provisioning.sql` | H-03 | Both buckets exist, are private, and have the expected size/MIME limits after migrations replay |
| `007_operator_reinstatement_governance.sql` | Founder governance (reinstatement + rejection-terminal) | Reinstatement restores only the staff rows *this* suspension deactivated, not ones already inactive for an unrelated reason; a rejected business's `application_status` remains unwritable to `authenticated` regardless of target status |
| `run_all.sql` | — | Runs all of the above in order |
