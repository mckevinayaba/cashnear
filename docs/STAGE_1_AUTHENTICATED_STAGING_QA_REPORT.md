# Stage 1 Authenticated Staging QA Report

Authenticated founder QA of the admin UI built in the Stage 1 Completion Sprint (`docs/STAGE_1_COMPLETION_SPRINT_REPORT.md`), against the dedicated staging Supabase project only. This closes the one gap that report flagged explicitly: "Full authenticated manual QA... needs an actual admin session."

**Scope discipline honored throughout:** staging only, no production access, no commit/push/merge/Lovable sync, no Stage 2 work. Two real regressions were found and fixed because they made the sprint's own routes completely unusable — fixing them was required to perform the QA at all, not a scope expansion.

---

## 1. Staging environment confirmation

- Active project confirmed as `erajwyiljmyvuvmvwiqf` (staging) at every step via automated pre-flight checks that abort on any match against the production ref `cfwylchvtfwtqhfwoefm`. Production was never queried, written to, or otherwise touched at any point this session.
- Local app pointed at staging via `.env.local` (Vite's higher-precedence override), which does **not** modify the tracked `.env` (still pointed at production, untouched, as it was for the prior sprint's dev work).
- `.env.local` and `.env.staging.local` both confirmed git-ignored and untracked (`git check-ignore -q` passed, `git status --short` shows neither file) before and after this session's changes.
- `.claude/launch.json` dev server config unchanged; confirmed (again) that the actual dev server binds port 8080, not the `3000` in that file — a pre-existing cosmetic mismatch, not something this session introduced or needed to fix to proceed.
- No secret value (DB password, access token, anon key, service-role key, session token, or the synthetic test passwords) was ever printed in a committed file, this report, or a durable log. Where a value had to pass through an operational tool call to be used (the Admin API calls, the Postgres connection), it was never echoed back and is not reproduced here.

## 2. Test users used

