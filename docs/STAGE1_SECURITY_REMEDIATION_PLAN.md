# Stage 1 Security Remediation Plan

Authoritative source: `docs/CASHNEAR_TECHNICAL_ASSESSMENT.md`. This plan covers the 4 Critical + 3 High findings selected for remediation. Implementation-focused; see the completion report (`docs/STAGE1_SECURITY_REMEDIATION_REPORT.md`) for what actually landed and test results.

**Environment note:** no Supabase CLI / Docker available in this environment (checked, absent). DB-layer fixes are still implemented as real, committed SQL migrations — they just can't be executed against a live Postgres from here. SQL test scripts are written to be run via `supabase start && supabase db reset` and are clearly marked not-executed until someone with that tooling runs them. Pure TypeScript state-machine logic is extracted so it can get real, executed `bun test` coverage in this environment.

**Chosen suspension model (§6 of the task):** **Model A** — keep `user_roles` as a historical/stable record, enforce *effective* access at the RLS/trigger layer via `operator_staff.active` + `operator_businesses.application_status`. Rationale: `operator_staff.active` already exists in the schema for exactly this purpose, avoids re-granting/re-inserting role rows on reinstatement (less state to manage than Model B), and keeps `user_roles` meaning "has ever held this capability" rather than conflating it with "is currently entitled" — matching how `is_business_member` already separates ownership/staffing from operational status.

---

## C-01 — Customer self-approves KYC

- **Root cause:** `customer_profiles` UPDATE RLS policy (`"Customer updates own record"`) checks only row ownership (`auth.uid() = user_id`), not which columns changed. `verification_status`, `reviewed_by`, `reviewed_at`, `review_notes` are writable by the record's own subject.
- **Files/migrations:** `supabase/migrations/20260718061518...sql:96-97` (policy); `20260718064316...sql:2-13` (privileged columns added). New migration required.
- **Proposed fix:**
  1. New migration: `REVOKE UPDATE ON public.customer_profiles FROM authenticated;` then `GRANT UPDATE (saved_suburb, notes) ON public.customer_profiles TO authenticated;` — column-level grant restricts direct table UPDATE to genuinely self-service fields only. Everything else (identity fields + privileged review fields) becomes unwritable via direct table access for `authenticated`, full stop — independent of RLS.
  2. `submitCustomerVerification` (customer.functions.ts) switches its `customer_profiles` write from the RLS-scoped `supabase` client to `supabaseAdmin` (service role, unaffected by the column revoke) — it already only ever sets `verification_status: "pending"` server-side, never attacker-controlled, so this is a transport change, not a logic change.
  3. New admin function `reviewCustomerVerification` (admin.functions.ts, mirrors `reviewOperatorApplication`) — the **only** path that can set `verification_status` to `approved`/`rejected`/`suspended`, using `supabaseAdmin` + `assertAdmin`. Required because no admin path for customer verification currently exists at all (confirmed absent in the original assessment) — without this, locking down self-service leaves verification permanently un-actionable.
- **Security boundary after fix:** a customer can update `saved_suburb`/`notes` directly; every other column requires either the `submitCustomerVerification` server function (self, submission only, always sets `pending`) or `reviewCustomerVerification` (admin only, verified server-side role).
- **Data-migration impact:** none — no existing row data changes shape or value; purely a grant/policy change.
- **Test required:** SQL — authenticated customer JWT context attempts `UPDATE customer_profiles SET verification_status='approved'` → must fail with a permission error, not just return 0 rows. TS — call `reviewCustomerVerification` as non-admin → rejected; as admin → succeeds and writes an audit record.
- **Rollback:** re-run `GRANT UPDATE ON public.customer_profiles TO authenticated;` (unrestricted) to revert; no data loss either direction.

## C-02 — Operator self-approves business application

