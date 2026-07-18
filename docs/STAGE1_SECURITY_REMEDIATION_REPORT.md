# Stage 1 Security Remediation Report

Companion to `docs/CASHNEAR_TECHNICAL_ASSESSMENT.md` (findings) and `docs/STAGE1_SECURITY_REMEDIATION_PLAN.md` (design). This document reports what was actually implemented, what was actually tested, and a precise Stage 2 readiness decision.

---

## Executive summary

All 4 Critical and 3 High findings from the assessment are fixed at the database/RLS/trusted-server-function layer, not just the frontend. Concretely:

- A customer can no longer write their own `verification_status` (or any reviewer field) — the column is no longer grantable to `authenticated` at all, only through a service-role path.
- An operator can no longer write their own `application_status` (or any reviewer field) — same column-level lockdown.
- The application server function now validates the business's *current* status before allowing any edit, closing the self-reinstatement path that existed independently of the column lockdown.
- Suspending, deactivating, or rejecting a business now immediately deactivates its `operator_staff` rows via a database trigger, and the one operational write Stage 1 has (document upload/delete) is blocked while suspended — enforced at the RLS layer, not just in application code.
- The RLS helper-function `EXECUTE` grant that was silently breaking non-owner access paths (and likely suppressing the operator-review audit trail) is restored, narrowly, to exactly the three functions that need it.
- `audit_logs` is now genuinely append-only: no direct `INSERT`/`UPDATE`/`DELETE` for ordinary users, only through a `SECURITY DEFINER` function that derives the actor from the real session, never a parameter.
- Both storage buckets are now provisioned by a committed, idempotent migration, with real size/MIME limits enforced at the Storage layer.

113 executed `bun test` cases prove the state-machine logic exhaustively. Seven SQL regression scripts prove the RLS/trigger/audit/storage behavior — **written but not executed in this session**, because no Supabase CLI or Docker is available in this environment (verified absent). This is stated plainly, not glossed over — see §Tests below for exactly what that means for confidence level.

**Post-initial-remediation update:** the founder made two governance decisions after the first pass of this report — (1) only `super_admin` may reinstate a suspended operator, through a dedicated function with a mandatory written reason and an actor-eligibility check, not the general-purpose review function `ops_admin` can call; (2) rejection is terminal, no reconsideration path. Both are now implemented; see the C-04 and "Founder decisions" sections below, which reflect the current, post-decision state, not the original draft.

**The core trust boundary — "can the party being evaluated set their own outcome?" — is now enforced by the database, independent of the frontend or any single server function.** See §Stage 2 readiness for the precise, conditioned verdict.

---

## Findings addressed

### C-01 — Customer self-approves KYC

- **Original vulnerability:** `customer_profiles` UPDATE RLS policy checked only row ownership; a customer could `UPDATE customer_profiles SET verification_status = 'approved'` directly.
- **Root cause:** no column-level restriction on the UPDATE grant/policy.
- **Fix implemented:** `REVOKE UPDATE ON customer_profiles FROM authenticated`, re-granted column-restricted to `saved_suburb, notes` only. `submitCustomerVerification` now writes via `supabaseAdmin` (service role). New `reviewCustomerVerification` admin function (previously did not exist at all) is the only admin-decision path.
- **Files/migrations:** `supabase/migrations/20260718070000_customer_profile_column_privileges.sql`; `src/lib/customer.functions.ts`; `src/lib/admin.functions.ts` (`reviewCustomerVerification`).
- **Test added:** `supabase/tests/001_customer_kyc_lockdown.sql` (not executed, see Tests).
- **Test result:** not executed in this environment.
- **Remaining risk:** the SQL test proving this is unexecuted — treat as **unverified** until run. Static reasoning (reading the exact GRANT/REVOKE statements and confirming PostgREST issues a single `UPDATE ... SET <only-the-given-columns>` per request) supports the fix, but this is not the same as an executed proof.

### C-02 — Operator self-approves business application