No staging admin account existed at the start of this session — the database held exactly one plain-`customer`-role user before Phase 3. Three synthetic accounts were created via the Supabase Auth Admin API (an authorized server-side path, using the project's own access token) and are the accounts this QA was performed with:

| Role | Email (synthetic, `@cashnear-staging.test`) | Purpose |
|---|---|---|
| `super_admin` | `qa-superadmin-ms10p3rs@...` | Full workflow verification, including reinstatement |
| `ops_admin` | `qa-opsadmin-ms10p3rs@...` | General admin access + reinstatement-block verification |
| `customer` (no admin role) | `qa-customer-ms10p3rs@...` | Non-admin access-denied verification |

Passwords were randomly generated, never hardcoded or committed anywhere, and used only via two mechanisms: (1) a one-time Supabase magic link consumed server-side via `curl` for the first login attempt, which was abandoned after Claude Code's own safety classifier correctly blocked passing the resulting session token through a browser-automation tool call; (2) at your explicit instruction, a synthetic password set via the Admin API and relayed to you directly in chat for you to type into the login form yourself — never autofilled, never logged, never written to any file.

## 3. Synthetic staging test data created

All seeded via direct Postgres access (staging session pooler) and the Storage REST API, gated by the same production-ref abort checks used throughout this engagement:

- **Operators**: 3 businesses, each with a dedicated synthetic owner account and an `operator_staff` row — one `submitted` (pending review), one `approved`, one exercised through a real `approved → suspended` transition (so the C-04 staff-deactivation trigger fired exactly as it would in production) to serve as the reinstatement candidate. Each has 2 real uploaded documents (a PNG and a PDF) in the private `operator-documents` bucket at the `{business_id}/{doc_type}/...` path convention.
- **Customers**: 2 synthetic accounts with `customer_profiles` set to `pending`, full KYC fields populated, and a real ID + selfie image uploaded to the private `customer-documents` bucket per user.
- **Audit history**: seed-time rows plus everything generated live during the walkthrough (approvals, rejections, suspension, reinstatement) — see the full trail in the Audit findings below.
- One pre-existing residual user (`diag@example.test`, plain `customer` role) was found in the customer list during testing. It predates this session's seeding and was not created or modified by this QA; it's flagged here for your awareness, not treated as something to clean up under this engagement's scope.

## 4. Route-by-route and workflow-by-workflow results

### 4.1 Critical finding: nested admin routes did not render (fixed)

**What broke:** `/admin/customers`, `/admin/operators`, `/admin/audit`, and `/admin/operators/:id` all updated the browser URL and page `<title>` correctly, ran their `beforeLoad` guards correctly, but **visually kept rendering the parent route's content underneath** — the customer queue, operator queue, audit log, and operator detail page were completely unreachable through the UI. This was invisible to the Stage 1 Completion Sprint's own manual verification because that sprint had no admin session to test with (documented explicitly in its own report) and only checked unauthenticated redirects, which aren't affected by this bug.

**Root cause:** TanStack Router's dot-file convention (`admin.customers.tsx`, `admin.operators.$id.tsx`, etc.) makes `admin.tsx` the parent layout of its sibling files, and `admin.operators.tsx` the parent of `admin.operators.$id.tsx`. A parent route's component must render `<Outlet />` for a child route's component to ever appear — `admin.tsx` and `admin.operators.tsx` both rendered full page content with no `Outlet`, so child routes were structurally unreachable regardless of auth, data, or guard correctness.

**Fix applied:** Split both routes into a pure layout (`component: () => <Outlet />`, guard preserved) plus a new index route holding the original page content — `admin.index.tsx` (dashboard) and `admin.operators.index.tsx` (queue list), mirroring the existing `_authenticated/route.tsx` layout pattern already used elsewhere in this codebase. No behavior, data-fetching, or authorization logic was changed — only where the same JSX lives. Verified fixed via direct `window.location.href`/`document.body.innerText` inspection (bypassing any tool-side caching) after the route tree auto-regenerated.

**Regression coverage added:** `src/lib/__tests__/admin-layout-routes.test.ts` — a structural test (same pattern as the existing `document-access.test.ts`) asserting both layout files contain `Outlet` and that the actual page content lives in the index files, not the layouts.

### 4.2 Second finding: signed document URLs failed with a missing-env-var error (fixed, local-only)

Clicking "View ID document" returned `Missing Supabase environment variable(s): SUPABASE_SERVICE_ROLE_KEY` — the local dev server's `.env.local` had the anon key (for the client bundle) but never the service-role key, since it was deliberately never written to a file earlier in this engagement to minimize exposure. Every admin mutation (`reviewOperatorApplication`, `reinstateOperator`, `reviewCustomerVerification`, `getSignedDocumentUrl`) dynamically imports the service-role client, so this blocked all of Phase 4, not just document viewing.

**Fix:** fetched the staging service-role key via the Management API (value never printed) and appended it to the already-git-ignored, already-untracked `.env.local`, then restarted the dev server so `process.env` picked it up. Verified `.env.local` remained git-ignored and untracked after the change. This is a local development environment file only — no code changed, nothing was committed.

### 4.3 Access control

| Scenario | Expected | Result |
|---|---|---|
| Unauthenticated → `/admin` | Redirect to `/auth` | ✅ Confirmed via `window.location.href` |
| Authenticated non-admin (`customer` role only) → `/admin` | Redirect to `/access-denied` | ✅ Confirmed, correct "Restricted" copy rendered |
| Authenticated non-admin → deep-linked `/admin/operators/:id` | Redirect to `/access-denied` | ✅ Confirmed — nested routes are independently guarded, not just the parent |
| `ops_admin` → `/admin`, `/admin/customers`, `/admin/operators` | Full access | ✅ Confirmed, labeled "Admin" (not "Super admin") |
| `ops_admin` → Reinstate button on a suspended operator | Hidden/blocked | ✅ UI correctly omits the button entirely (only "Deactivate" shown); server-side enforcement independently confirmed via code inspection (`admin.functions.ts:135`, throws unconditionally for non-`super_admin`, not just a UI-layer check) |
| `super_admin` → all of the above + Reinstate | Full access | ✅ Confirmed |

### 4.4 Customer verification workflow

- Queue renders correctly with status filters (`all`/`pending`/`unverified`/`approved`/`rejected`/`suspended`); filter switching verified live.
- Review dialog: all seeded fields render correctly (status, email, mobile, ID type/number, suburb, submitted date).
- **Reason validation**: clicking "Reject" with an empty reason correctly blocks submission (dialog stays open, no network call fires); typing a reason ≥10 characters correctly enables and submits.
- **Approve**: succeeds with no reason required, matching the schema (`reviewCustomerVerification` only requires a reason for `rejected`/`suspended`).
- Post-decision state verified correct: status badge, "Last reviewed" timestamp + note, and audit trail entry (`customer.verification.rejected`/`.approved`, attributed to the real actor and role) all confirmed via the same dialog re-opened after the mutation.

### 4.5 Operator review workflow

- Queue renders correctly with all 7 status filters and the search box.
- Detail page renders full business/location/card-acceptance/representative/staff/documents sections, and the exact decision buttons match `ADMIN_ALLOWED_TRANSITIONS` for the current status (`submitted` → 5 buttons; `approved` → Suspend/Deactivate; `suspended` → Deactivate + Reinstate for `super_admin`, Deactivate only for `ops_admin`).
- **Approve** (from `submitted`): succeeded, review history recorded (`submitted → approved`), decision buttons correctly narrowed afterward.
- **Suspend** (from `approved`), reason validation: empty reason blocked exactly as in the customer flow; valid reason succeeded. **`operator_staff.active` flipped to `Inactive` live in the UI**, confirming the C-04 trigger fires correctly and the UI reflects real DB state, not stale client cache.
- **Reinstate** (`super_admin` only): succeeded from `suspended`, wrote the mandatory reason, flipped status back to `approved`, and **reactivated staff** (`Inactive` → `Active`) — confirming `trg_operator_businesses_status_sync`'s reactivation branch also works correctly end to end through the real UI, not just in the SQL test suite.
- Full review history (multi-entry, correct chronological order, correct notes) rendered correctly at every stage.

### 4.6 Document access (private buckets, signed URLs)

- "View ID document" / "View selfie" / operator document buttons all correctly call `getSignedDocumentUrl` and open the result — confirmed via the actual network request/response, which returned a `storage/v1/object/sign/...` URL (never `getPublicUrl`) with `expiresInSeconds: 120`, matching `SIGNED_URL_TTL_SECONDS` in the source.
- **Signed URL expiry, verified for real**: re-requesting the exact same signed URL (via `curl`, outside the browser) after it had aged past 120 seconds returned HTTP 400 — Supabase Storage itself rejects the expired token, not just a client-side assumption.

### 4.7 Audit activity page

- Read-only by design, confirmed (no mutation affordance anywhere on the page).
- Entity-type filter (`operator_business` / `customer_profile` / `user` / `pilot_configuration`) verified — correctly narrows results.
- Time-range filter present and functional (`24h`/`7d`/`30d`/`all`).
- Action search box verified — correctly narrows to matching actions client-side (e.g., typing "reinstated" showed only the one matching row).
- Every mutation performed during this QA session appeared in the log with the correct actor, actor role, entity, and metadata — including the full multi-step operator suspend → reinstate history.

### 4.8 Duplicate-submission prevention

Rapid double-click on the "Approve" confirm button during the customer approval flow fired **two** `reviewCustomerVerification` POST requests (both returned 200) per the network log, but only **one** `customer.verification.approved` audit row was ultimately recorded. The client-side busy-state disable (`canSubmitAction`) did not deterministically prevent the second network call under a scripted rapid double-click, though the net effect on stored data was not observably duplicated in this test. This is a real but low-severity gap — **recommend adding a server-side idempotency guard** (e.g., have `reviewCustomerVerification`/`reviewOperatorApplication` no-op or reject if the target status already matches) as defense-in-depth, since client-side disabling alone is not a hard guarantee.

### 4.9 Responsive / accessibility

- **Mobile (375×812)**: admin overview, customer queue, and the customer review dialog all reflow cleanly — stat cards stack to a legible 2-column grid, dialog content is fully readable with no clipping or overflow, buttons remain comfortably tappable. No manual fixes were needed.
- **Keyboard/focus finding**: the customer review dialog (`admin.customers.tsx`) is a hand-rolled `<div>` overlay, not built on Radix Dialog like `ConfirmActionDialog` is. Confirmed via DOM inspection: no `role="dialog"` or `aria-modal` attribute anywhere while it's open, focus is **not** moved into the dialog when it opens (it stays on the trigger button behind the backdrop), and the **Escape key does not close it**. `ConfirmActionDialog` (used for all approve/reject/suspend/reinstate confirmations) does not have this problem — it's Radix-based. This is a real, scoped accessibility gap worth fixing, but it's a UI-polish item, not a security or data-integrity issue, so it wasn't fixed unilaterally under this QA's "smallest secure correction" mandate (which was reserved for the two blocking bugs above).

### 4.10 Console / runtime errors observed

- One recurring warning across several pages: `Can't perform a React state update on a component that hasn't mounted yet... Move this work to useEffect instead.` Observed but not root-caused within this session's scope — no functional symptom was ever observed alongside it. Worth a follow-up investigation, not a blocker.
- One `TypeError: Failed to fetch` at `_authenticated/route.tsx:15` (the session check in `beforeLoad`) — this correlates exactly with a dev-server restart I performed mid-session (to pick up the service-role key) interrupting an in-flight request, not an application defect.
- 4 pre-existing Vite build warnings (`createServerFn().inputValidator() is deprecated`) in `admin.functions.ts` and `documents.functions.ts` — unrelated to this session's changes, pre-existing from the sprint that introduced these functions.

## 5. Security confirmation (code inspection + live observation)

| Check | Result |
|---|---|
| No service-role key bundled client-side | ✅ `client.server.ts` remains dynamically imported only inside server-function handlers; confirmed no top-level import anywhere client-reachable, unchanged by this session's fixes |
| Signed URLs only, no `getPublicUrl` | ✅ Confirmed by source grep (only match is the test file asserting its absence) and by the live network response shape |
| RLS enabled on all relevant tables | ✅ Unchanged from prior remediation; not touched this session |
| Server-side authorization independent of UI | ✅ `assertAdmin` and the `super_admin`-only check in `reinstateOperator` are unconditional in the handler, confirmed by reading `admin.functions.ts:42-50, 134-137` — the UI hiding the Reinstate button for `ops_admin` is a UX nicety layered on top of, not a substitute for, this |
| No direct restricted-field updates | ✅ Unchanged; `customer_profiles`/`operator_businesses` review fields still only writable via the server functions per the existing migrations |
| Audit log is append-only | ✅ Unchanged; `INSERT` remains revoked from `authenticated`, only reachable via the `SECURITY DEFINER` `log_audit_event` function — verified live: every mutation during this QA produced exactly the audit shape that function produces, with no way observed to fabricate an entry from the client |
| Staging isolation | ✅ No request, credential, or mutation this session ever touched `cfwylchvtfwtqhfwoefm` — enforced by abort checks in every script used |

## 6. Test / typecheck / build / lint results

| Check | Result |
|---|---|
| `bun test` | ✅ 151/151 passing (148 → 151; 3 new regression tests added for the routing fix) |
| `bun run typecheck` (both configs) | ✅ Zero errors |
| `bun run build` | ✅ Succeeds; output correctly shows separate `admin.index`, `admin.operators.index`, and `admin.operators._id` chunks, confirming the route split compiled as intended |
| `bun run lint` — scoped to every file this QA touched | ✅ Zero errors after one auto-fixed formatting issue in the new test file |
| SQL security suite | Not re-run — no database migration was added this session (the routing fix and env config are frontend/config-only). Last real result stands at 38/38 (staging, prior session). |

## 7. Files changed during this QA

**New:**
- `src/routes/_authenticated/admin.index.tsx` — admin dashboard content, moved from `admin.tsx`
- `src/routes/_authenticated/admin.operators.index.tsx` — operator queue list, moved from `admin.operators.tsx`
- `src/lib/__tests__/admin-layout-routes.test.ts` — regression coverage for the Outlet bug
- `docs/STAGE_1_AUTHENTICATED_STAGING_QA_REPORT.md` — this report

**Modified:**
- `src/routes/_authenticated/admin.tsx` — reduced to a pure layout route (`Outlet` + guard)
- `src/routes/_authenticated/admin.operators.tsx` — reduced to a pure layout route (`Outlet` + guard)
- `src/routeTree.gen.ts` — regenerated automatically to reflect the two new index routes

**Not modified:** no migrations, no RLS/grant changes, no changes to any server function's authorization or validation logic, no changes to the tracked `.env`.

**Local-only, git-ignored, not part of this diff:**
- `.env.local` — gained one line (`SUPABASE_SERVICE_ROLE_KEY`) needed for the local dev server to exercise admin mutations against staging. Confirmed still git-ignored/untracked. Not committed and not part of any PR this produces.

## 8. Unresolved limitations

- The duplicate-submission race (§4.8) is a real, low-severity gap — recommend a server-side idempotency guard as a follow-up, not fixed in this QA pass since it wasn't a blocker and touches mutation logic beyond "smallest secure correction."
- The customer review dialog's accessibility gap (§4.9) — no `role="dialog"`, no focus trap, no Escape-to-close — is a real, scoped UI gap, left unfixed for the same reason.
- The unattributed React "state update before mount" console warning (§4.10) was observed but not root-caused.
- Operator staff invitation/management UI, pagination on large queues, and realtime updates remain out of scope, as previously documented in the Completion Sprint report — nothing new here changes that.

## 9. Cleanup requirements for synthetic staging data

Not performed as part of this QA pass (data may still be useful for further review or a follow-up QA round) — documented here so it can be done deliberately when you're ready:

- **Auth users** (6 total, all `@cashnear-staging.test`): 3 admin/customer test accounts from Phase 2 (`qa-superadmin-*`, `qa-opsadmin-*`, `qa-customer-*`) + 3 operator owners + 2 additional customer accounts from Phase 3 seeding (`qa-owner-pending-*`, `qa-owner-approved-*`, `qa-owner-suspended-*`, `qa-cust-pending-*`, `qa-cust-reject-*`) — delete via the Supabase Auth Admin API or dashboard; cascading FKs (`profiles`, `user_roles`, `customer_profiles`, `operator_businesses`, `operator_staff`) will clean up automatically on `auth.users` deletion (`ON DELETE CASCADE` throughout).
- **Storage objects**: 6 operator documents (`operator-documents/{business_id}/...`) + 4 customer documents (`customer-documents/{user_id}/...`) — will become orphaned (not auto-deleted) once the owning users/businesses are removed, since storage isn't FK-linked to Postgres; delete explicitly via the Storage API/dashboard.
- **Audit log entries**: attributable to the synthetic actors above; no special action needed if you delete the users first, since `audit_logs.actor_id` has no cascading FK (by design, so history survives actor deletion) — the rows will simply show a `null`/orphaned actor reference if left, or can be deleted by `entity_id`/actor match if you want a fully clean slate.
- The one pre-existing `diag@example.test` residual user (§3) is **not** part of this session's seeding and is left as-is.

## 10. Final recommendation

**Ready to Commit and Push** — with the explicit understanding that "commit and push" refers only to what's listed in §7 (the two-bug routing fix + its regression test), not to any Stage 2 work, and that the local-only `.env.local` addition is never part of that commit.

The Stage 1 admin UI's actual security posture — server-side authorization, signed-URL document access, append-only audit, RLS, reason enforcement, and the super-admin-only reinstatement gate — all held up under live, authenticated testing exactly as designed, with the state machine and staff-activation triggers behaving correctly end to end. The two bugs found were both about the UI failing to *render* the already-correct backend behavior (a routing composition mistake, not a security or data defect), and both are now fixed with regression coverage, passing tests, a clean typecheck, and a successful build. The two unresolved items (§8) are real but non-blocking — worth follow-up work, not reasons to hold this back.

As instructed: no commit, push, merge, or Lovable sync was performed. Production was never touched. Stage 2 was not started.

---

## Addendum: final hardening pass

Following review of this report, you asked for a final hardening pass fixing the two remaining findings (§4.8 and §4.9) before anything is pushed. Both are now fixed, with regression coverage, and the full verification suite passes. No Stage 2 work, no push, no merge — same constraints as before.

### A.1 Duplicate-submission race — fixed

`reviewOperatorApplication` and `reviewCustomerVerification` (`src/lib/admin.functions.ts`) now check, immediately after reading the current row and before any write, whether the requested target status already matches the current one. If so, the function returns `{ ok: true, status, alreadyApplied: true }` as a safe no-op and does **not** touch `operator_businesses`/`customer_profiles`, insert a `verification_reviews` row, or call `log_audit_event` a second time. This is enforced server-side, independent of the client's busy-state disabling — a duplicate request (double-click, retry, replay) can no longer produce a duplicate mutation or a duplicate audit entry, regardless of what the client does.

`reinstateOperator` was deliberately left unchanged — it wasn't one of the two functions named for this pass, and its own `canReinstateFrom` check already rejects a second call once the business is no longer `suspended` (the first call already moved it to `approved`), which is already a safe rejection rather than a silent duplicate.

**Regression coverage:** `src/lib/__tests__/admin-idempotency.test.ts` — structural tests (matching the existing `document-access.test.ts` pattern, since this repo has no bun:test DB harness) asserting: the guard exists in both functions, it runs *before* the mutating `supabaseAdmin` call, and the no-op path never reaches the `verification_reviews`/`log_audit_event` code.

### A.2 Accessibility — fixed

The customer verification review dialog (`src/routes/_authenticated/admin.customers.tsx`) was rebuilt on the same Radix `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle` primitives already used by `ConfirmActionDialog`, replacing the hand-rolled `<div className="fixed inset-0 ...">` overlay entirely. This gives it, for free, from Radix:

- `role="dialog"` and `aria-modal="true"` on the content element
- A focus trap (Tab/Shift+Tab cycle within the dialog while open)
- Initial focus moved into the dialog on open
- Escape closes the dialog
- Focus restored to the triggering element on close
- Keyboard navigation preserved for every button inside (Approve/Reject/View ID document/View selfie all remain plain, focusable buttons within the trap)

The dialog's visibility is now controlled via Radix's `open`/`onOpenChange` props (matching how `ConfirmActionDialog` is already used) rather than conditionally mounting/unmounting the component — required for Radix's open/close and focus-restore lifecycle to work correctly. The custom "Close" text button was removed in favor of Radix's built-in close control (top-right `X`, already used by every other dialog in this app). No data-fetching, mutation, or business logic changed — only how the overlay itself is built.

**Regression coverage:** `src/lib/__tests__/customer-dialog-accessibility.test.ts` — structural tests asserting: the file imports `Dialog`/`DialogContent`/`DialogTitle` from the shared Radix wrapper, every `DialogContent` has a matching `DialogTitle` (Radix requires this for `aria-labelledby`), the old hand-rolled `fixed inset-0 ... bg-black/60` pattern is gone, and visibility is driven by controlled `open`/`onOpenChange` props rather than conditional mounting.

### A.3 Verification suite (after this pass)

| Check | Result |
|---|---|
| `bun test` | ✅ 158/158 passing (151 → 158; 7 new regression tests across the two fixes) |
| `bun run typecheck` (both configs) | ✅ Zero errors |
| `bun run build` | ✅ Succeeds |
| `bun run lint` — scoped to every file this pass touched | ✅ Zero errors |

No database migration was needed for either fix (both are application-layer changes), so the SQL security suite was not re-run; its last result stands at 38/38.

### A.4 Files changed in this pass

**Modified:** `src/lib/admin.functions.ts` (idempotency guards), `src/routes/_authenticated/admin.customers.tsx` (Radix dialog rebuild).
**New:** `src/lib/__tests__/admin-idempotency.test.ts`, `src/lib/__tests__/customer-dialog-accessibility.test.ts`.

A live authenticated re-verification in the browser (re-testing the double-click and Escape-key behavior end to end) was intentionally not performed in this pass — it would have required re-establishing a logged-in session, and your prior instructions were explicit that I should not autofill or submit the login form on your behalf. The fixes are covered by the structural regression tests above plus the full passing suite instead.

### A.5 Final recommendation (unchanged)

**Ready to Commit and Push** — now including the two hardening fixes and their regression tests in addition to the routing fix from the original QA pass. Still: no commit, push, merge, or Lovable sync performed; production untouched; Stage 2 not started.