- **Root cause:** same pattern as C-01, on `operator_businesses`.
- **Files/migrations:** `supabase/migrations/20260718061518...sql:161-162`. New migration required.
- **Proposed fix:** `REVOKE UPDATE ON public.operator_businesses FROM authenticated;` then `GRANT UPDATE (legal_name, trading_name, business_type, registration_number, tax_number, years_operating, description, street_address, suburb, city, province, postal_code, gps_lat, gps_lng, premises_type, terminal_provider, terminal_model, estimated_mdr, representative_name, representative_id_number, representative_mobile, representative_email, representative_relationship, opening_hours, max_transaction_amount, agreements_accepted_at) ON public.operator_businesses TO authenticated;` — every applicant-editable field stays directly writable by the owner (RLS ownership check still applies on top); `application_status`, `submitted_at`, `reviewed_at`, `reviewed_by`, `review_notes` become unwritable directly.
- **Security boundary after fix:** owner can edit business content fields directly (still gated by existing ownership RLS); status/review fields only move through `upsertOperatorApplication` (self, validated transition, see C-03) or `reviewOperatorApplication` (admin only).
- **Data-migration impact:** none.
- **Test required:** SQL — owner JWT attempts `UPDATE operator_businesses SET application_status='approved' WHERE owner_id=auth.uid()` → fails at the grant layer.
- **Rollback:** re-run unrestricted `GRANT UPDATE`.

## C-03 — No state-transition validation before overwrite

- **Root cause:** `upsertOperatorApplication` never reads the business's current `application_status` before writing; the client-side "locked" flag is cosmetic only.
- **Files/migrations:** `src/lib/operators.functions.ts:50-129`. No migration needed beyond C-02's column revoke (which already blocks the status write at the DB layer for direct access — this fix addresses the *legitimate function's own* logic).
- **Proposed fix:** extract an `applicantAllowedTransition(current: Status | undefined, next: 'draft' | 'submitted'): boolean` pure function (testable in isolation). Before writing, fetch the current row (if `business_id` given); if a row exists and its status isn't `draft` or `info_requested`, throw `"Application cannot be edited in its current state."` — reject the whole call, no partial write. Route the `application_status`/`submitted_at` write through `supabaseAdmin` (required now that C-02 revokes the column from `authenticated`); other business fields keep using the RLS-scoped client.
- **Security boundary after fix:** the same server function that's always been the only sanctioned write path now refuses to touch a business once it has left the applicant-editable states, in addition to the DB no longer allowing a raw write to those columns regardless.
- **Data-migration impact:** none — existing rows' current status values are exactly what the new check reads; no backfill needed.
- **Test required:** `bun test` unit test of `applicantAllowedTransition` covering every enum value; integration-style test (mocked Supabase client) confirming `upsertOperatorApplication` throws for `approved`/`rejected`/`suspended`/`under_review`/`site_verification_required`/`deactivated` businesses and succeeds for `draft`/`info_requested`/new.
- **Rollback:** revert the file to remove the pre-check; no data shape change to undo.

## C-04 — Suspension doesn't revoke access

- **Root cause:** `reviewOperatorApplication` only ever writes `operator_businesses`; nothing deactivates `operator_staff` or gates operational actions on business status.
- **Files/migrations:** `src/lib/admin.functions.ts:33-80`. New migration for a DB trigger (defense-in-depth, holds regardless of which code path changes status) plus a status-aware condition on `operator_documents` INSERT/DELETE policies.
- **Proposed fix (Model A):**
  1. New migration: `AFTER UPDATE OF application_status ON operator_businesses` trigger (`sync_operator_staff_on_status_change`, `SECURITY DEFINER SET search_path = public`) — when status moves to `suspended`/`deactivated`/`rejected`, sets `operator_staff.active = false` for that business; when status moves `suspended → approved` (reinstatement), sets `active = true` for that business's staff rows. This is DB-level, not just application code, so it holds even for direct service-role updates that don't go through `reviewOperatorApplication`.
  2. `is_business_member`'s staff branch (`operator_staff... AND active = true`) already existed — the trigger now makes `active` correctly track suspension automatically, so staff visibility into a suspended business's data (via the existing RLS policies on `operator_businesses`/`operator_staff`/`operator_documents`) is cut immediately. The owner-ownership branch (`owner_id = _user_id`) stays unconditional so an owner can still see their own status (this is desired — a suspended owner should see "Suspended," not be locked out entirely).
  3. `operator_documents` INSERT/DELETE policies gain an explicit `AND b.application_status NOT IN ('suspended','deactivated')` condition — the one owner-only *write* action that exists in Stage 1 today (uploading/deleting documents) is blocked for a suspended/deactivated business, while SELECT (read) stays available.
  4. `reviewOperatorApplication` gains a transition-validity check (see below, shared concept with C-03) so an admin can't jump straight from `draft` to `approved`, etc.
