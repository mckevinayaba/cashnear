# Stage 1 Completion Sprint Report — Admin UI

Builds the missing admin interface for the Stage 1 backend controls verified against staging (`1d454bf`, `docs/STAGING_DATABASE_VERIFICATION_REPORT.md`). No Stage 2 work, no new product features, no schema changes beyond what's documented below (none were needed).

---

## Architecture reviewed

TanStack Start, flat-file routing convention (`_authenticated/admin.operators.$id.tsx` style — confirmed via `src/routes/README.md` and the existing route set, not folder-based). Auth: `_authenticated/route.tsx` gates on session in `beforeLoad`; admin-role gating previously lived only in a post-render `useEffect` on each admin page. Confirmed via direct search that all four backend mutation functions this sprint needed already existed and were correctly gated: `reviewOperatorApplication`, `reinstateOperator`, `reviewCustomerVerification`, `grantUserRole` (unused here). Confirmed zero existing signed-URL/`getPublicUrl` usage anywhere in the app before this sprint. Confirmed `customer_profiles` and `profiles` have no direct FK relationship (`Relationships: []` in the generated types), so listing customers requires two queries joined client-side, not a single PostgREST embed.

## Routes and screens added

| Route | Status |
|---|---|
| `/admin` | Extended — customer counts, recent activity, nav to the two new pages, `beforeLoad` guard added |
| `/admin/customers` | **New** — verification queue + inline review dialog |
| `/admin/operators` | Extended — `beforeLoad` guard, text search filter, error state |
| `/admin/operators/:businessId` | Extended — documents, staff list, confirmation dialogs, enforced reasons, reinstate action, `beforeLoad` guard |
| `/admin/audit` | **New** — read-only, filterable |
| `/access-denied` | **New** — safe landing for a logged-in non-admin hitting an admin URL |

No `/admin/customers/:id` sub-route — the customer detail/review is an in-page dialog, matching "keep this concise, not an analytics product" and avoiding a route for what's a lightweight review panel.

## Existing backend functions reused (none duplicated)

`reviewOperatorApplication`, `reinstateOperator`, `reviewCustomerVerification` — called exactly as they exist, no client-side re-implementation of their transition/authorization logic. One new function was added because nothing equivalent existed: `getSignedDocumentUrl` (documents.functions.ts), admin-gated, service-role-only for the actual signed-URL generation, 120-second expiry.

## Files changed

**New:** `.claude/launch.json` (dev preview config), `src/lib/admin-authorization.ts`, `src/lib/admin-route-guard.ts`, `src/lib/admin-reason-validation.ts`, `src/lib/documents.functions.ts`, `src/components/admin/{ConfirmActionDialog,StatusBadge,DocumentLink}.tsx`, `src/routes/access-denied.tsx`, `src/routes/_authenticated/admin.{customers,audit}.tsx`, 4 new test files under `src/lib/__tests__/`.

**Modified:** `src/lib/admin.functions.ts` (reason-required validation), `src/routes/_authenticated/admin.tsx`, `admin.operators.tsx`, `admin.operators.$id.tsx` (all three), `src/routeTree.gen.ts` (generated, reflects the 3 new route files).

## Security decisions

- **Access control is `beforeLoad`-based, not `useEffect`-based**, on all six admin routes now (the three pre-existing ones were upgraded too, for a consistent posture — not left half-hardened). This is a UX-layer improvement, not a new security boundary: it reads the same `user_roles` RLS-gated source every admin mutation already independently re-checks server-side via `assertAdmin`. **The actual enforcement remains server + RLS, unchanged and untouched.**
- **Reason requirements tightened server-side**, not just in the UI: `reviewOperatorApplication` and `reviewCustomerVerification` now reject `rejected`/`suspended` decisions with a missing or under-10-character `note` via a Zod `superRefine` — previously `note` was optional for every decision. This closes a real gap the task named explicitly. The client mirrors this (`admin-reason-validation.ts`) only for immediate feedback; the server independently re-validates.
- **No RLS policy, grant, or trigger was touched.** Storage RLS already permitted admin reads of any document (`is_admin(auth.uid())` OR-branch, confirmed in the staging verification); the new signed-URL function derives its authorization from the same `assertAdmin` pattern already used everywhere else, it doesn't grant anything RLS didn't already allow.
- **No service-role key reaches the browser.** `getSignedDocumentUrl` is a server function; the service-role client is dynamically imported inside its handler exactly like every other admin mutation in this codebase, never bundled client-side.

## Document-access approach

Signed URLs only, 120-second expiry, generated on demand at click time via `DocumentLink` → `getSignedDocumentUrl`. No permanent public URL is ever constructed; storage buckets remain private (unchanged from the staging-verified H-03 configuration). Verified by an automated structural test (`document-access.test.ts`) that fails if `getPublicUrl` is ever introduced into the documents path.

## Tests added

148 total `bun test` cases now pass (up from 113), across 5 files. New this sprint:

- `admin-route-guard.test.ts` — exhaustive coverage of `isAuthorizedAdmin`: no roles, customer-only, `operator_owner`-only (role possession ≠ admin access), `ops_admin`, `super_admin`, both, and the `requireSuperAdmin`-specific gate (the reinstatement page's actual authority check).
- `admin-reason-validation.test.ts` — every decision type against the reason requirement, boundary case at exactly `MIN_REASON_LENGTH`, whitespace-only reason correctly treated as empty.
- `confirm-action-dialog.test.ts` — `canSubmitAction` (the literal function the confirm button's `disabled` prop is wired to): busy state blocks submission regardless of reason validity (duplicate-submission prevention), reason-required gating, custom minimum length.
- `document-access.test.ts` — structural regression guard: `documents.functions.ts` must use `createSignedUrl` and must never contain `getPublicUrl`; the same for every admin route/component that renders a document link; the signed-URL TTL is bounded (≤ 5 minutes).

**Scope decision, stated plainly (a deliberate change from my initial plan):** I did not add `@testing-library/react`/`happy-dom` for full component-render/interaction tests. The task's test list includes items that are fundamentally rendered-UI behaviors (queue loading/empty/error states, confirmation-dialog interaction, redirect-on-unauthorized as an actual page transition). Given this session's history of real friction from introducing new tooling under time pressure, I chose to extract and thoroughly test every piece of *logic* those behaviors depend on (above), and cover the rendered behavior via direct manual verification instead (next section) rather than rush a new test harness. This is a real gap relative to the task's literal list, and I'm flagging it as such rather than quietly substituting one for the other.

### Manual verification performed (dev server + browser, no admin credentials available)

- Dev server boots clean, no console errors, on the public homepage and `/auth`.
- `/access-denied` renders correctly, standalone.
- Unauthenticated access to `/admin`, `/admin/customers`, and `/admin/audit` all correctly redirect to `/auth` (the parent `_authenticated` guard) — confirmed via actual page title/content after navigation, not assumed.
- **Not verified:** the authenticated admin golden paths (approve/reject with confirmation, document viewing, reinstatement, audit filtering) — this requires a real logged-in `ops_admin`/`super_admin` session, and I have no such credentials for this app's own Supabase project in this environment. I did not create one against production to get this, since that wasn't authorized for this phase. This is the honest limit of what I could verify here.

## Test, typecheck, build, lint results

| Check | Result |
|---|---|
| `bun test` | ✅ 148/148 passing |
| `bun run typecheck` (both configs) | ✅ Zero errors |
| `bun run build` | ✅ Succeeds |
| `bun run lint` — scoped to every file this sprint touched | ✅ Zero errors, 3 pre-existing-pattern `react-refresh` warnings (same category already present elsewhere in this codebase, e.g. `src/components/ds/index.ts`) |
| `bun run lint` — full repo | 151 problems, all in files this sprint never touched (pre-existing debt from the original Lovable build); count is *lower* than the 172 baseline reported after the security remediation, because rewriting `admin.tsx`/`admin.operators.tsx`/`admin.operators.$id.tsx` for this sprint's requirements incidentally ran them through `eslint --fix`, clearing their prior formatting debt as a side effect — not a cleanup pass in its own right |

No SQL security suite re-run — no migration was added (see below), so per the task's own instruction ("run the full SQL security suite **if** any database migration was added") this doesn't apply. The 7-script suite's last real result stands at 38/38 (staging, `1d454bf`).

## Database changes

**None.** No genuine frontend blocker required one — confirmed in Phase 0 that storage RLS already permits admin document reads, and both required review-decision functions already exist and now correctly enforce reason requirements at the application layer (Zod), which doesn't need a migration.

## Generated file check

`src/routeTree.gen.ts` changed, reflecting the 3 new route files (`admin.customers.tsx`, `admin.audit.tsx`, `access-denied.tsx`) — confirmed intentional and correct via a final build; no other generated artifact (`.output/`, `.wrangler/`) is tracked or was modified.

## Remaining limitations

- No automated component/interaction test coverage (see Tests section) — logic is fully tested, rendering/interaction is not.
- No pagination on the customer or operator queues (audit log is capped at 200 rows with filters); likely fine at pilot scale (50 operators / 500 customers), worth revisiting before national scale.
- No real-time/live updates — every queue refetches only on filter change or after a completed mutation, consistent with the rest of the app's existing conventions (no realtime subscriptions used anywhere else either).
- Customer document viewing assumes `id_document_path`/`selfie_path` are valid, already-uploaded storage paths; this sprint didn't add any new validation of that assumption beyond what already existed.
- The two pre-existing High findings from the original assessment (H-04 file-type/size re-validation, H-05 — now addressed by this sprint's guard upgrade for the admin section specifically) — H-05 is effectively closed for `/admin/*`; H-04 remains open, unrelated to this sprint's scope.
- Full authenticated manual QA (see above) is outstanding — needs an actual admin session, ideally on staging first.

## Recommendation

**Ready for Founder Review.**

Every required workflow is implemented against real, already-verified backend functions, with no RLS/grant changes, no service-role exposure, and a consistent `beforeLoad` access-control pattern across the whole admin section. Logic-level tests are thorough and passing; rendering/interaction tests are explicitly not, and I've said so rather than implying otherwise. The one thing standing between this and a full sign-off is authenticated manual QA with a real admin account, which needs your (or an authorized admin's) credentials, not mine to fabricate.