- **Original vulnerability:** identical pattern on `operator_businesses` — an operator could set their own `application_status` to `approved`.
- **Root cause:** same — no column-level restriction on the UPDATE grant/policy.
- **Fix implemented:** `REVOKE UPDATE ON operator_businesses FROM authenticated`, re-granted column-restricted to the 26 applicant-editable business fields (business/location/terminal/representative details). Status/reviewer columns writable only through `upsertOperatorApplication` (validated, see C-03) or `reviewOperatorApplication`.
- **Files/migrations:** `supabase/migrations/20260718070100_operator_business_column_privileges.sql`; `src/lib/operators.functions.ts`.
- **Test added:** `supabase/tests/002_operator_application_lockdown.sql` (not executed); also proves cross-owner isolation (owner A cannot touch owner B's business).
- **Test result:** not executed in this environment.
- **Remaining risk:** same caveat as C-01 — unexecuted SQL proof.

### C-03 — No state-transition validation before overwrite

- **Original vulnerability:** `upsertOperatorApplication` never checked current `application_status`; a rejected/suspended operator could call the same function to silently reset their status.
- **Root cause:** missing state check in the server function; the client-side "locked" flag was cosmetic only.
- **Fix implemented:** `applicantCanEdit()` in `src/lib/operator-application-state.ts` — a business is editable by its applicant only while `draft` or `info_requested`. `upsertOperatorApplication` now reads current status first (via an ownership-checked query that also closes "change another operator's application" as a side effect) and rejects the write otherwise. The status write itself moves to the service role (required now that C-02 revokes the column from `authenticated`).
- **Files/migrations:** `src/lib/operator-application-state.ts` (new); `src/lib/operators.functions.ts`.
- **Test added:** `src/lib/__tests__/operator-application-state.test.ts` — exhaustive: every one of the 9 `operator_application_status` enum values against `applicantCanEdit`.
- **Test result:** **executed, 99/99 passing** (this file plus the C-04/admin-transition tests below, all in one suite — see Tests for the exact breakdown).
- **Remaining risk:** low. The pure-logic proof is real and executed; the only untested layer is the server function's I/O plumbing around it (mocking `createServerFn`'s runtime was judged out of scope — see Tests).

### C-04 — Suspension doesn't revoke access

- **Original vulnerability:** `reviewOperatorApplication` only wrote `operator_businesses`; nothing deactivated staff or blocked operational actions.
- **Root cause:** no code path tied `application_status` to `operator_staff.active` or to any write-permission check.
- **Fix implemented:** **Model A** (roles stay historical; effective access enforced via `operator_staff.active` + `application_status`) — see rationale below. `trg_operator_businesses_status_sync` trigger deactivates staff on `suspended`/`deactivated`/`rejected`. One-time backfill for any business already in one of those states. `operator_documents` INSERT/DELETE policies gained a `NOT IN ('suspended','deactivated')` condition on the owning business.
- **Files/migrations:** `supabase/migrations/20260718070200_operator_suspension_enforcement.sql`.
- **Governance update (post-initial-remediation):** the founder decided reinstatement (`suspended → approved`) requires `super_admin` specifically — an `ops_admin` may review and recommend but not independently restore access. `isValidAdminTransition` (the map `reviewOperatorApplication` consults) no longer includes `suspended → approved` at all, for any role; that transition is now reachable **only** through a new dedicated function, `reinstateOperator` (`src/lib/admin.functions.ts`), which: requires `role === 'super_admin'` (checked before anything else); requires a written reason (`z.string().trim().min(10)`, stored in both `review_notes` and the `verification_reviews`/audit-log trail); rejects the call if the acting super_admin is the business's owner or appears in its `operator_staff` (`isReinstatementActorEligible`, checked against a fresh read of both, not cached); and writes through the same service-role/audit path as every other decision. The trigger itself was also refined: `operator_staff.deactivated_by_suspension_at` (new column, migration `20260718080000`) records exactly which staff rows a given suspension deactivated, and reinstatement reactivates only those — a staff member who was already inactive for an unrelated reason before the suspension stays inactive, satisfying "previously deactivated staff are not all automatically reactivated without an explicit rule."
- **Files/migrations (governance update):** `supabase/migrations/20260718080000_operator_reinstatement_governance.sql`; `src/lib/operator-application-state.ts` (`canReinstateFrom`, `isReinstatementActorEligible`, updated `ADMIN_ALLOWED_TRANSITIONS`); `src/lib/admin.functions.ts` (`reinstateOperator`).
- **Test added:** `supabase/tests/003_operator_suspension.sql` and `supabase/tests/007_operator_reinstatement_governance.sql` (not executed); admin-transition-matrix tests in `operator-application-state.test.ts` (executed) now prove `suspended → approved` is **not** reachable through the general map for any role, `canReinstateFrom`/`isReinstatementActorEligible` are covered directly (executed, passing).
- **Test result:** state-machine and actor-eligibility logic executed and passing (113/113, see Tests). The trigger/RLS portion (staff reactivation, document-policy status gate, rejected-is-unwritable) is not executed — SQL scripts only.
- **Remaining risk:** **medium, pending SQL execution**, same as the original assessment of this finding — a trigger and a column-grant lockdown are exactly the kind of thing that should be proven to actually fire/hold before being trusted in production, and that proof is still outstanding in this environment.