- **Security boundary after fix:** staff lose read access to business/staff/document data the moment `active` flips to false (RLS-enforced, immediate); the owner loses the ability to upload/delete documents while suspended (RLS-enforced); the owner cannot resubmit/edit the application while suspended (already covered by C-03's state check, since `suspended` isn't in the applicant-editable set); reinstatement (`suspended → approved`, admin-only) restores staff access automatically via the same trigger.
- **Known scope limit (documented, not silently hidden):** Stage 1 has no other "operational" endpoints yet (no cash requests/matching) — this fix establishes the enforcement pattern (status + active-membership gate) that any Stage 2 operational server function must extend, rather than gating functionality that doesn't exist yet.
- **Data-migration impact:** the trigger only fires on future `application_status` transitions; it does not retroactively change `operator_staff.active` for rows already in a suspended/deactivated/rejected state today. **Action:** the remediation migration includes a one-time backfill `UPDATE operator_staff SET active = false WHERE business_id IN (SELECT id FROM operator_businesses WHERE application_status IN ('suspended','deactivated','rejected')) AND active = true;` so existing suspended businesses (if any exist in the live project) are immediately correct, not just future ones.
- **Test required:** SQL — suspend a business as admin, assert staff row `active=false`, assert staff JWT can no longer SELECT the business; assert owner JWT still can SELECT but INSERT into `operator_documents` fails; reinstate, assert `active=true` restored. TS — transition-validity unit tests for the admin map.
- **Rollback:** drop the trigger and the `NOT IN ('suspended','deactivated')` condition on the two document policies to revert to prior (less safe) behavior; the one-time backfill is not itself reversible without knowing prior per-row state, but reversing it only re-opens a hole, so no rollback is provided for the backfill — reverting the trigger/policy is sufficient to restore old *behavior* even though the backfilled rows stay `active=false` (safe direction to leave them in).

## H-01 — RLS helper EXECUTE grants

