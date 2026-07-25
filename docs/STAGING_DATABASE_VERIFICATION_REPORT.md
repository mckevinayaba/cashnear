# Staging Database Verification Report

Phase 1 (staging database verification) of the two-phase authorization for this work. This report covers only what was actually executed against a real, dedicated, non-production Supabase project — nothing here is inferred or assumed to have passed.

---

## Staging project

- **Redacted reference:** `eraj****qf` (full ref confirmed distinct from the production reference `cfwylchvtfwtqhfwoefm` at every step — see Pre-flight below)
- **Project name (from linked-project metadata):** `cashnear-staging`
- Connected via the Supabase CLI (`bunx supabase`, v2.109.1) and a direct Postgres client (`postgres` npm package), using the **session pooler** endpoint — the direct `db.<ref>.supabase.co` host resolves IPv6-only and this network has no outbound IPv6 (`LegacyDbConfigIpv6Error`); the pooler endpoint is IPv4-compatible and was used for every subsequent step.

## Pre-flight safety results

| Check | Result |
|---|---|
| `.env.staging.local` exists at repo root | ✅ Confirmed |
| Git-ignored, not tracked | ✅ Confirmed (`git check-ignore -v` matches `.gitignore:25:.env.*`; absent from `git status`/`git ls-files`) |
| Working tree clean before connecting | ✅ Confirmed |
| `STAGING_PROJECT_REF` ≠ production ref (`cfwylchvtfwtqhfwoefm`) | ✅ Pass — redacted staging ref `eraj****qf` vs. redacted production `cfwy****fm` |
| Ref embedded in `STAGING_DB_URL` matches `STAGING_PROJECT_REF` | ✅ Pass |
| Ref embedded in `STAGING_DB_URL_POOLER` matches `STAGING_PROJECT_REF` | ✅ Pass |
| Connection target does not resolve to production | ✅ Pass |
| Secrets never printed | ✅ Only lengths and redacted (first-4/last-2) fragments were ever printed for any credential-bearing value, throughout this entire phase |

**One notable incident during pre-flight, disclosed rather than omitted:** partway through setup, the Supabase CLI's own `LegacyDbConfigIpv6Error` message included a `"suggestion"` field referencing the **production** ref (`cfwylchvtfwtqhfwoefm`). This was investigated immediately and confirmed to be the CLI echoing this repo's committed `supabase/config.toml` (`project_id = "cfwylchvtfwtqhfwoefm"`, left over from the original Lovable Cloud setup) into a generic troubleshooting template — not a sign that anything had contacted production. Verified directly via `supabase/.temp/linked-project.json`, which confirmed the CLI was correctly linked to `eraj****qf` / `cashnear-staging` throughout. No production project was linked, queried, or modified at any point.

**Separately, and worth recording here plainly:** real credentials (a Supabase access token, and the staging database password) were pasted directly into the chat conversation by the user multiple times during setup, unprompted. These were never echoed back in any response and were written only to the local, git-ignored `.env.staging.local`. The user was advised, more than once, to rotate the access token and reset the database password after this session — that recommendation stands and is repeated here for the record.

## Migrations applied

All 12 migrations (11 from the remediation branch + 1 new one produced during this verification, see Defects below) applied cleanly via `supabase db push --db-url <pooler, percent-encoded>`, and independently confirmed via `supabase migration list --db-url ...` showing `local` and `remote` timestamps matching for every entry:

| # | Migration | Status |
|---|---|---|
| 1 | `20260718061518_...` (original Stage 1 schema) | ✅ Applied |
| 2 | `20260718061532_...` (helper EXECUTE revoke — the bug H-01 fixes) | ✅ Applied |
| 3 | `20260718061546_...` (operator-documents storage policies) | ✅ Applied |
| 4 | `20260718064316_...` (customer KYC columns + customer-documents policies) | ✅ Applied |
| 5 | `20260718070000_...` (C-01 column lockdown) | ✅ Applied |
| 6 | `20260718070100_...` (C-02 column lockdown) | ✅ Applied |
| 7 | `20260718070200_...` (C-04 suspension trigger) | ✅ Applied |
| 8 | `20260718070300_...` (H-01 EXECUTE re-grant) | ✅ Applied |
| 9 | `20260718070400_...` (H-02 audit lockdown) | ✅ Applied |
| 10 | `20260718070500_...` (H-03 storage buckets) | ✅ Applied |
| 11 | `20260718080000_...` (reinstatement governance) | ✅ Applied |
| 12 | `20260718090000_...` (**new** — `pilot_configuration` grant gap, found during this verification) | ✅ Applied |