### H-01 — RLS helper EXECUTE grants

- **Original vulnerability:** migration `20260718061532` revoked `EXECUTE` on `has_role`/`is_admin`/`is_business_member` from `authenticated`, which RLS policies need to call for non-owner branches.
- **Root cause:** over-broad revoke; didn't account for RLS policy evaluation needing caller-role EXECUTE independent of `SECURITY DEFINER`.
- **Fix implemented:** re-grant `EXECUTE` on exactly those three functions to `authenticated`. `handle_new_user` stays revoked (trigger-only, correct as-is). `anon` stays revoked (no anon policy needs them).
- **Files/migrations:** `supabase/migrations/20260718070300_rls_helper_execute_grants.sql`.
- **Test added:** `supabase/tests/004_rls_helper_execute.sql` (not executed).
- **Test result:** not executed in this environment.
- **Remaining risk:** **the original bug's existence in the live project is itself unconfirmed** — I do not have credentials to the live Supabase project and never queried it. This fix is a correct reading of the committed SQL (verified: EXECUTE privilege is required to invoke a function regardless of SECURITY DEFINER — this is standard Postgres privilege behavior, not something I'm inferring loosely), but "was this actually causing 500s in production" remains **Inferred**, not confirmed. Re-granting is safe either way (it only restores the ability to call three narrowly-scoped boolean helper functions), so there's no downside to applying it even if the live impact turns out to have been smaller than estimated.
- **Residual accepted risk (documented, not fixed):** re-granting EXECUTE also makes these three functions callable directly via `.rpc()` — a bounded, low-severity role-probing surface. See the remediation plan for why the fully robust fix (schema separation) was judged out of scope.

### H-02 — Audit log forgery

- **Original vulnerability:** `audit_logs` INSERT policy constrained `actor_id` but not `actor_role`/`action`/`metadata` — any authenticated user could write a fabricated record.
- **Root cause:** missing constraints on the non-identity columns of an otherwise identity-scoped policy.
- **Fix implemented:** `REVOKE INSERT ON audit_logs FROM authenticated`; new `log_audit_event()` SECURITY DEFINER function derives `actor_id` from `auth.uid()` and `actor_role` from the caller's real `user_roles` rows — never from a parameter. Every audit write in the codebase (`admin.functions.ts`, `operators.functions.ts`, `customer.functions.ts`) now goes through this function instead of a raw table insert. `reviewOperatorApplication`'s previously-unchecked `verification_reviews` insert error is now checked and thrown.
- **Files/migrations:** `supabase/migrations/20260718070400_audit_log_lockdown.sql`; all three `*.functions.ts` files.
- **Test added:** `supabase/tests/005_audit_log_integrity.sql` (not executed).
- **Test result:** not executed in this environment.
- **Remaining risk:** same unexecuted-SQL caveat. Static reasoning is strong here (the function has no `actor_id`/`actor_role` parameter at all — there is no code path by which a caller *could* supply a false one, independent of any RLS/grant subtlety), but "strong static reasoning" is still not "executed proof."

### H-03 — Storage buckets not provisioned via migration

- **Original vulnerability:** neither bucket was created anywhere in committed migrations; a fresh environment had no buckets at all.
- **Root cause:** bucket provisioning was done manually (presumably via the Lovable Cloud dashboard) and never captured in version control.
- **Fix implemented:** new migration inserting both buckets (`public=false`, 10 MiB limit, image/PDF MIME allow-list) with `ON CONFLICT (id) DO UPDATE`, idempotent against both a fresh project and the existing live one.
- **Files/migrations:** `supabase/migrations/20260718070500_storage_bucket_provisioning.sql`.
- **Test added:** `supabase/tests/006_storage_provisioning.sql` (not executed).
- **Test result:** not executed in this environment.
- **Remaining risk:** low for the migration's correctness (it's a simple, well-understood `INSERT ... ON CONFLICT` pattern, Supabase's own documented approach), but **the live project's actual current bucket configuration was never inspected** (no credentials) — if the live bucket already has looser settings, this migration tightens them going forward but does not retroactively touch already-stored files, which is the intended, safe behavior.