- **Root cause:** migration `20260718061532...sql` revokes `EXECUTE` on `has_role`/`is_admin`/`is_business_member`/`handle_new_user` from `PUBLIC, anon, authenticated`. RLS policy evaluation runs as the querying role (`authenticated` for real users) and requires `EXECUTE` on any function a policy branch calls, independent of `SECURITY DEFINER`. Non-owner branches (staff reads, admin reads via the RLS-scoped client, `super_admin` pilot-config writes, the `verification_reviews` insert inside `reviewOperatorApplication`) would raise permission-denied instead of a clean allow/deny.
- **Files/migrations:** `supabase/migrations/20260718061532_b9120853...sql`. New forward-only migration (do not edit the historical one).
- **Proposed fix:** `GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated; GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated; GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO authenticated;` — re-grant exactly the three functions RLS policies depend on. **Deliberately not** re-granting `handle_new_user`: it's an `AFTER INSERT ON auth.users` trigger function, invoked by the trigger manager, never called directly by client SQL — the revoke on it is harmless and correctly stays revoked (no one should ever be able to call it directly via RPC). Not re-granting to `anon`/`PUBLIC` either — no `anon`-facing policy calls these functions (every policy is `TO authenticated`), so `anon` never needs it.
- **Search path / security mode:** already correct (`SECURITY DEFINER SET search_path = public` on all three, set at function-definition time, immune to caller session `search_path`) — verified by reading migration 1; no change needed there.
- **Residual, explicitly accepted risk:** re-granting `EXECUTE` to `authenticated` also makes these three functions callable directly via `supabase.rpc('has_role', {...})` / `is_admin` / `is_business_member` from any signed-in user, which is a low-severity "role probing" surface (an attacker who already has a candidate user UUID can ask "does X hold role Y?"). The fully robust fix is moving these into a non-API-exposed schema so RLS can still resolve them while PostgREST stops exposing them as `/rpc/*` endpoints — that requires rewriting every policy that references them by qualified name (~15+ `CREATE POLICY` statements across 4 migrations), which is a much larger, riskier diff than this remediation's scope warrants given the probing risk is bounded (boolean result, requires a known UUID, no enumeration). **Documented here as a deliberate scope decision, recommended as a follow-up hardening item, not blocking Stage 2.**
- **Data-migration impact:** none — pure grant change.
- **Test required:** SQL — as a non-owner staff-member JWT, SELECT a business they're an active staff member of → must succeed (previously would 500 without this fix); as `super_admin` JWT, UPDATE `pilot_configuration` → must succeed. TS/manual — confirm `reviewOperatorApplication`'s `verification_reviews` insert error would no longer be silently possible (the insert's error is now also explicitly checked, see H-02 work below, as a second independent layer).
- **Rollback:** re-run the original `REVOKE` — reverts to the (broken) prior state; no data impact either way.

## H-02 — Audit log forgery

- **Root cause:** `audit_logs` INSERT policy (`WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL)`) constrains `actor_id` but not `actor_role`, `action`, `entity_type`, or `metadata` — any authenticated user can write a fabricated record.
- **Files/migrations:** `supabase/migrations/20260718061518...sql:263-264`. New migration.
- **Proposed fix:**
  1. `REVOKE INSERT ON public.audit_logs FROM authenticated;` and drop the `"Authenticated inserts audit log for self"` policy — no direct table INSERT remains possible for `authenticated`.
  2. New `SECURITY DEFINER SET search_path = public` function `public.log_audit_event(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb DEFAULT NULL)` — derives `actor_id` **exclusively** from `auth.uid()` (never a parameter — this is the actual anti-forgery property), independently re-derives `actor_role` from the caller's real `user_roles` rows (precedence: `super_admin` > `ops_admin` > any `operator_*` role > `customer`) rather than trusting a client-supplied role string, validates `p_action` against a simple `^[a-z0-9_]+(\.[a-z0-9_]+)+$` shape (rejects garbage/empty strings, stays forward-compatible with new action names), and inserts. `GRANT EXECUTE ... TO authenticated` — safe to expose broadly because the function can only ever attribute an entry to the true caller, never to someone else.
  3. Every existing `supabase.from("audit_logs").insert(...)` call in `admin.functions.ts`, `operators.functions.ts`, `customer.functions.ts` is replaced with `supabase.rpc("log_audit_event", {...})`. `reviewOperatorApplication`'s previously-unchecked `verification_reviews` insert (§H-01 evidence) also gets its returned `error` checked and thrown, closing the silent-failure path directly, independent of the H-01 grant fix.
- **Security boundary after fix:** no ordinary user can insert, update, or delete an `audit_logs` row directly (UPDATE/DELETE were already ungranted); the only write path attributes every row to the real authenticated caller and a server-computed role, never a client-supplied one.
- **Data-migration impact:** none — existing audit rows are untouched; this only changes how new rows get written.
- **Test required:** SQL — authenticated JWT attempts direct `INSERT INTO audit_logs (actor_role, action, ...) VALUES ('super_admin', 'role.granted', ...)` → fails (no grant); calls `log_audit_event('customer.test', 'x', 'y')` → succeeds, row shows the caller's real `actor_id`/role, not any spoofed value. TS — `reviewOperatorApplication`'s review-history write is checked and would surface an error instead of silently succeeding if it ever failed.
- **Rollback:** re-grant `INSERT` to `authenticated` and drop the function to revert; existing rows unaffected either direction.

## H-03 — Storage buckets not provisioned via migration

- **Root cause:** no `INSERT INTO storage.buckets` (or equivalent) exists anywhere in committed migrations; both buckets' existence and configuration live only in whatever was manually done in the live Lovable Cloud project.
- **Files/migrations:** none currently reference bucket creation. New migration required.
- **Proposed fix:** new migration inserting both buckets with `public = false`, a `file_size_limit` (10 MiB), and `allowed_mime_types` (`image/jpeg`, `image/png`, `image/webp`, `application/pdf`), using `ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types` — idempotent and self-correcting: safe to run against a fresh project (creates the buckets) or the existing live project (asserts the intended config without touching already-stored objects, since only bucket-level metadata changes, not contents).
- **Security boundary after fix:** a fresh environment created purely from `supabase db reset`/migration replay now has both buckets, private, with real size/MIME enforcement at the Storage layer (not just a client-side HTML `accept` hint) — this also meaningfully narrows H-04 from the original assessment (file-type/size validation) as a side effect, though full server-side content re-validation remains open (out of this remediation's explicit scope — see completion report).
- **Data-migration impact:** none for existing objects; if the live bucket currently has looser settings than this migration asserts, applying it tightens enforcement going forward (does not delete or reject already-stored files).
- **Test required:** SQL/manual — after migration, `SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id IN (...)` returns the expected private/limited config; upload of an oversized or wrong-MIME file is rejected by Storage.
- **Rollback:** `DELETE FROM storage.buckets WHERE id IN (...)` — **only safe if the bucket has no stored objects**; if objects exist, prefer reverting only the `file_size_limit`/`allowed_mime_types`/`public` values via another `UPDATE`, not deleting the bucket row (which would orphan or block access to existing files).

---

## Cross-cutting: role assignment review (§7)

`grantUserRole` already satisfies most of §7's requirements as-is (verified by reading, not assumed): only callable by verified `super_admin`, actor derived from server session, duplicate-safe upsert, already audited. Change made here: route its audit write through `log_audit_event` (H-02) for consistency. **Not** wrapping the role-upsert + audit-write in a single DB transaction in this pass — the failure mode of the current two-step sequence (upsert succeeds, audit write fails) loses a paper-trail entry but never grants an unaudited-and-unintended role; judged out of this remediation's explicit scope (documented as a future hardening item in the completion report, not a finding blocking Stage 2). Confirmed no current code path treats "has `operator_owner` role" as proof of "business is approved" (`useAuth().isOperator` is used only for client-side routing convenience; every actual authorization decision already goes through `is_business_member`/`application_status`, independently of role).

## Migration ordering

New migrations are strictly additive/forward-only, applied after the existing four:

5. `..._customer_profile_column_privileges.sql` (C-01)
6. `..._operator_business_column_privileges.sql` (C-02)
7. `..._operator_suspension_enforcement.sql` (C-04, includes staff-active trigger + document policy update + one-time backfill)
8. `..._rls_helper_execute_grants.sql` (H-01)
9. `..._audit_log_lockdown.sql` (H-02)
10. `..._storage_bucket_provisioning.sql` (H-03)

No historical migration is edited. Each is independently forward-applicable and, per-file, individually reversible as described above.

## Proceeding to Phase B

None of the above fixes destroy data or change a currently-working, intended business behavior for a real user (the "behaviors" removed are exactly the unintended self-approval/self-reinstatement paths). Proceeding to Phase B implementation without further pause, per the task's instruction.