Harmless `NOTICE` output during the first push (`trigger "..." does not exist, skipping`, `policy "..." does not exist, skipping`) came from `DROP ... IF EXISTS` idempotency guards correctly no-op'ing on first creation — not errors.

## Database object verification (empirical, via direct SQL against staging)

- **Tables (9):** `audit_logs, customer_profiles, operator_businesses, operator_documents, operator_staff, pilot_configuration, profiles, user_roles, verification_reviews` — matches expected schema exactly.
- **Enums (6):** `app_role, document_type, operator_application_status, sa_province, terminal_provider, verification_status` — all values confirmed matching the migrations.
- **RLS enabled:** all 9 tables show `relrowsecurity = true`. None forced (`relforcerowsecurity = false`), which is expected — forcing RLS on the table owner isn't part of this design and wasn't required by any finding.
- **Policies:** 26 policies across `public` + `storage.objects`, names and commands matching what the migrations define (full list captured in the raw session output; e.g. `"Customer updates own record" [UPDATE]`, `"Owner or staff reads business" [SELECT]`, `"Admins read audit logs" [SELECT]` — no unexpected extra or missing policy).
- **Functions:** `has_role`, `is_admin`, `is_business_member`, `log_audit_event`, `sync_operator_staff_on_status_change`, `handle_new_user` all `SECURITY DEFINER = true` with `search_path=public` fixed. `update_updated_at_column` is `SECURITY DEFINER = false`, correct (it doesn't need elevated privilege).
- **EXECUTE grants (H-01, the exact thing this finding was about):**
  - `has_role`, `is_admin`, `is_business_member`, `log_audit_event` → `authenticated` EXECUTE = **true**
  - `handle_new_user` → `authenticated` EXECUTE = **false** (correct — trigger-only, never meant to be directly callable)
- **Triggers (6, all enabled):** `auth.users :: on_auth_user_created`, `customer_profiles :: trg_customer_profiles_updated_at`, `operator_businesses :: trg_operator_businesses_status_sync` (the C-04 trigger), `operator_businesses :: trg_operator_businesses_updated_at`, `pilot_configuration :: trg_pilot_configuration_updated_at`, `profiles :: trg_profiles_updated_at`. (An earlier query using `regclass::text` incorrectly showed zero triggers — a query bug on my part, not a real gap; `regclass::text` omits the schema prefix for anything on the search path, breaking a `LIKE 'public.%'` filter. Corrected query, confirmed by a second, schema-qualified-join version.)
- **`audit_logs` table-level grants for `authenticated`:** `REFERENCES, SELECT, TRIGGER, TRUNCATE` — **no INSERT, UPDATE, or DELETE**, confirming H-02's append-only lockdown holds at the grant layer, independent of RLS.
- **Column-level grants (C-01/C-02, the exact mechanism these findings rely on):**
  - `customer_profiles`: only `notes`, `saved_suburb` grantable to `authenticated` — every privileged column (`verification_status`, `reviewed_by`, `reviewed_at`, `review_notes`, identity fields) correctly absent.
  - `operator_businesses`: exactly the 26 applicant-editable business/location/terminal/representative columns — `application_status`, `submitted_at`, `reviewed_at`, `reviewed_by`, `review_notes` correctly absent.
- **`operator_staff.deactivated_by_suspension_at`:** present, `timestamp with time zone` — confirms the governance-decision migration applied correctly.

## Storage verification

| Bucket | Public | Size limit | Allowed MIME types |
|---|---|---|---|
| `operator-documents` | `false` | 10485760 (10 MiB) | `image/jpeg, image/png, image/webp, application/pdf` |
| `customer-documents` | `false` | 10485760 (10 MiB) | `image/jpeg, image/png, image/webp, application/pdf` |

Both buckets private with correct limits — matches H-03 exactly. 6 `storage.objects` policies present and correctly named/scoped (3 per bucket: upload/read/delete or update, matching each bucket's intended access model).

## Script-by-script results (all 7, executed against staging)

**First pass — 3 of 7 failed. Full diagnosis and remediation below, then a complete rerun of all 7, not just the failing ones.**

| Script | First-pass result | Final result | Root cause if failed |
|---|---|---|---|
| `001_customer_kyc_lockdown.sql` | FAIL (1 assertion) | **PASS (6 assertions)** | Test-script bug — see below |
| `002_operator_application_lockdown.sql` | PASS (5) | **PASS (5)** | — |
| `003_operator_suspension.sql` | PASS (7) | **PASS (7)** | — |
| `004_rls_helper_execute.sql` | FAIL (1 assertion) | **PASS (4 assertions)** | Pre-existing grant gap — see below |
| `005_audit_log_integrity.sql` | FAIL (1 assertion, script aborted before checks 4-5 ran) | **PASS (6 assertions)** | Same test-script bug as 001 |
| `006_storage_provisioning.sql` | PASS (5) | **PASS (5)** | — |
| `007_operator_reinstatement_governance.sql` | PASS (5) | **PASS (5)** | — |

**Total: 38/38 assertions passing on the final run. 0 FAIL, 0 ERROR.**

### Defects found, and what they actually were

Before fixing anything, each failure was diagnosed directly against staging (not assumed) using isolated, targeted diagnostic queries — full trace below.

**1. Execution-tooling bug (mine, not the SQL scripts): all 7 scripts initially errored with `syntax error at or near "$"`.**
Root cause: my JS-based fallback SQL runner (necessary because this environment has no `psql`/Docker — see `docs/SUPABASE_SECURITY_TESTING.md`) inlines `_helpers.sql` via `String.replace(pattern, helpers)`. JavaScript's `.replace()` treats `$$` in a *string* replacement argument as a special escape token (collapsing it to a literal single `$`) — and `_helpers.sql` is full of `$$` dollar-quoting. Every occurrence was silently corrupted during inlining. Fixed by switching to a function-based replacer (`.replace(pattern, () => helpers)`), which is not subject to this interpretation. **This was a bug in ad-hoc tooling built for this session, not in the committed SQL test scripts, which were independently confirmed correct by inspecting the actual files on disk.**

**2. `004_rls_helper_execute.sql`: "has_role() EXECUTE is still missing for authenticated" — false alarm, real but unrelated pre-existing gap found.**
Diagnosis: direct query confirmed `has_role` EXECUTE **is** granted to `authenticated` (H-01 is genuinely fixed). The test's failing assertion was a super_admin `UPDATE` on `pilot_configuration`, which failed with `insufficient_privilege` for a different reason: the **original Stage 1 migration** (`20260718061518...`, not part of this remediation) granted only `SELECT` on `pilot_configuration` to `authenticated`, even though its own RLS policy (`"Super admin writes pilot config"`) is declared `FOR ALL`. Table-level grants are checked before RLS ever evaluates, so that policy's write path was **unreachable for anyone via the client, including a genuine super_admin** — an under-permissive gap (nothing could go wrong from it being exploited; if anything, it silently blocked legitimate use), not a security regression. Fixed via new forward-only migration `20260718090000_pilot_configuration_grant_gap.sql`, granting `INSERT, UPDATE, DELETE` to `authenticated` (matching what the existing policy already gates — no policy change).

**3. `001`/`005`: "log_audit_event did not write the expected row" — test-script bug, not a security issue.**
Diagnosis: a purpose-built diagnostic confirmed `log_audit_event()` inserts the correctly-attributed row every time (traced the exact returned row: `actor_id`/`entity_id` matched the calling customer precisely). The test scripts' own verification step then tried to **read back** `audit_logs` while still impersonating the same non-admin customer that had just written to it — and `audit_logs` SELECT is correctly restricted to admins only (`"Admins read audit logs"` policy, `is_admin(auth.uid())`). The test's own read was blocked by the exact control it was trying to confirm. This is proof H-02's read restriction works, not evidence against it. Fixed by having both scripts switch to `service_role` before the verification read (matching the pattern the scripts already use elsewhere for their own "admin path" checks) — no security control was touched or weakened.

None of these three findings required weakening any RLS policy, grant, or function. Two were fixed with test-script corrections (committed as regression-test changes); one was fixed with a new, narrowly-scoped, additive migration.

## TypeScript / build results (rerun after the fixes above)

| Command | Result |
|---|---|
| `bun test` | ✅ 113/113 passing |
| `bun run typecheck` (both configs) | ✅ Zero errors |
| `bun run build` | ✅ Succeeds (Cloudflare Workers/Nitro output) |
| `bun run lint` (full repo, to confirm no regression) | 172 problems, **unchanged from the pre-existing baseline** — every file touched this phase was `.sql`/`.gitignore`, which ESLint doesn't process; no new lint issues |

## Working tree

Confirmed clean of secrets and generated files: `.env.staging.local` remains untracked/ignored throughout (never appeared in `git status`); the build's `src/routeTree.gen.ts` regeneration was reverted after each build run, same as in prior sessions. The only real changes on disk: `.gitignore` (added `supabase/.temp/`, the CLI's local link-state cache — no secrets in it, confirmed), two SQL test-script fixes, and one new migration.

## What is now empirically proven

- C-01, C-02 column-level lockdowns exist exactly as designed, on a real database, confirmed via direct grant inspection — not just read from the migration source.
- C-04's suspension trigger fires correctly: staff access is cut immediately on suspend, restored correctly (and *only* for staff the suspension itself deactivated) on reinstatement, confirmed via an actual suspend → check → reinstate → check cycle against staging.
- H-01's EXECUTE grants are correct on a real project, and the non-owner RLS paths that depend on them (staff reads, admin reads) work without permission errors.
- H-02's audit log is genuinely append-only (no INSERT/UPDATE/DELETE grant for `authenticated`) and `log_audit_event()` correctly self-attributes the real caller — proven by tracing the actual returned row, not assumed from reading the function body.
- H-03's storage buckets exist, are private, and carry the intended size/MIME limits purely from replaying committed migrations — reproducibility is real, not theoretical.
- The founder governance decisions (reinstatement targeting, rejection terminality) hold at the database layer under real suspend/reinstate cycles and real cross-status write attempts.

## What remains assumed or untested

- **The live Lovable Cloud production project itself was never touched, queried, or verified** — by design, per explicit instruction. Whether production's actual current state (existing suspended/rejected records, current bucket settings, whether the original H-01 bug was actually causing production errors) matches what this staging run demonstrates is still unconfirmed. `docs/SUPABASE_SECURITY_TESTING.md` §12 covers that as a separate, deliberate, read-only-first procedure.
- Admin UI for `reviewCustomerVerification` and `reinstateOperator` still doesn't exist (confirmed in an earlier session — no route calls either function). Nothing in this phase changes that; it's explicitly Phase 2, not started.
- H-04 (server-side file/MIME re-validation beyond bucket-level limits) and H-05 (admin route guards using `useEffect` instead of `beforeLoad`) remain open, as previously documented — out of this verification's scope.
- The two access-token/password values pasted into chat during setup should be treated as compromised regardless of this report's outcome, and rotated.

## Merge-readiness recommendation

**Ready for Stage 1 Completion Sprint.**

Every one of the 4 Critical and 3 High findings from the original assessment, plus both founder governance decisions, is now proven — not just reasoned about — against a real, dedicated staging Supabase project: correct migrations, correct RLS/grants/triggers/functions, correct storage configuration, and all 7 purpose-built security regression scripts passing. The one genuine defect this verification surfaced (`pilot_configuration`'s missing grant) was pre-existing, unrelated to this remediation, under-permissive rather than a vulnerability, and is now fixed with a clean forward-only migration. TypeScript tests, typecheck, and build are all clean.

This is not a Stage 2 readiness verdict — that still requires live-project verification (§12 of the testing guide) and the founder/legal decisions listed in the remediation report. It is a verdict on this branch's own database layer: it is sound, proven, and ready to move into whatever CashNear defines as the "Stage 1 Completion Sprint" — which, per this engagement's own scoping, is Phase 2 (admin UI for the two review functions), pending your explicit authorization.
