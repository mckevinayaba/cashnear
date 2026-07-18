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

99 executed `bun test` cases prove the state-machine logic exhaustively. Six SQL regression scripts prove the RLS/trigger/audit/storage behavior — **written but not executed in this session**, because no Supabase CLI or Docker is available in this environment (verified absent). This is stated plainly, not glossed over — see §Tests below for exactly what that means for confidence level.

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
- **Fix implemented:** **Model A** (roles stay historical; effective access enforced via `operator_staff.active` + `application_status`) — see rationale below. `trg_operator_businesses_status_sync` trigger deactivates staff on `suspended`/`deactivated`/`rejected`, reactivates on `suspended → approved`. One-time backfill for any business already in one of those states. `operator_documents` INSERT/DELETE policies gained a `NOT IN ('suspended','deactivated')` condition on the owning business.
- **Files/migrations:** `supabase/migrations/20260718070200_operator_suspension_enforcement.sql`.
- **Test added:** `supabase/tests/003_operator_suspension.sql` (not executed); admin-transition-matrix tests in `operator-application-state.test.ts` (executed) prove `suspended → approved` is admin-reachable and everything else from `suspended` is not except `deactivated`.
- **Test result:** state-machine portion executed and passing; the trigger/RLS portion is not executed (SQL script only).
- **Remaining risk:** **medium, pending SQL execution.** The trigger logic is straightforward (single `UPDATE ... WHERE business_id = NEW.id`) and was read back carefully, but a trigger is exactly the kind of thing that should be proven to actually fire before being trusted — this is the single highest-priority item to run once local Supabase tooling is available.

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

**New migrations (6, in application order):**

| File | Purpose |
|---|---|
| `20260718070000_customer_profile_column_privileges.sql` | C-01: column-level UPDATE lockdown on `customer_profiles` |
| `20260718070100_operator_business_column_privileges.sql` | C-02: column-level UPDATE lockdown on `operator_businesses` |
| `20260718070200_operator_suspension_enforcement.sql` | C-04: staff-active sync trigger, backfill, document-policy status gate |
| `20260718070300_rls_helper_execute_grants.sql` | H-01: re-grant EXECUTE on the three RLS helper functions |
| `20260718070400_audit_log_lockdown.sql` | H-02: revoke direct INSERT, add `log_audit_event()` |
| `20260718070500_storage_bucket_provisioning.sql` | H-03: create both storage buckets with limits |

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

## Suspension — how suspended owners and staff lose effective access

**Chosen model: Model A** (roles stay historical, effective access enforced via status). Why: `operator_staff.active` already existed in the schema for exactly this purpose; Model A requires touching fewer tables than re-granting/re-inserting `user_roles` rows on reinstatement (Model B); and it keeps `user_roles` meaning "has ever held this capability" rather than conflating it with "is currently entitled," which is the cleaner long-term invariant for an audit trail.

Mechanically: a database trigger (`trg_operator_businesses_status_sync`) — not application code — flips `operator_staff.active` to `false` the moment `application_status` enters `suspended`/`deactivated`/`rejected`, and back to `true` on `suspended → approved`. Because this is DB-level, it holds regardless of which code path changes the status, including a future one that doesn't go through `reviewOperatorApplication`. Staff (non-owner) RLS access to the business/staff/document tables depends on `operator_staff.active = true` via `is_business_member`, so access is cut immediately, not eventually. The owner's own read access is deliberately preserved (so they can see "you are suspended"), but their one operational write in Stage 1 — document upload/delete — is blocked by an explicit status condition on those two policies.

**Scope limit, stated plainly:** Stage 1 has no other operational endpoints yet (no cash requests, no matching). This fix establishes the enforcement pattern (status + active-membership gate); it does not yet gate functionality that doesn't exist. Any Stage 2 operational server function must extend the same pattern, not invent a new one.

## RLS helpers — execute permissions, security mode, safe search path

All three (`has_role`, `is_admin`, `is_business_member`) are `SECURITY DEFINER` with `SET search_path = public` — fixed at function-definition time, immune to a caller's session `search_path`, confirmed by reading migration 1 (unchanged by this remediation). `EXECUTE` is now granted to `authenticated` only (not `anon`, not `PUBLIC`) — the minimum needed for RLS policies to evaluate for real signed-in users, matching every policy's `TO authenticated` scoping. `handle_new_user` deliberately stays revoked from everyone (trigger-only, never meant to be callable directly).

## Audit integrity — who may create records and why they cannot be forged

Only `log_audit_event()` may write to `audit_logs` (direct `INSERT` is revoked for `authenticated`; `UPDATE`/`DELETE` were already ungranted). The function has no `actor_id` or `actor_role` parameter — there is no argument through which a caller could supply a false identity. `actor_id` comes from `auth.uid()` (the verified session); `actor_role` is independently re-derived from the caller's real `user_roles` rows inside the function body, not trusted from any TypeScript-side variable. `action` is validated against a simple dot-segment shape to reject garbage input while staying forward-compatible with new action names.

## Storage — how fresh environments get the required bucket and policies