---

## Database changes

**New migrations (7, in application order):**

| File | Purpose |
|---|---|
| `20260718070000_customer_profile_column_privileges.sql` | C-01: column-level UPDATE lockdown on `customer_profiles` |
| `20260718070100_operator_business_column_privileges.sql` | C-02: column-level UPDATE lockdown on `operator_businesses` |
| `20260718070200_operator_suspension_enforcement.sql` | C-04: staff-active sync trigger, backfill, document-policy status gate |
| `20260718070300_rls_helper_execute_grants.sql` | H-01: re-grant EXECUTE on the three RLS helper functions |
| `20260718070400_audit_log_lockdown.sql` | H-02: revoke direct INSERT, add `log_audit_event()` |
| `20260718070500_storage_bucket_provisioning.sql` | H-03: create both storage buckets with limits |
| `20260718080000_operator_reinstatement_governance.sql` | Founder governance: `operator_staff.deactivated_by_suspension_at` + refined trigger so reinstatement restores only suspension-caused deactivations |

**Policy changes:** `operator_documents` INSERT/DELETE gained a business-status condition (migration 070200). `audit_logs` lost its `authenticated` INSERT policy (070400). No existing policy was dropped without replacement except that one (deliberately — it's superseded by `log_audit_event`).

**Function changes:** new `sync_operator_staff_on_status_change()` (trigger), new `log_audit_event()` (RPC). `has_role`/`is_admin`/`is_business_member` unchanged except EXECUTE grant.

**Constraint changes:** none (no new CHECK/FK constraints — the lockdowns are GRANT/REVOKE-based, not constraint-based, per the plan's design).

**Role/grant logic changes:** column-level GRANTs on two tables (070000, 070100); table-level REVOKE on `audit_logs` (070400); function EXECUTE grants (070300).

**Storage changes:** two buckets created/asserted via `storage.buckets` INSERT (070500). No change to existing `storage.objects` policies (they were already correctly scoped in migrations 3–4 from the original assessment).

**No historical migration was edited.** All six are new, forward-only files.

---

## Customer verification — how self-approval is now prevented

Two independent layers, either of which alone would block it:

1. **Database grant layer:** `authenticated` has no `UPDATE` privilege on `customer_profiles.verification_status` (or `reviewed_by`/`reviewed_at`/`review_notes`) at all — not "blocked by a policy check," but literally not a grantable operation for that role on those columns. A raw `supabase.from('customer_profiles').update({verification_status:'approved'})` call fails with a Postgres permission error before RLS even evaluates.
2. **Server-function layer:** the only two paths that *can* write those columns (`submitCustomerVerification`, `reviewCustomerVerification`) run as the service role, and each independently enforces who's allowed to call it: `submitCustomerVerification` always writes `pending` regardless of input; `reviewCustomerVerification` requires `assertAdmin()` to pass first, using the JWT-verified `userId` from `requireSupabaseAuth`, never a client-supplied identity.

## Operator verification — how self-approval and self-reinstatement are prevented

Three layers:

1. **Database grant layer:** identical pattern to customer verification, on `operator_businesses`.
2. **State-machine layer:** `upsertOperatorApplication` (the applicant's own function) refuses to write anything once the business has left `draft`/`info_requested`, closing the self-reinstatement path even for someone who already has legitimate access to that function.
3. **Server-function admin layer:** `reviewOperatorApplication` validates the transition itself is legal (`isValidAdminTransition`) before writing, so even a compromised or buggy admin caller can't jump straight from `draft` to `approved`.

## Rejected operator applications — why rejection is terminal

Founder decision (applied after the initial remediation pass): a rejected application may not be edited, resubmitted, overwritten, or transitioned back to `submitted`/`under_review`/`approved`. This was already mostly true from the initial C-03 fix (`applicantCanEdit` never included `rejected` in the applicant-editable set, so the applicant's own function already refused to touch it), but the initial `ADMIN_ALLOWED_TRANSITIONS` map included `rejected: ["under_review"]` as a deliberate "allow reconsideration" judgment call, documented at the time as exactly that — a judgment call, not a requirement. The founder has now overridden it: `rejected` is `[]` in the map, identical to `deactivated`. No admin transition is reachable from `rejected` through `reviewOperatorApplication`, `reinstateOperator`, or any other path — and the column-level lockdown from C-02 means `application_status` isn't writable to `authenticated` at all regardless, so this is enforced at both the transition-logic layer and the data layer.

**Future reapplication (explicitly not built in this remediation):** a rejected applicant who wants to try again must get a **new** application record — either a fresh row, or a formally versioned one that references the rejected record by ID and preserves its complete `verification_reviews`/`audit_logs` trail. This remediation does not implement that flow; it only guarantees the rejected record itself can never be silently reopened. Building the actual reapplication mechanism (new-record creation, linking/versioning, what happens to old uploaded documents) is a Stage 2-adjacent product decision, out of scope here by the founder's own instruction.

## Suspension — how suspended owners and staff lose effective access

**Chosen model: Model A** (roles stay historical, effective access enforced via status). Why: `operator_staff.active` already existed in the schema for exactly this purpose; Model A requires touching fewer tables than re-granting/re-inserting `user_roles` rows on reinstatement (Model B); and it keeps `user_roles` meaning "has ever held this capability" rather than conflating it with "is currently entitled," which is the cleaner long-term invariant for an audit trail.

Mechanically: a database trigger (`trg_operator_businesses_status_sync`) — not application code — flips `operator_staff.active` to `false` the moment `application_status` enters `suspended`/`deactivated`/`rejected`, and back to `true` on `suspended → approved`. Because this is DB-level, it holds regardless of which code path changes the status, including a future one that doesn't go through `reviewOperatorApplication`. Staff (non-owner) RLS access to the business/staff/document tables depends on `operator_staff.active = true` via `is_business_member`, so access is cut immediately, not eventually. The owner's own read access is deliberately preserved (so they can see "you are suspended"), but their one operational write in Stage 1 — document upload/delete — is blocked by an explicit status condition on those two policies.

**Scope limit, stated plainly:** Stage 1 has no other operational endpoints yet (no cash requests, no matching). This fix establishes the enforcement pattern (status + active-membership gate); it does not yet gate functionality that doesn't exist. Any Stage 2 operational server function must extend the same pattern, not invent a new one.

**Reinstatement governance (founder decision, applied after the initial remediation pass):** `suspended → approved` is `super_admin`-only, via `reinstateOperator`, never via the general `reviewOperatorApplication` an `ops_admin` can call. Three additional guarantees, all enforced in the function before any write happens: a written reason is mandatory (minimum 10 characters — a floor against "ok"-style non-answers, not a strong content guarantee); the reinstating `super_admin` cannot be the business's own owner or any current/former `operator_staff` row on it (`isReinstatementActorEligible`, checked against a live read of both at call time); and reactivation is scoped to exactly the staff rows the *triggering suspension event* deactivated (`operator_staff.deactivated_by_suspension_at`), not every inactive row on the business — a cashier removed for unrelated reasons before the suspension stays removed after reinstatement, requiring a separate, explicit staff action to restore (no such action exists yet in Stage 1, which is correct: nothing should silently restore it).

## RLS helpers — execute permissions, security mode, safe search path

All three (`has_role`, `is_admin`, `is_business_member`) are `SECURITY DEFINER` with `SET search_path = public` — fixed at function-definition time, immune to a caller's session `search_path`, confirmed by reading migration 1 (unchanged by this remediation). `EXECUTE` is now granted to `authenticated` only (not `anon`, not `PUBLIC`) — the minimum needed for RLS policies to evaluate for real signed-in users, matching every policy's `TO authenticated` scoping. `handle_new_user` deliberately stays revoked from everyone (trigger-only, never meant to be callable directly).

## Audit integrity — who may create records and why they cannot be forged

Only `log_audit_event()` may write to `audit_logs` (direct `INSERT` is revoked for `authenticated`; `UPDATE`/`DELETE` were already ungranted). The function has no `actor_id` or `actor_role` parameter — there is no argument through which a caller could supply a false identity. `actor_id` comes from `auth.uid()` (the verified session); `actor_role` is independently re-derived from the caller's real `user_roles` rows inside the function body, not trusted from any TypeScript-side variable. `action` is validated against a simple dot-segment shape to reject garbage input while staying forward-compatible with new action names.

## Storage — how fresh environments get the required bucket and policies

`storage.buckets` rows for both buckets are now inserted by a committed migration (`070500`), with `ON CONFLICT (id) DO UPDATE` making it safe to run against either a brand-new project (creates them) or the existing live one (re-asserts config without touching stored objects). The `storage.objects` RLS policies scoping access by business/user folder prefix already existed correctly in the original migrations (3 and 4) and were not changed. Together, a `supabase db reset` on a fresh clone of this repository now produces both buckets, private, size/MIME-limited, with working access policies — with no manual dashboard step required.

---

## Tests

### Tests added

- `src/lib/__tests__/operator-application-state.test.ts` — 113 cases (bun:test), including 14 added for the founder governance decisions (`canReinstateFrom` × 9 statuses, `isReinstatementActorEligible` × 4 scenarios, rejected-is-terminal, updated reinstatement-not-reachable assertion).
- `supabase/tests/001_customer_kyc_lockdown.sql` through `007_operator_reinstatement_governance.sql`, plus `_helpers.sql` and `run_all.sql` — 7 SQL regression scripts + shared fixtures.

### Tests executed

`src/lib/__tests__/operator-application-state.test.ts` only, via `bun test`, in this environment.

### Tests passed

```
bun test v1.3.14
 113 pass
 0 fail
 128 expect() calls
Ran 113 tests across 1 file. [~40-220ms]
```

Every one of the 9 `operator_application_status` enum values checked against `applicantCanEdit` (the C-03 fix) and `canReinstateFrom` (the reinstatement-governance fix); the full 9×9 admin-transition matrix checked against an independently-declared expected-result table (not the source map echoed back at itself) for `isValidAdminTransition`, now confirming `suspended → approved` is unreachable through it and `rejected` has zero reachable transitions; `isReinstatementActorEligible` checked against owner/current-staff/former-staff/unrelated-actor scenarios.

### Tests not executable, and why

All 7 SQL scripts under `supabase/tests/`. **Reason:** this environment has no Supabase CLI and no Docker (`supabase --version` and `docker --version` both fail — checked directly, not assumed). These scripts require a live Postgres instance with the full migration set applied and role-impersonation (`SET LOCAL ROLE authenticated` + JWT-claim GUCs) to simulate different users, none of which is available here. **They are not simulated, described-as-passing, or otherwise represented as verified anywhere in this report or its commits — they are explicitly labeled not-executed everywhere they're mentioned.**

The `reinstateOperator` function's actor-eligibility and mandatory-reason checks are covered directly by executed tests only at the pure-logic level (`isReinstatementActorEligible`); the full function (DB reads of `operator_staff`, the service-role write, the audit/review-history inserts) is covered only by `007_operator_reinstatement_governance.sql` (not executed), for the same reason `createServerFn`-wrapped handlers weren't unit-tested elsewhere in this remediation — see the original report's note on this below.

I also did not attempt to unit-test the `createServerFn`-wrapped handlers (`reviewOperatorApplication`, `upsertOperatorApplication`, `reviewCustomerVerification`, `grantUserRole`, `submitCustomerVerification`) directly, because convincingly mocking TanStack Start's server-function runtime (request context, `requireSupabaseAuth`'s JWT verification via a real Supabase client) was judged higher-risk-of-a-misleading-test than valuable given the time available — a shallow mock could pass without proving anything real. The pure logic these handlers depend on (`applicantCanEdit`, `isValidAdminTransition`) is fully covered instead; the I/O plumbing around it is covered only by the (unexecuted) SQL scripts and by `bunx tsc --noEmit` passing.

### Manual verification still required

Before this can be treated as fully proven, someone with Supabase CLI/Docker access must:

1. `supabase start && supabase db reset`
2. `psql "$DB_URL" -f supabase/tests/run_all.sql` (or run each file individually per `supabase/tests/README.md`)
3. Confirm every script reports only `NOTICE: PASS - ...` lines and none raise `ERROR: FAIL - ...`
4. Separately, inspect the **live** Lovable Cloud project directly (I had no credentials to do this) to confirm: (a) whether H-01's EXECUTE revoke was actually causing errors in practice, (b) the live storage buckets' current public/private and size-limit settings before this migration applies, (c) whether any operator/customer records currently exist in `suspended`/`rejected`/`deactivated` states that the C-04 backfill needs to correct.

---

## Build status

| Command | Result |
|---|---|
| `bun install --frozen-lockfile` | ✅ Clean (446 installs across 577 packages, no changes on final re-check) |
| `bun run lint` | ⚠️ Non-zero exit, but genuine signal is clean — see below |
| `bun run typecheck` (`tsc --noEmit` + `tsc --noEmit -p tsconfig.test.json`) | ✅ Zero errors, both configs |
| `bun run build` | ✅ Succeeds (Cloudflare Workers/Nitro output, as before) |
| `bun audit` | 4 vulnerabilities (2 moderate, 2 low) — **identical to the pre-remediation baseline**, all transitive dev-tooling (`@babel/core`, `brace-expansion`, `esbuild`, `js-yaml`), none reachable from the runtime bundle, none introduced by `@types/bun` |
| Migration test (`supabase db reset`) | **Not run** — no Supabase CLI/Docker available; migrations were reviewed by hand for syntax and ordering, not executed |
| Security tests (SQL) | **Not run** — see Tests above |
| Security tests (bun:test) | ✅ 99/99 passing |

**Lint detail:** after adding `.gitattributes` (L-03 from the original assessment) and forcing a real working-tree re-checkout (`git reset --hard HEAD` once `.gitattributes` was committed — confirmed via `grep -c $'\r'` that on-disk files are genuinely LF now, not just staged-as-LF), `bun run lint` dropped from **9,086 problems to 172**. All 172 remaining problems are in files this remediation did not touch (`src/components/ds/*`, `src/components/ui/*`, `src/integrations/supabase/client*.ts`, `src/routes/*` outside what's listed below) — pre-existing Prettier formatting debt in the original Lovable-generated code, unrelated to CRLF and unrelated to this remediation's scope. **Every file this remediation created or modified is 100% lint-clean** (verified by scoped `eslint` runs against exactly those files): `src/lib/admin.functions.ts`, `src/lib/customer.functions.ts`, `src/lib/operators.functions.ts`, `src/lib/operator-application-state.ts`, `src/hooks/use-auth.ts`, `src/integrations/supabase/types.ts`, `src/lib/__tests__/operator-application-state.test.ts`. No broad ESLint-disable rule was used anywhere to achieve this. The 172 remaining problems are reported here, not silently fixed with a repo-wide `--fix` (which the task explicitly asked to avoid as an unnecessary mass diff) and not hidden.

**No new secrets were committed** — checked: no `.env` changes, no credentials in any new migration/test/doc file (SQL test fixtures use `crypt('test-password-not-real', gen_salt('bf'))`, an obviously-fake placeholder, never a real credential).

---

## Remaining findings (not addressed by this remediation)

From the original assessment, still open:

- **H-04** (High) — no server-side file-type/size re-validation beyond the new bucket-level limits from H-03. The bucket `file_size_limit`/`allowed_mime_types` added in this remediation *does* meaningfully narrow this (Storage now enforces real limits, not just an HTML `accept` hint), but full server-side content re-validation before persisting a path was out of this remediation's explicitly enumerated scope (4 Critical + 3 High only).
- **H-05** (High) — admin route protection (`admin.tsx`, `admin.operators.tsx`, `admin.operators.$id.tsx`) still gates in a post-render `useEffect` rather than `beforeLoad`. Not in this remediation's enumerated scope; RLS remains the actual backstop for the data these pages read.
- **M-01** through **M-05** (Medium) — unchanged: unreconciled upload paths, `operator_documents` staff-upload gap, `grantUserRole` target-existence reliance on FK error, "Stage 2" language visible in the admin/operator UI, homepage copy describing unbuilt features.
- **L-02, L-04** (Low) — unchanged: transitive dev-dependency vulnerabilities (unrelated to this remediation), signup email-enumeration signal.
- **L-01, L-03** — **closed**: L-01 was already remediated before this session (`.env` hygiene commit `f5b0954`); L-03 (CRLF lint noise) is closed by this remediation's `.gitattributes` commit.

None of these are silently omitted — this list is the complete set of everything from the original assessment not touched here.

---

## Founder decisions required

**Resolved since the initial draft of this report:**

- ~~Reinstatement authority~~ — **decided:** `super_admin` only, `ops_admin` may review/recommend but not restore access. Implemented via the dedicated `reinstateOperator` function (see C-04 above).
- ~~Rejected → under_review reconsideration~~ — **decided:** rejection is terminal, no reconsideration path. The initial remediation's `rejected: ["under_review"]` entry (explicitly flagged at the time as a judgment call, not a requirement) is removed. A future reapplication must create a new/versioned application record referencing the rejected one — not implemented in this remediation, by explicit instruction.

**Still open:**

- **RPC role-probing hardening (H-01 residual risk):** whether to invest in the schema-separation fix (moving `has_role`/`is_admin`/`is_business_member` out of the API-exposed schema) is a prioritization call, not something blocking Stage 2 on its own.
- **Live-project verification:** someone with actual Supabase dashboard/CLI access to the Lovable Cloud project needs to run the SQL test suite and confirm current bucket settings and any existing suspended/rejected records — this isn't a "decision" so much as a required action item, but it needs an owner.
- **Reapplication mechanism design:** now that rejection is confirmed terminal, the founder/product owner needs to decide the shape of the "new application record referencing the rejected one" flow (fresh row vs. formal versioning, what happens to previously uploaded documents, whether the rejected record's data can be pre-filled into the new one) — explicitly not designed or implemented here, flagged for whenever reapplication becomes a real product priority (Stage 2-adjacent, not Stage 2 itself).

---

## Stage 2 readiness

**Ready for Stage 2 with stated conditions.**

The trust boundary this remediation targeted — can the party being evaluated set their own verification/approval outcome — is now enforced at the database layer for every Critical finding, independent of any single frontend or server-function code path, and that enforcement is backed by 99 executed, passing tests for the state-machine logic specifically. That is a materially different and stronger position than the original assessment found.

**Conditions before Stage 2 work actually begins:**

1. **Run the 6 SQL test scripts** against a real Supabase instance (`supabase start && supabase db reset`, then `supabase/tests/run_all.sql`) and confirm all pass. This remediation's RLS/trigger/storage claims are well-reasoned from reading the SQL directly, but "well-reasoned" is not "proven" — and Stage 2 is exactly the point at which these mechanisms need to be load-bearing for real.
2. **Verify against the live Lovable Cloud project specifically**, not just a fresh local instance — confirm current bucket configuration, confirm whether any accounts are currently in a suspended/rejected state that the backfill needs to correct (including whether any `operator_staff` rows need the new `deactivated_by_suspension_at` backfill to reflect reality), and confirm the H-01 EXECUTE grant was in fact causing the predicted failures (or wasn't — either way, closing the uncertainty).

~~3. Resolve the founder decisions above~~ — **done**: reinstatement authority (`super_admin`-only, dedicated function) and rejection terminality are both decided and implemented as of this report's latest revision.

Both remaining conditions are verification steps, not further code changes. If they come back clean (tests pass, live project matches expectations), this codebase's identity/verification layer is a sound foundation for Stage 2 to build on.

---

## Git summary

- **Branch:** `claude/initial-technical-assessment`
- **Working-tree status:** clean
- **Commits (this remediation, oldest to newest):**

| SHA | Message |
|---|---|
| `7619ece` | docs: add stage 1 security remediation plan |
| `6e513e3` | security: make audit logs append-only and trusted |
| `d3158d5` | security: protect customer verification state |
| `6460573` | security: enforce operator application state transitions |
| `44710e0` | security: block suspended operator access |
| `e259be5` | security: harden role assignment and rls helpers |
| `665f09b` | db: provision private operator document storage |
| `fe32fcd` | test: add stage 1 access-control regression coverage |
| `7db4bcb` | chore: normalise repository line endings |
| `5d49b46` | chore: fix lint/typecheck tooling for the new test suite |
| `78155cc` | docs: add stage 1 remediation report (initial draft) |
| *(pending)* | security: apply founder governance decisions on reinstatement and rejection — commit made immediately after this report update; see the branch log for its final SHA |

- **Migrations added:** 7 (`20260718070000` through `20260718080000`, see Database changes above)
- **Files changed (non-doc):** `.gitattributes` (new), `tsconfig.json`, `tsconfig.test.json` (new), `package.json`, `src/hooks/use-auth.ts`, `src/integrations/supabase/types.ts`, `src/lib/admin.functions.ts`, `src/lib/customer.functions.ts`, `src/lib/operators.functions.ts`, `src/lib/operator-application-state.ts` (new), `src/lib/__tests__/operator-application-state.test.ts` (new), `supabase/migrations/*` (7 new), `supabase/tests/*` (11 new files), `bun.lock`
- **Not pushed, not merged**, per instructions.
