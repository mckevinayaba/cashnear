# CashNear Technical Assessment

**Assessor role:** Incoming technical co-founder / chief architect / principal engineer / security reviewer, first exposure to the codebase.
**Date:** 2026-07-18
**Repository:** `https://github.com/mckevinayaba/cashnear`, branch under review: `main` @ `de3a0e4` (plus local hygiene commit `f5b0954` on `assessment`).
**Method:** Full read of every committed migration, server function, route, and Supabase client wrapper; `bun install`/`lint`/`build`/`tsc`/`audit` run locally; no live-database access (no service-role key available or used). Every claim below is labelled **Observed**, **Inferred**, **Risk**, **Recommendation**, **Requires founder decision**, or **Requires legal review**.

---

## 1. Executive summary

**Observed.** This is a genuinely well-structured Stage 1 foundation — better than the median "AI-generated scaffold." Row Level Security is enabled on every table, privileged writes mostly flow through server functions that independently re-verify the caller's role from a server-derived JWT (not a client-supplied field), Zod validates every server function input, TypeScript is strict and currently compiles clean, and the build succeeds. This is not a prototype dressed up as a product.

**Risk.** But the foundation has four **critical, concentrated** authorization gaps, and they all sit at the exact place CashNear says its core value proposition lives: verification and trust. A customer can set their own KYC `verification_status` to `approved`. An operator can set their own `application_status` to `approved`. An operator can resubmit the same application server function to silently reset a suspended or rejected business back to `draft`/`submitted`. And suspending or rejecting an operator never revokes the role or dashboard access that lets them do any of this. None of these require exotic exploitation — they are ordinary authenticated `supabase-js` calls that any signed-in user can make from the browser console today.

**Bottom line:** this is a sound foundation with a narrow, well-defined, fixable set of blocking issues — not a rebuild situation, and not a "ship it" situation either. See §24 for the precise readiness call.

---

## 2. My understanding of CashNear

CashNear is not trying to be a payments company in Version 1 — it is trying to be a **trust and coordination layer** on top of payment infrastructure that already exists (card terminals, existing merchant cash-out behaviour). The wedge is narrow and deliberate: verified customers request cash, verified operators fulfil it using their own card machines, and CashNear's job is to make sure both sides know who they're dealing with, what it costs, and that the interaction is safe — without ever touching the money itself.

The reason this boundary matters technically, not just legally, is that it changes what "correct" means for this codebase. The system doesn't need idempotent money movement or ledger reconciliation yet — it needs an identity and verification system that cannot lie to itself. If a customer can self-certify as KYC-verified, or an operator can self-certify as approved, the entire "verified neighbourhood businesses" promise on the homepage becomes false, even though no money has moved. That is the specific way this product can fail before it ever processes a transaction, and it's why §5 below is the center of gravity of this whole report.

Long-term, the plan is explicit that cash is a wedge, not the ceiling — the aspiration is an API/network layer under other financial-access use cases. Nothing in the current codebase over-reaches toward that yet, which is correct discipline for a pilot.

**Highest-risk workflows, in order:** (1) operator verification decisions, (2) customer KYC verification, (3) document handling for both, (4) role/permission grants, (5) everything else. Trust is created in exactly one place — the manual admin review recorded in `verification_reviews` and `operator_businesses.reviewed_by` — and, as detailed below, trust can currently fail by simply not going through that place.

---

## 3. Questions and ambiguities

**Requires founder decision:**
- Version 1 explicitly forbids CashNear from "automatically deduct[ing] platform fees from the card transaction," yet `pilot_configuration` already seeds `cashnear_fee_bands` (R2–R8, migration `20260718061518...sql:296-301`). How does CashNear actually collect its fee during the pilot if it never touches the payment rail? This is a real Stage 2 business-model question, not an engineering detail, and it will shape the transaction data model.
- The homepage (`src/routes/index.tsx`) already advertises "secure transaction code," "confirm only after receiving cash," and "report a problem in-app and pause the operator instantly" — none of which exist in any form yet. Is this copy meant to describe the pilot's target state, or should it be scoped back to what a signed-up user can do today? (See M-04/M-05 in §20.)

**Requires legal review:**
- `customer_profiles` and `operator_businesses` store raw South African ID numbers in plain `TEXT` columns (`id_document_number`, `representative_id_number`) with no column-level encryption, alongside selfie/ID-document image paths. Is long-term plaintext retention appropriate, or should this data be minimized/masked after verification under POPIA data-minimization principles?
- `src/routes/legal.terms.tsx` and `src/routes/legal.privacy.tsx` are one-paragraph placeholders, while the live app already collects ID numbers, selfies, and business registration/tax numbers from real pilot signups. Is that acceptable for an "invited users only" pilot, or does POPIA require a substantive privacy notice before any such collection begins?
- No data-retention or deletion policy exists for rejected applicants' identity documents (see §14).

I have not filled these gaps with assumptions; they're listed here because they materially affect the data model and cannot be resolved by reading code.

---

## 4. Repository map

```
src/
  routes/                      TanStack Start file-based routes (see §16 for the full map)
    _authenticated/            Routes behind the auth guard (route.tsx does the gate)
  lib/
    admin.functions.ts         Server fns: reviewOperatorApplication, grantUserRole
    operators.functions.ts     Server fn: upsertOperatorApplication
    customer.functions.ts      Server fn: submitCustomerVerification
    error-capture.ts / error-page.ts / lovable-error-reporting.ts   SSR error handling
  integrations/supabase/
    client.ts                  Browser/RLS-scoped client (anon/publishable key)
    client.server.ts           Service-role client (SUPABASE_SERVICE_ROLE_KEY, bypasses RLS)
    auth-middleware.ts         requireSupabaseAuth — verifies bearer JWT server-side per request
    auth-attacher.ts           Client middleware that attaches the session token to server-fn calls
    types.ts                   Generated DB types
  components/ds/                Design-system primitives (AppShell, Button, Card, Typography)
  components/ui/                shadcn/Radix primitives (unmodified library components)
  hooks/use-auth.ts             Client-side session + role cache (reads own user_roles rows)
supabase/
  migrations/                   4 SQL files, all committed 2026-07-18 (see §8)
  config.toml                   project_id only
.lovable/plan.md                The original Stage 1 build spec Lovable executed against — useful
                                 as a "planned vs. built" cross-reference throughout this report
docs/
  ENVIRONMENT_REQUIREMENTS.md   Added this session (env var hygiene, see prior commit)
```