`storage.buckets` rows for both buckets are now inserted by a committed migration (`070500`), with `ON CONFLICT (id) DO UPDATE` making it safe to run against either a brand-new project (creates them) or the existing live one (re-asserts config without touching stored objects). The `storage.objects` RLS policies scoping access by business/user folder prefix already existed correctly in the original migrations (3 and 4) and were not changed. Together, a `supabase db reset` on a fresh clone of this repository now produces both buckets, private, size/MIME-limited, with working access policies — with no manual dashboard step required.

---

## Tests

### Tests added

- `src/lib/__tests__/operator-application-state.test.ts` — 99 cases (bun:test).
- `supabase/tests/001_customer_kyc_lockdown.sql` through `006_storage_provisioning.sql`, plus `_helpers.sql` and `run_all.sql` — 6 SQL regression scripts + shared fixtures.

### Tests executed

`src/lib/__tests__/operator-application-state.test.ts` only, via `bun test`, in this environment.

### Tests passed

```
bun test v1.3.14
 99 pass
 0 fail
 105 expect() calls
Ran 99 tests across 1 file. [~40-55ms]
```

Every one of the 9 `operator_application_status` enum values checked against `applicantCanEdit` (the C-03 fix), and the full 9×9 admin-transition matrix checked against an independently-declared expected-result table (not the source map echoed back at itself) for `isValidAdminTransition` (the C-04/admin-transition-validity fix).

### Tests not executable, and why

All 6 SQL scripts under `supabase/tests/`. **Reason:** this environment has no Supabase CLI and no Docker (`supabase --version` and `docker --version` both fail — checked directly, not assumed). These scripts require a live Postgres instance with the full migration set applied and role-impersonation (`SET LOCAL ROLE authenticated` + JWT-claim GUCs) to simulate different users, none of which is available here. **They are not simulated, described-as-passing, or otherwise represented as verified anywhere in this report or its commits — they are explicitly labeled not-executed everywhere they're mentioned.**

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

Only genuine product/governance calls, not implementation details:

- **Reinstatement authority:** this remediation implements `suspended → approved` as reachable by any `ops_admin`/`super_admin` (same authority as other review decisions). If reinstatement should require a higher bar (e.g., `super_admin` only, or a second approver), that's a governance decision not implemented here — the current code treats it identically to any other review transition.
- **Rejected → under_review reconsideration:** this remediation's admin transition map allows an admin to move a `rejected` application back to `under_review` (a reasonable "reconsider" path, my own judgment call documented in the remediation plan). If rejection should be terminal instead, that's worth an explicit product decision.
- **RPC role-probing hardening (H-01 residual risk):** whether to invest in the schema-separation fix (moving `has_role`/`is_admin`/`is_business_member` out of the API-exposed schema) is a prioritization call, not something blocking Stage 2 on its own.
- **Live-project verification:** someone with actual Supabase dashboard/CLI access to the Lovable Cloud project needs to run the SQL test suite and confirm current bucket settings and any existing suspended/rejected records — this isn't a "decision" so much as a required action item, but it needs an owner.

---

## Stage 2 readiness

**Ready for Stage 2 with stated conditions.**

The trust boundary this remediation targeted — can the party being evaluated set their own verification/approval outcome — is now enforced at the database layer for every Critical finding, independent of any single frontend or server-function code path, and that enforcement is backed by 99 executed, passing tests for the state-machine logic specifically. That is a materially different and stronger position than the original assessment found.

**Conditions before Stage 2 work actually begins:**

1. **Run the 6 SQL test scripts** against a real Supabase instance (`supabase start && supabase db reset`, then `supabase/tests/run_all.sql`) and confirm all pass. This remediation's RLS/trigger/storage claims are well-reasoned from reading the SQL directly, but "well-reasoned" is not "proven" — and Stage 2 is exactly the point at which these mechanisms need to be load-bearing for real.
2. **Verify against the live Lovable Cloud project specifically**, not just a fresh local instance — confirm current bucket configuration, confirm whether any accounts are currently in a suspended/rejected state that the backfill needs to correct, and confirm the H-01 EXECUTE grant was in fact causing the predicted failures (or wasn't — either way, closing the uncertainty).
3. Resolve the founder decisions above (reinstatement authority, rejection terminality) before Stage 2 builds anything that assumes a specific answer.

None of these three conditions require further code changes to this remediation — they're verification and decision steps. If all three come back clean (tests pass, live project matches expectations, decisions made), this codebase's identity/verification layer is a sound foundation for Stage 2 to build on.

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

- **Migrations added:** 6 (`20260718070000` through `20260718070500`, see Database changes above)
- **Files changed (non-doc):** `.gitattributes` (new), `tsconfig.json`, `tsconfig.test.json` (new), `package.json`, `src/hooks/use-auth.ts`, `src/integrations/supabase/types.ts`, `src/lib/admin.functions.ts`, `src/lib/customer.functions.ts`, `src/lib/operators.functions.ts`, `src/lib/operator-application-state.ts` (new), `src/lib/__tests__/operator-application-state.test.ts` (new), `supabase/migrations/*` (6 new), `supabase/tests/*` (9 new files), `bun.lock`
- **Not pushed, not merged**, per instructions.