No `src/pages/`, no `app/`, no test directories, no `.github/` — confirmed absent, not just unlisted.

---

## 5. Technology assessment

**Observed.** React 19.2, TypeScript 5.9 (strict), TanStack Start 1.168 + Router + Query, Vite 8.0, Tailwind CSS 4.2, Supabase JS 2.110, Zod 3.25, React Hook Form, Radix UI, `bun` as package manager (`bun.lock`, `bunfig.toml` — **not** npm, despite `package-lock`-style tooling assumptions in generic advice).

This is a coherent, modern, opinionated stack — not a grab-bag. It's appropriate for pilot scale and doesn't over-engineer (no GraphQL layer, no microservices, no message queue that isn't needed yet).

**Risk (low, monitor).** `vite.config.ts:7` delegates almost all build configuration to `@lovable.dev/vite-tanstack-config`, a third-party package the team doesn't control, which silently governs the Nitro/Cloudflare Workers deployment target, env-var injection, and plugin wiring (per the comment at `vite.config.ts:1-6`, explicitly warning not to duplicate its plugins). Vite 8 and TanStack Start 1.168 are both young majors. None of this is broken today (build succeeds, see §16), but it means a meaningful slice of build behaviour is a black box outside this repo, and upgrades to that one package can change deployment behaviour without a corresponding diff here. **Recommendation:** pin and review `@lovable.dev/vite-tanstack-config` changelogs before any bump; don't let it auto-update.

**Observed — deployment target.** `bun run build` generates `.output/server/wrangler.json` and `.wrangler/deploy/config.json` — this app is built for **Cloudflare Workers** via Nitro. Confirm this matches the team's actual hosting intent; nothing in the repo states it explicitly outside the build output.

---

## 6. Architecture assessment

**Score: 6/10.**

The layered pattern — RLS as the baseline, `SECURITY DEFINER` helper functions (`has_role`, `is_admin`, `is_business_member`) to avoid recursive-policy problems, server functions independently re-deriving identity from a verified JWT rather than trusting client input, a dedicated service-role client only reachable from `*.server.ts` — is the *correct* shape for this kind of app, and better-executed than most Lovable-generated codebases I'd expect to see. `grantUserRole` and `reviewOperatorApplication` both do real server-side authorization (§10), not just cosmetic checks.

What pulls the score down isn't architecture-shape, it's that the same pattern has four sharp, concentrated holes exactly where the product's core trust claim lives (§20, C-01–C-04), a migration that appears to break the EXECUTE grant its own RLS policies depend on (H-01), and zero automated verification of any of this (§17). A 6 reflects "good bones, dangerous specific gaps," not "needs a rewrite."

---

## 7. Product-engineering assessment

**Strong:** the deliberate non-payment boundary is respected in code, not just in the pitch — I found no card-number storage, no wallet, no split-settlement logic, no SARB/licensing claims anywhere in `src/` (checked explicitly, §16). Zod schemas on every server function input are specific and reasonably strict (e.g. SA mobile-number regex in `customer.functions.ts:7-10`). Status labels in the UI correspond to real enum values from the database (`operator.dashboard.tsx:24-34` maps every `operator_application_status` value).

**Weak/missing:** the operator "business profile view/edit (locked fields after approval)" and "staff invite/manage" surfaces described in the original build plan (`.lovable/plan.md:86-87`) were never built — the single `operator.apply.tsx` form doubles as both, with only a client-side `locked` flag standing in for real field-locking (§20, C-03). `admin/customers`, `admin/audit-log`, and a standalone `super-admin` console (also named in the plan) don't exist either — all admin functions currently live inside `admin.tsx`/`admin.operators.tsx`.

**Premature:** none of the actual Stage 2 concepts (requests, matching, codes, incidents) are implemented, which is correct — but the public marketing copy already promises several of them as if live (§20, M-05). That's a premature *claim*, not premature *code*.

---

## 8. Database assessment

**Observed — schema.** Four migrations, applied in order:

1. `20260718061518_4f1b981e...sql` — all core enums/tables/RLS/triggers/seed data.
2. `20260718061532_b9120853...sql` — `REVOKE EXECUTE` on the four `SECURITY DEFINER` helper functions from `PUBLIC, anon, authenticated`. **This is the migration behind finding H-01 (§20).**
3. `20260718061546_67b5efcb...sql` — `storage.objects` policies for the `operator-documents` bucket.
4. `20260718064316_cf337c34...sql` — adds customer KYC columns to `customer_profiles`; adds `storage.objects` policies for `customer-documents`.

**Tables, purpose, and RLS summary:**

| Table | Purpose | RLS enabled | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|---|
| `profiles` | 1:1 with `auth.users` | Yes | own or admin | own | own (no column restriction, but table has no privileged fields — safe) | — (no grant) |
| `user_roles` | Global role grants | Yes | own or admin | **no policy — write only possible via service role** | none | none |
| `customer_profiles` | KYC + verification state | Yes | own or admin | own | own — **no column restriction; includes `verification_status`, `reviewed_by`, `reviewed_at`, `review_notes` (C-01)** | — |
| `operator_businesses` | Application + business record | Yes | owner/staff/admin | owner only | owner — **no column restriction; includes `application_status`, `reviewed_by`, `reviewed_at`, `review_notes` (C-02)** | — (no grant) |
| `operator_staff` | Per-business role membership | Yes | member/owner/admin | owner only (`FOR ALL`) | owner only | owner only |
| `operator_documents` | Uploaded document metadata | Yes | owner/staff/admin | owner only | — (no grant) | owner only |
| `verification_reviews` | Immutable review audit trail | Yes | business owner or admin | admin only, `reviewer_id` self-pinned | — | — |
| `pilot_configuration` | Pilot parameters (fees, limits) | Yes | any authenticated | super_admin only | super_admin only | super_admin only (`FOR ALL`) |
| `audit_logs` | Platform audit trail | Yes | admin only | **any authenticated, `actor_role` unconstrained (H-02)** | — | — |

Indexes exist on the columns that matter for RLS and lookups (`operator_businesses.owner_id`/`application_status`, `operator_staff.business_id`/`user_id`, `audit_logs.actor_id`/`entity_type,entity_id`/`created_at`) — this is not an app that will fall over on missing indexes at pilot or early scale.

**Timestamps/audit fields:** `created_at`/`updated_at` are DB-defaulted and trigger-maintained (`update_updated_at_column()`), not client-supplied — good, these are reliable.

**Foreign keys / deletion behaviour:** `profiles`, `customer_profiles`, `operator_businesses`, `operator_staff` all `ON DELETE CASCADE` from `auth.users` — no orphan rows there. `operator_documents.uploaded_by` and `audit_logs.actor_id` have **no** `ON DELETE` action specified (defaults to `NO ACTION`), meaning a user with any audit-log or document history cannot be deleted from `auth.users` without first handling those rows. **Recommendation (low urgency at pilot scale, real before any account-deletion/POPIA-erasure feature):** decide the intended behaviour (`SET NULL` + anonymize, vs. hard block) and encode it explicitly.

**Reproducibility gap (H-03, detailed in §20):** neither storage bucket (`operator-documents`, `customer-documents`) is created anywhere in the committed migrations — no `INSERT INTO storage.buckets`, no bucket config file. The RLS policies in migrations 3–4 assume the buckets already exist and are private; nothing in version control provisions or asserts that.

---

## 9. Authentication assessment

**Observed.** Standard Supabase email/password auth (`src/routes/auth.tsx`), 8–72 character password policy enforced client-side via Zod before the call (`passwordSchema`, `auth.tsx:21`), session persisted via `localStorage` with `autoRefreshToken: true` (`client.ts:51-53`) — the conventional SPA pattern, appropriate here since there's no requirement for httpOnly-cookie-based sessions in this stage.

**Server-side verification is real, not decorative.** `requireSupabaseAuth` (`auth-middleware.ts:33-108`) is invoked as TanStack Start server-fn middleware on every privileged call. It pulls the `Authorization: Bearer` header directly from the request (not from any client-supplied field), validates JWT shape, and calls `supabase.auth.getClaims(token)` to get a server-verified `userId`. Every server function in `admin.functions.ts`, `operators.functions.ts`, and `customer.functions.ts` receives `context.userId` from this verified source — I did not find a single privileged handler that trusts a client-supplied user ID or role for an authorization decision. This is the single strongest thing in the codebase.

**Password reset** (`reset-password.tsx`) uses the standard Supabase recovery-link flow correctly (`resetPasswordForEmail` → hash-based `type=recovery` detection → `auth.updateUser`).

**Minor (L-04):** `auth.tsx:57-60` explicitly surfaces "An account with this email already exists" on duplicate signup — a mild account-enumeration signal. This mirrors Supabase's own documented SDK pattern for detecting the case and is a common, low-severity UX/security trade-off; not blocking.

---

## 10. Authorisation assessment

This is the most consequential section of the report — see §20 for the full findings register with exploit scenarios. Summary of the model:

- **Global roles** (`user_roles`, `app_role` enum: `customer`, `operator_owner`, `operator_manager`, `operator_cashier`, `ops_admin`, `super_admin`) are only writable via the service-role client (no `INSERT`/`UPDATE` RLS policy exists for `authenticated` at all, and `GRANT` is `SELECT`-only) — **self-role-assignment via direct table write is correctly blocked.** This is good, and I verified it by reading the grant and policy list directly, not by assumption.
- Role *grants* (`grantUserRole`, `admin.functions.ts:88-115`) are correctly restricted to `super_admin` callers, verified server-side.
- Role *usage for review decisions* (`reviewOperatorApplication`) is correctly restricted to `ops_admin`/`super_admin`, verified server-side.
- **But** the tables that record the *outcome* of verification (`operator_businesses.application_status`, `customer_profiles.verification_status`, and their accompanying `reviewed_by`/`reviewed_at`/`review_notes` fields) are protected only by row-ownership RLS with no column restriction — meaning the record owner can write these fields directly, bypassing every one of the correctly-built server functions above. **This is C-01/C-02 in §20 and is the single most important finding in this report.**

Adversarial scenarios from the assessment brief, checked directly against code:

| Scenario | Result |
|---|---|
| Customer self-assigns `operator_owner`/`operations_admin` via `user_roles` | **Blocked** — no RLS write policy, GRANT is SELECT-only |
| Operator changes own application status to approved | **Not blocked** — C-02 |
| Customer changes own KYC status to approved | **Not blocked** — C-01 (not explicitly named in the brief, but same bug class) |
| Rejected/suspended operator keeps using operator role | **Not blocked** — C-03 + C-04 |
| Ops admin performs a super-admin action (role grant, pilot config write) | **Blocked** — both gated on literal `super_admin`, not just `is_admin` |
| Operator reads another operator's documents | **Blocked** — RLS scopes to owner/staff/admin |
| Operator adds staff to another operator's business | **Blocked** — `"Owner manages staff"` policy checks real ownership |
| Customer reads another customer's profile | **Blocked** — RLS scopes to own row or admin |
| User manipulates a business ID in a request | **Blocked at the DB layer** for reads; `upsertOperatorApplication` additionally pins `.eq("owner_id", userId)` on updates |
| User calls a server function directly, bypassing the UI | **Server-side authorization holds** for role checks (`assertAdmin`), but **does not hold** for state-transition validity (C-03) |

---

## 11. RLS assessment — issue list

1. **C-01** `customer_profiles` UPDATE policy has no column restriction — owner can self-set `verification_status`, `reviewed_by`, `reviewed_at`, `review_notes`. `supabase/migrations/20260718061518...sql:96-97`.
2. **C-02** `operator_businesses` UPDATE policy has no column restriction — owner can self-set `application_status`, `reviewed_by`, `reviewed_at`, `review_notes`. `supabase/migrations/20260718061518...sql:161-162`.
3. **H-01** `REVOKE EXECUTE` on `has_role`/`is_admin`/`is_business_member`/`handle_new_user` from `authenticated` (migration `20260718061532...sql`) breaks every RLS branch that must evaluate these functions for a non-owner caller — staff reads, admin reads via the RLS-scoped client, super_admin writes, and the `verification_reviews` insert inside `reviewOperatorApplication`. See §20 for the exact mechanics.
4. **H-02** `audit_logs` INSERT policy accepts any authenticated caller with an unconstrained `actor_role`, allowing audit-trail forgery independent of the (correctly-built) server functions.
5. Every policy correctly pairs `USING`/`WITH CHECK` where both are needed (I checked each one individually — none are missing a `WITH CHECK` on an `INSERT`/`UPDATE` policy). The *columns* covered by those checks, not their presence, is the actual gap (C-01/C-02).
6. `pilot_configuration` and `verification_reviews` policies are correctly tight (super_admin-only write; admin-only + self-pinned reviewer insert respectively) — no issue found here.

---

## 12. Storage assessment

| Requirement | Status |
|---|---|
| Bucket is private | **Cannot verify from repository** — bucket creation isn't in version control (H-03) |
| No permanent public URLs | Policies assume private bucket + no public-read policy exists; unverifiable against live config |
| Users upload only to authorised paths | **Yes** — both buckets enforce `(storage.foldername(name))[1]` matches the caller's own ID (own `auth.uid()` for customer docs; owning business ID for operator docs) |
| Business members can't access another business's files | **Yes**, enforced via the same folder-prefix check |
| Signed URLs are time-limited | Not applicable yet — no signed-URL generation code exists in the repo at all; documents are read directly via the RLS-scoped client today, which is consistent with "reviewers access files through authorized flows" but means there's no short-lived-URL pattern to audit |
| Object names disclose identity info | **No** — paths use `{business_id}/...` or `{user_id}/{kind}-{timestamp}.{ext}`, no ID numbers or names in paths |
| File type / size restrictions | **Not found anywhere** — only a cosmetic HTML `accept` attribute (H-04) |
| Dangerous file types rejected | **Not found** |
| Orphan files handled | **Not found** — no cleanup path if a customer uploads then abandons the verification form |

---

## 13. Server-function assessment

Three server functions exist: `reviewOperatorApplication`, `grantUserRole` (`admin.functions.ts`), `upsertOperatorApplication` (`operators.functions.ts`), `submitCustomerVerification` (`customer.functions.ts`).

| Function | Auth | Authz | Input validation | Ownership check | Status-transition check | Audit logging | Error on unchecked write |
|---|---|---|---|---|---|---|---|
| `reviewOperatorApplication` | ✅ `requireSupabaseAuth` | ✅ `assertAdmin` | ✅ Zod enum + length caps | N/A (admin) | N/A (admin sets any valid enum value) | ✅ writes `verification_reviews` + `audit_logs` | ⚠️ `verification_reviews` insert error is **not checked** (line 62) — silently swallowed if H-01 breaks it |
| `grantUserRole` | ✅ | ✅ literal `super_admin` check | ✅ Zod enum | N/A | N/A | ✅ | — |
| `upsertOperatorApplication` | ✅ | Implicit (any authenticated user may apply) | ✅ Zod, extensive | ✅ `.eq("owner_id", userId)` on update | ❌ **No check of current `application_status` before overwriting (C-03)** | ✅ | — |
| `submitCustomerVerification` | ✅ | Implicit (any authenticated user may submit) | ✅ Zod, SA mobile regex | ✅ (own `user_id` via upsert) | N/A (always sets `pending`, correct) | ✅ | — |

None of these use explicit DB transactions across their multi-table writes (e.g. `upsertOperatorApplication` writes to `operator_businesses`, then `user_roles`, then `operator_staff`, then `audit_logs` as four separate round-trips) — at pilot scale (single-digit concurrent submissions) this is not a practical risk, but it means a mid-sequence failure leaves partial state (e.g. business created, role not yet granted). **Recommendation:** wrap multi-table server-function writes in a Postgres function (`SECURITY DEFINER`, called via RPC) once this becomes a real concurrency concern — not urgent at pilot scale.

No idempotency key exists for double-submission (e.g. rapid double-click on "Submit"); the `upsert(...,{ignoreDuplicates:true})` pattern used for role/staff grants naturally handles duplicates, but repeated calls to `upsertOperatorApplication` for the *same* business are exactly how C-03 is triggered — idempotency and the missing status guard are two sides of the same fix.

---

## 14. Privacy assessment

**Observed — what's collected:** full legal name, SA mobile number, ID/passport/asylum/refugee document type + number, ID document image, optional selfie (customer side); representative name, SA ID number, mobile, email, plus full business registration/tax/banking-terminal details (operator side). This is proportionate to what a real KYC/business-verification flow needs — nothing here looks like over-collection for the stated purpose.

**Risk:** plaintext ID numbers in regular columns (see §3, legal-review item), no documented retention/deletion policy for rejected applicants, and — because of C-01/C-02 — the *record of who reviewed this data and when* is not currently tamper-proof, which is itself a privacy-process integrity issue, not just an access-control one: a falsified `reviewed_by` could misattribute a review decision to an admin who never made it.

**Positive:** documents are never publicly readable (storage RLS is real and correctly scoped, §12); the codebase contains no analytics/tracking pixels, no third-party data sharing calls, and no logging of document contents (only paths/metadata) that I could find.

---

## 15. Trust and safety assessment

The stated principle — "trust must be engineered, not decorative" — is *architecturally* respected (real server-side role checks, real audit-log writes for every reviewed decision) but is **not currently enforced end-to-end**, because the same data the trust system is supposed to protect can be edited directly by the party being verified (C-01, C-02) and because the audit trail meant to make trust "auditable" can itself be forged by any authenticated user (H-02) or silently fail to write (H-01). None of this is exploitable for financial gain *today*, because Stage 2 (money-adjacent flows) doesn't exist yet — but it means the trust foundation Stage 2 would be built on is not yet load-bearing. This is fixable with targeted RLS/column changes, not a redesign, and should be the literal first thing done before any Stage 2 work starts.

---

## 16. Build and dependency assessment

Commands run against a clean `bun install --frozen-lockfile` (427 packages, ~42s, no lockfile drift):

| Command | Result |
|---|---|
| `git status` | Clean before starting; branch `claude/initial-technical-assessment` created off `assessment` (which carries the prior `.env` hygiene commit) |
| `git log --oneline --decorate -n 20` | 20 most recent commits are all on `main`/`origin/main`, authored by `gpt-engineer-app[bot]` co-authored by `mckevinayaba` — consistent with Lovable-driven history |
| `node --version` | v24.15.0 |
| `npm --version` | 11.12.1 (present but **not the repo's package manager**) |
| `bun --version` | 1.3.14 — **actual package manager**, per `bun.lock`/`bunfig.toml` |
| `bun install --frozen-lockfile` | ✅ 427 packages installed cleanly |
| `bun run lint` (`eslint .`) | Exits non-zero (9,086 reported problems), but **9,077 of 9,078 errors are `prettier/prettier "Delete ␍"` CRLF findings**, an artifact of this Windows checkout (`git config core.autocrlf=true` globally, no `.gitattributes` in the repo to pin LF — L-03). Isolated the real signal: **0 genuine ESLint errors, 8 legitimate `react-refresh/only-export-components` warnings** across `Button.tsx`, `Typography.tsx`, `index.ts`, `sidebar.tsx`, `chart.tsx`, `form.tsx` (cosmetic — components sharing a file with constants, not a bug) |
| `bun run build` (`vite build`) | ✅ Succeeds. Nitro/Cloudflare Workers output generated (`.output/server/wrangler.json`) |
| `bunx tsc --noEmit` | ✅ **Zero errors** — `strict: true` in `tsconfig.json`, and the codebase actually satisfies it |
| `bun audit` | 4 vulnerabilities (2 moderate, 2 low), **all in transitive dev-tooling** (`@babel/core` via router-plugin/vite-react, `brace-expansion` via eslint, `esbuild` via vite's `tsx`, `js-yaml` via eslint/xmlbuilder2) — none reachable from the shipped runtime bundle |

**No test or typecheck script exists in `package.json`** (`scripts`: `dev`, `build`, `build:dev`, `preview`, `lint`, `format` only) — confirmed missing, not hidden elsewhere; `tsc --noEmit` had to be invoked directly via `bunx` since there's no `typecheck` script wired up.

---

## 17. Testing assessment

**Observed.** Zero automated tests of any kind exist in this repository — no `*.test.*`, no `*.spec.*`, no `__tests__` directory, and no CI workflow (`.github/` doesn't exist) to run anything even if tests were added. Every claim in this report about RLS/authorization behaviour was established by static reading of the SQL and TypeScript, not by executing a test suite — this is a meaningfully weaker guarantee than a passing test would provide, and it's exactly why C-01/C-02 were never caught.

**Recommendation — minimum testing architecture before Stage 2** (deliberately small, not an enterprise test pyramid):

1. **RLS/policy tests** (highest priority, directly would have caught C-01–C-04): a small script using `pgTAP` or plain SQL run against a local Supabase instance (`supabase start`), asserting — as two different simulated JWTs (`auth.uid()` set via `SET request.jwt.claims`) — that a customer cannot set their own `verification_status`, an operator cannot set their own `application_status`, and a non-admin cannot write `pilot_configuration`/`audit_logs` with a forged `actor_role`.
2. **Server-function unit tests**: call `reviewOperatorApplication`/`grantUserRole`/`upsertOperatorApplication`/`submitCustomerVerification` directly with mocked `context.userId` values covering each adversarial scenario in §10's table.
3. **One smoke E2E test** (Playwright) covering: sign up → onboarding → customer verification submit → (as a seeded admin) approve → dashboard reflects approval. This is the one flow that, if it silently breaks, breaks the entire pilot.

Do not reach for a broader framework than this yet — per the brief's own guidance, this is pilot-stage, not national-scale.

---

## 18. Scalability assessment

| Tier | Assessment |
|---|---|
| **Pilot** (50 operators / 500 customers / 3,000 requests) | Current schema and indexing handle this trivially on Supabase Postgres. Nothing here needs to change for pilot scale — this is correctly *not* over-engineered. |
| **Early scale** (1,000 operators / 50,000 customers / hundreds of thousands of requests) | Still comfortably within Postgres/Supabase's normal operating envelope. The fixes in §20 (C-01–C-04, H-01–H-03) become materially more urgent here purely because the blast radius of a self-approval bug scales with user count — fix before this tier, not at it. |
| **National network** (tens of thousands of operators, millions of customers, high-volume matching) | Out of scope for this report by design (Stage 2+ concern), but worth flagging now: `operator_businesses.gps_lat`/`gps_lng` are plain `NUMERIC` columns with no spatial index (no PostGIS extension in use). Fine for ~50 operators; a real "nearby operator" matching engine at national scale would need PostGIS + a spatial index, and a synchronous request/response matching loop built directly on RLS-scoped client queries (rather than a dedicated server-side matching worker) **must never be the architecture for high-volume concurrent matching** — that's the one thing from the brief's own list worth restating here, because it would be an easy trap to fall into by extending the current per-request client-query pattern instead of introducing a proper matching service when the time comes. |

---

## 19. Technical debt register

| ID | Severity | Location | Explanation | Consequence | Remediation | When |
|---|---|---|---|---|---|---|
| TD-01 | Critical | `customer_profiles`/`operator_businesses` UPDATE RLS | No column-level restriction on owner-writable columns | Verification integrity is not currently enforceable | Split privileged columns into an admin-only-writable table, or add a `BEFORE UPDATE` trigger rejecting changes to protected columns from non-admin sessions | Before Stage 2 |
| TD-02 | Critical | `operators.functions.ts:50-129` | No current-status check before overwrite | Suspended/rejected operators can self-reinstate | Add a server-side status-transition guard (allow-list of valid `(from, to)` pairs) | Before Stage 2 |
| TD-03 | Critical | `admin.functions.ts` (missing) | Suspension doesn't revoke `user_roles`/`operator_staff.active` | Suspended operators keep full access | Add role/staff-active revocation to `reviewOperatorApplication` on `suspended`/`deactivated`/`rejected` | Before Stage 2 |
| TD-04 | High | `supabase/migrations/20260718061532...sql` | `REVOKE EXECUTE` on RLS-dependent functions from `authenticated` | Non-owner RLS branches likely error instead of deny; audit-trail writes may silently fail | Re-grant `EXECUTE` on the four functions to `authenticated`; verify against live project | Before Stage 2 |
| TD-05 | High | `audit_logs` INSERT policy | Any authenticated user can write arbitrary `actor_role`/`action`/`metadata` | Audit trail is forgeable | Restrict INSERT to service role only; derive `actor_role` server-side | Before Stage 2 |
| TD-06 | High | Storage bucket provisioning | Buckets not created in migrations | Not reproducible; risk of accidental public bucket | Commit bucket creation + size/MIME limits to migrations | Before pilot scale-up |
| TD-07 | High | Document upload paths | No server-side file-type/size validation | KYC pipeline accepts arbitrary files | Add bucket-level `file_size_limit`/`allowed_mime_types` + server re-validation | Before pilot scale-up |
| TD-08 | Medium | `admin.tsx`/`admin.operators*.tsx` | Admin gating is `useEffect`-based, not `beforeLoad` | Inconsistent with stated "don't trust the frontend" rule; currently backstopped by RLS | Move check into `beforeLoad` with a server-verified role | Before Stage 2 |
| TD-09 | Medium | Everywhere | Zero automated tests, no CI | Regressions (including TD-01–03) ship silently | Minimum RLS + server-fn test suite (§17) | Before Stage 2 |
| TD-10 | Medium | `admin.tsx:92`, `operator.dashboard.tsx:136,154` | "Stage 2" language visible to real users | Undermines "premium, infrastructure-grade" positioning; violates the project's own no-internal-language rule | Rewrite copy | Anytime, low effort |
| TD-11 | Low | Repo root | No `.gitattributes` | CRLF/LF churn on Windows checkouts inflates lint noise (9,077 false-positive errors observed) | Add `.gitattributes` with `* text=auto eol=lf` | Anytime, low effort |
| TD-12 | Low | `package.json` | No `typecheck`/`test` scripts | `tsc`/tests aren't part of any standard workflow | Add `"typecheck": "tsc --noEmit"` at minimum | Anytime, low effort |

---

## 20. Security findings

### CRITICAL

**C-01 — Customers can self-approve their own KYC verification.**
- **Location:** `supabase/migrations/20260718061518_4f1b981e...sql:96-97` (`"Customer updates own record"` policy); sensitive columns added in `supabase/migrations/20260718064316_cf337c34...sql:2-13`.
- **Evidence:** `FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)` — no column list restricts which fields can change.
- **Exploit scenario:** any signed-in customer runs, from the browser console: `supabase.from('customer_profiles').update({ verification_status: 'approved' }).eq('user_id', (await supabase.auth.getUser()).data.user.id)`. This passes RLS. The customer is now "Verified" per `customer.tsx:67-68`, bypassing manual review entirely.
- **Blocks Stage 2:** Yes — Stage 2 cash requests will almost certainly gate on this exact field.
- **Fix:** move `verification_status`, `reviewed_by`, `reviewed_at`, `review_notes` to a table/columns writable only by the service role, or add a `BEFORE UPDATE` trigger that rejects changes to these columns unless the session role is admin.

**C-02 — Operators can self-approve their own business application.**
- **Location:** `supabase/migrations/20260718061518...sql:161-162` (`"Owner updates business"` policy).
- **Evidence:** Same pattern as C-01, applied to `operator_businesses.application_status`/`reviewed_by`/`reviewed_at`/`review_notes`.
- **Exploit scenario:** the exact adversarial case named in the assessment brief — an operator directly PATCHes their own `operator_businesses` row to `application_status: 'approved'`.
- **Blocks Stage 2:** Yes.
- **Fix:** same pattern as C-01.

**C-03 — `upsertOperatorApplication` doesn't check current application status before overwriting.**
- **Location:** `src/lib/operators.functions.ts:50-129`.
- **Evidence:** The handler reads `business_id` and blindly `.update(record).eq("id", businessId).eq("owner_id", userId)` with no read of the existing `application_status` first. The only gate against editing an already-reviewed application is a **client-side** `locked` `useMemo` in `src/routes/_authenticated/operator.apply.tsx:153-159`, which merely hides the form — it does not stop the underlying server-function call.
- **Exploit scenario:** a rejected or suspended operator calls the same `upsertOperatorApplication` server function their own dashboard already uses (no new endpoint needed), resetting `application_status` to `submitted` and rewriting every business field, including identity/terminal details.
- **Blocks Stage 2:** Yes.
- **Fix:** read current `application_status` server-side first; reject the write (or route it to a different, narrower "amend" path) unless status is `draft` or `info_requested`.

**C-04 — Suspending/rejecting an operator does not revoke role or dashboard access.**
- **Location:** `src/lib/admin.functions.ts:33-80` (`reviewOperatorApplication` — only ever writes `operator_businesses`).
- **Evidence:** No code path anywhere in the repository writes to `user_roles` or sets `operator_staff.active = false` in response to a `suspended`/`deactivated`/`rejected` decision.
- **Exploit scenario:** the exact adversarial case named in the brief — "a suspended operator continues accessing protected operator routes." Combined with C-03, they can also self-reinstate.
- **Blocks Stage 2:** Yes.
- **Fix:** on `suspended`/`deactivated`/`rejected` decisions, deactivate the corresponding `operator_staff` rows and consider whether `operator_owner` should be revoked from `user_roles` or merely gated by a status check on every protected route/server-fn.

### HIGH

**H-01 — `REVOKE EXECUTE` on RLS-dependent helper functions likely breaks non-owner access paths and silent-fails an audit write.**
- **Location:** `supabase/migrations/20260718061532_b9120853...sql:2-5`.
- **Evidence:** Revokes `EXECUTE` on `has_role`, `is_admin`, `is_business_member`, `handle_new_user` from `PUBLIC, anon, authenticated`. These functions are called inside `USING`/`WITH CHECK` clauses that the `authenticated` role must itself be able to invoke for any branch of a policy that reaches them (EXECUTE privilege is required to call a function regardless of `SECURITY DEFINER`, which only changes whose privileges the function body runs *with*, not whether it can be called). Concretely, in `src/lib/admin.functions.ts:62-68`, `await supabase.from("verification_reviews").insert(...)` runs through the RLS-scoped client; that table's INSERT policy (migration 1, line 219-221) requires `is_admin(auth.uid())` in its `WITH CHECK`, and this call's **returned error is never checked** — unlike the `operator_businesses` update three lines above it, which does check.
- **Failure scenario:** every operator-application review recorded via the admin UI silently fails to write its `verification_reviews` row (the review history panel at `admin.operators.$id.tsx:181-206` would show fewer entries than actual decisions made), while the function still returns `{ ok: true }` to the caller.
- **Status:** I could not verify this against the live database (no service-role credentials used or available in this assessment) — this is a precise reading of the committed SQL and calling code, labelled **Inferred**, and should be confirmed against the live project before being treated as certain.
- **Fix:** `GRANT EXECUTE ON FUNCTION public.has_role, public.is_admin, public.is_business_member TO authenticated;` (re-grant what migration 2 revoked), then confirm `verification_reviews` rows are actually being written for real reviews.

**H-02 — `audit_logs` is writable, with an unconstrained `actor_role`, by any authenticated user.**
- **Location:** `supabase/migrations/20260718061518...sql:263-264`.
- **Evidence:** `WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL)` — no constraint on `actor_role`, `action`, or `metadata` content.
- **Failure scenario:** any signed-in user can insert a row claiming, e.g., `actor_role: 'super_admin', action: 'role.granted'`, independent of what actually happened — undermining "every decision is audited" (stated on the admin console itself, `admin.tsx:66`).
- **Fix:** restrict `audit_logs` INSERT to the service role only; have every server function log through `supabaseAdmin` instead of the RLS-scoped client; derive `actor_role` server-side from the caller's real `user_roles` row.

**H-03 — Storage buckets are not provisioned in version control.**
- **Location:** absent from `supabase/` entirely (checked via grep across all migrations for `storage.buckets`/`INSERT INTO storage`/bucket-config — no matches).
- **Failure scenario:** replaying migrations against a fresh project leaves both buckets nonexistent until manually recreated; if either bucket is ever manually toggled public, none of the RLS policies in migrations 3–4 apply, because public-bucket objects bypass policy checks entirely.
- **Fix:** commit bucket creation (with `public: false`, `file_size_limit`, `allowed_mime_types`) as an explicit migration.

**H-04 — No server-enforced file-type/size limits on KYC document uploads.**
- **Location:** `src/routes/_authenticated/customer.tsx:300-322` (upload handler); no equivalent validation found for operator documents either.
- **Evidence:** only the HTML `accept` attribute (`FileField` component, `customer.tsx:397-408`) constrains file selection — a client-side hint, not enforcement.
- **Fix:** bucket-level `allowed_mime_types`/`file_size_limit` (ties to H-03), plus a server-side content-type/size check before persisting the path.

**H-05 — Admin route protection is client-side (`useEffect`), not `beforeLoad`.**
- **Location:** `src/routes/_authenticated/admin.tsx:17-20`, `admin.operators.tsx:33-36`, `admin.operators.$id.tsx:42-45`.
- **Evidence:** all three redirect non-admins via a post-render `useEffect`, unlike `_authenticated/route.tsx:6-10`, which correctly gates in `beforeLoad`. Data reads on these pages remain RLS-protected today (verified: a non-admin's `operator_businesses`/`verification_reviews` queries return empty under the existing policies), so this is not currently a data leak — but it's an inconsistent enforcement layer that becomes a real gap the instant a future read on these pages isn't as tightly scoped.
- **Fix:** move the admin check into `beforeLoad`, sourced from a server-verified role rather than the client-side `useAuth()` cache.

### MEDIUM

- **M-01** — `id_document_path`/`selfie_path` accepted as opaque client-supplied strings with no server-side reconciliation against an actual upload event (`customer.functions.ts:12-14`). Storage RLS still independently protects read access, so this is a data-integrity gap, not an access-control one.
- **M-02** — `operator_documents` INSERT/DELETE require literal `owner_id` (migration 1, lines 193-199), while SELECT extends to staff via `is_business_member` — invited managers can view but not upload/manage documents. Likely a product gap versus a security issue; needs a decision on whether managers should have upload rights.
- **M-03** — `grantUserRole` allows granting `operator_owner` to any `target_user_id` with no check that a corresponding business relationship exists (`admin.functions.ts:82-115`). Low risk (super_admin-only), worth tightening once the staff-invite flow is built.
- **M-04** — Internal "Stage 2" language visible in production UI: `admin.tsx:92`, `operator.dashboard.tsx:136,154`.
- **M-05** — Public homepage describes unbuilt features as if active: "secure transaction code," "confirm only after receiving cash," "report a problem in-app and pause the operator instantly," "track requests, earnings and platform fees" (`src/routes/index.tsx:325,362,400`).

### LOW

- **L-01** — `.env` was previously committed to git history; already remediated in this session's prior hygiene commit (untracked, `.gitignore` updated, `.env.example` added). No further action needed.
- **L-02** — `bun audit`: 4 low/moderate vulnerabilities, all in transitive dev-tooling (`@babel/core`, `brace-expansion`, `esbuild`, `js-yaml`), none reachable from the shipped runtime bundle.
- **L-03** — No `.gitattributes`; combined with common Windows `core.autocrlf=true` defaults, inflates `eslint`/`prettier` output with CRLF noise (confirmed: 9,077 of 9,078 reported lint errors in this assessment were this artifact, not real issues).
- **L-04** — Signup flow reveals "account already exists" on duplicate email (`auth.tsx:57-60`) — mild enumeration signal, standard Supabase SDK pattern, low severity.

---

## 21. What impressed me

- Every privileged write I checked derives the caller's identity from a server-verified JWT (`requireSupabaseAuth`), never from client-supplied fields — this is the hardest part of "don't trust the frontend" to get right, and it's consistently done correctly at the *role-check* level (just not at the *state-transition* level — see C-01–C-04).
- `ops_admin` vs `super_admin` separation is real and correctly enforced at both the server-function layer (`grantUserRole` literal-checks for `super_admin`) and the RLS layer (`pilot_configuration` writes require `has_role(..., 'super_admin')` specifically, not the broader `is_admin`) — the exact adversarial scenario "an ops admin performs a super-admin action" is genuinely blocked.
- TypeScript strict mode passes with zero errors, and the build is clean — for a codebase with no CI enforcing this, that's a real, verified signal of care, not luck.
- No card data, no wallet, no SARB/licensing language anywhere — the stated non-payment-processor boundary is genuinely respected in code, which is the harder (and more important) version of respecting it in the pitch deck.
- Zod validation on every server-function input is specific to the domain (SA mobile-number regex, ID-document enum, length caps) rather than generic pass-through.

---

## 22. What concerns me most

1. **The verification trust boundary is not currently trustworthy** (C-01, C-02) — this is the product's entire stated differentiator, and it's currently bypassable by the exact parties it's meant to vet.
2. **Suspension doesn't suspend anything** (C-03, C-04) — a safety mechanism that doesn't remove access isn't a safety mechanism.
3. **The audit trail — CashNear's own stated defense for "trust must be engineered" — can be forged and may be silently incomplete** (H-01, H-02).
4. **Zero automated tests** mean none of the above would be caught by anything except a manual read like this one; the next Lovable-generated change could reintroduce any fixed version of these bugs without anyone noticing.
5. **Public-facing promises exceed built capability** (M-05) — low technical severity, but it's the kind of gap that erodes exactly the "trust is the product" positioning the homepage itself uses.

---

## 23. What I would have designed differently

Not a rewrite critique — the shape is right. Two specific choices I'd have made differently, stated as preference with trade-offs, not as "this is wrong":

- I would have put admin-mutable fields (`application_status`, `reviewed_by`, `reviewed_at`, `review_notes`) in a **separate table** from the operator/customer-owned fields from the start, rather than co-locating them in the same row with a single ownership-based RLS policy. Trade-off: more joins for reads, but it makes "who can write what" structurally obvious instead of relying on remembering to add column-level restrictions after the fact — which is precisely what didn't happen here.
- I would have written the `verification_reviews`/`audit_logs` inserts through the **service-role client**, not the RLS-scoped one, from the start — server functions have already established authorization by the time they reach the audit-write step, so routing that write through RLS at all only adds a failure mode (H-01) without adding security.

---

## 24. Stage 2 readiness decision

**Ready for Stage 2 after specified fixes.**

The foundation is not broken — authentication is solid, most authorization is correctly server-enforced, the schema is sensible, the build is clean, and the non-payment boundary is genuinely respected. But Stage 2 (matching, transactions, verification codes) would be built directly on top of the exact fields that C-01 through C-04 leave unprotected, and H-01/H-02 mean the audit trail Stage 2 would rely on for dispute resolution isn't yet reliable. Shipping Stage 2 before fixing these would mean building a transaction system on top of an identity layer that can currently be self-certified — that's not a risk worth taking for a product whose entire pitch is trust.

None of C-01–C-04 or H-01–H-03 require architectural change — they're targeted RLS/trigger/server-function fixes, estimated in days, not weeks.

---

## 25. Recommended implementation order

1. **Fix C-01, C-02** (column-restricted RLS or trigger guard on `customer_profiles`/`operator_businesses` privileged columns) — highest priority, smallest blast radius to fix.
2. **Fix C-03** (status-transition guard in `upsertOperatorApplication`) and **C-04** (revoke role/staff access on suspension) together — they're the same underlying "suspension must actually suspend" property.
3. **Verify and fix H-01** (re-grant EXECUTE; confirm `verification_reviews` is actually populating in the live project) — do this early since it may be silently corrupting the audit trail right now.
4. **Fix H-02** (route `audit_logs` writes through service role only).
5. **Add the minimum RLS + server-function test suite** (§17) — write these tests *against* the fixes above so they lock in the corrected behaviour, not just document it.
6. **H-03/H-04** (bucket provisioning + upload validation) — do before any real pilot document volume arrives.
7. **H-05, M-01–M-05** (route-guard consistency, copy fixes) — low effort, do opportunistically alongside the above.
8. Resolve the founder/legal questions in §3 (fee-collection mechanism, ID-number retention policy, real Terms/Privacy content) — these gate Stage 2 *design*, not Stage 1 code.
9. Then, and only then, scope Stage 2.

---

## 26. Ninety-day technical roadmap

**Weeks 1–2:** C-01–C-04 fixes + H-01 verification/fix, deployed and manually re-verified against every adversarial scenario in §10's table.
**Weeks 2–4:** Minimum test suite (§17) covering the fixed behaviour; H-02 (audit log lockdown); H-03/H-04 (storage hardening); `.gitattributes` + `typecheck` script (cheap wins).
**Weeks 4–6:** Resolve founder/legal open questions (§3); write real Terms/Privacy content; decide the fee-collection model for Stage 2.
**Weeks 6–10:** Stage 2 design — request/matching data model, with the fixed verification fields as a hard dependency; add CI running lint/typecheck/tests on every PR (currently nothing runs automatically).
**Weeks 10–13:** Stage 2 implementation begins, scoped to the pilot's actual 50-operator/500-customer/3,000-request target — resist adding matching-at-scale infrastructure (PostGIS, worker queues) until real pilot data shows it's needed.

---

## 27. Founder decisions required

- How does CashNear collect its platform fee during the pilot, given it cannot touch the payment rail? (§3)
- What is the intended retention policy for KYC documents/ID numbers, especially for rejected applicants? (§3, §14 — also requires legal input)
- Should the homepage's Stage-2-implying copy be scoped back to match current capability, or is it intentionally describing target state to pilot-recruit ahead of build? (§3, M-05)
- Should `operator_manager` staff be able to upload/delete business documents, or is that intentionally owner-only? (M-02)
- What should happen to a user's audit-log/document history if they request account deletion? (§8, POPIA-adjacent — also requires legal input)
