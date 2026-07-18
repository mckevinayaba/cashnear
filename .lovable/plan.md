# CashNear Stage 1 — Foundation Build Plan

Stage 1 only. No request/matching, no transactions, no fees, no incidents. Stop and report before Stage 2.

## 1. Audit of current codebase

Current state:
- TanStack Start scaffold, dark navy + ivory + gold design tokens in `src/styles.css`, Instrument Serif + Geist fonts loaded in `__root.tsx`.
- Design-system primitives in `src/components/ds/` (AppShell, BottomNav, Button, Card, Typography).
- Five customer-only routes: `/`, `/activity`, `/earn`, `/get-cash`, `/profile`, plus `sitemap.xml`.
- No Supabase, no auth, no database, no roles, no operator/admin surfaces.

Retain: design tokens (`styles.css`), typography setup, `AppShell`/`Card`/`Button`/`Typography`, currency helper (`src/lib/currency.ts`), error handling in `src/server.ts` and `__root.tsx`.

Refactor: `/` becomes a public landing with role-aware CTA. `AppShell` gains a `desktopWide` sidebar variant for admin/operator desktop surfaces (partially there already).

Remove: `/earn` (operator pitch page — replaced by real operator app), `/get-cash` (Stage 2), `/activity` in current shape (replaced by role-scoped activity later). Bottom nav rebuilt per role.

Risks: TanStack Start SSR + Supabase session (localStorage) — protected routes must live under `_authenticated/` with `ssr: false` (integration-managed). Service role never touches client. All fee/state logic will be backend-enforced in later stages.

## 2. Enable Lovable Cloud

Enable Cloud (Supabase under the hood) to get Postgres, Auth, Storage, and server-side clients wired by the template. Configure email/password auth. Prepare for later phone auth. No social sign-in in Stage 1.

## 3. Database schema (Stage 1 subset)

Enums:
- `app_role`: `customer`, `operator_owner`, `operator_manager`, `operator_cashier`, `ops_admin`, `super_admin`
- `verification_status`: `unverified`, `pending`, `approved`, `rejected`, `suspended`
- `operator_application_status`: `draft`, `submitted`, `under_review`, `info_requested`, `site_verification_required`, `approved`, `rejected`, `suspended`, `deactivated`
- `document_type`: `id_document`, `business_registration`, `proof_of_address`, `bank_confirmation`, `terminal_proof`, `premises_photo`, `signage_photo`, `other`
- `terminal_provider`: `yoco`, `ikhokha`, `fnb`, `standard_bank`, `nedbank`, `absa`, `kazang`, `flash`, `other`
- `sa_province`: 9 SA provinces
- `audit_action`: generic string (kept as text with check).

Tables (Stage 1 only — later stages add the rest):

```text
profiles(id=auth.users.id, full_name, mobile, email, created_at, updated_at)
user_roles(id, user_id -> auth.users, role app_role, granted_by, granted_at, unique(user_id, role))
customer_profiles(user_id PK -> profiles, verification_status, saved_suburb, notes, created_at, updated_at)
operator_businesses(id, owner_id -> auth.users, legal_name, trading_name, business_type,
    registration_number, tax_number, years_operating, description,
    street_address, suburb, city, province sa_province, postal_code, gps_lat, gps_lng,
    premises_type, terminal_provider, terminal_model, estimated_mdr,
    application_status, submitted_at, reviewed_at, reviewed_by,
    review_notes, created_at, updated_at)
operator_staff(id, business_id -> operator_businesses, user_id -> auth.users,
    role app_role, invited_by, active bool, created_at, unique(business_id, user_id))
operator_documents(id, business_id, uploaded_by, doc_type document_type,
    storage_path, original_filename, mime_type, size_bytes, uploaded_at, notes)
verification_reviews(id, business_id, reviewer_id, from_status, to_status,
    decision_note, created_at)
pilot_configuration(id, key unique, value jsonb, description, updated_by, updated_at)
audit_logs(id, actor_id, actor_role, action text, entity_type, entity_id,
    metadata jsonb, ip, user_agent, created_at)
```

All tables: `GRANT` for `authenticated` + `service_role`; RLS enabled; policies scoped by `auth.uid()` and `public.has_role(uid, role)` security-definer function (roles table is NEVER read by policies on itself directly).

Seed `pilot_configuration` with default pilot values (Johannesburg corridor, max R2000, code TTL, etc.) marked as pilot assumptions.

## 4. Storage

Private bucket `operator-documents`. RLS on `storage.objects`:
- Owner + business staff (owner/manager) can read their own docs.
- `ops_admin` and `super_admin` can read all.
- Only owner/manager can insert into their own business path `business_{id}/...`.
- No public access. No signed URLs generated to unauthenticated users.

## 5. Routes

Public:
- `/` — landing with role-aware CTA (Sign in / Continue as customer / Operator application / Admin console)
- `/auth` — sign in + register (email/password), reset password
- `/reset-password` — set new password on recovery
- `/apply` — operator public entry (redirects to authenticated wizard once signed in)
- `/legal/terms`, `/legal/privacy`, `/legal/operator-agreement` — plain content pages

Authenticated (`src/routes/_authenticated/` — integration-managed gate):
- `/_authenticated/home` — customer shell (verification status, placeholder for Stage 2 request entry)
- `/_authenticated/customer/profile`
- `/_authenticated/customer/safety` — safety centre content
- `/_authenticated/operator/application` — multi-step wizard (Business → Representative → Location → Payment → Operations → Documents → Agreements → Review)
- `/_authenticated/operator/dashboard` — shows application status; live dashboard is Stage 2
- `/_authenticated/operator/business` — business profile view/edit (locked fields after approval)
- `/_authenticated/operator/staff` — invite/manage cashiers/managers
- `/_authenticated/admin` — ops overview shell
- `/_authenticated/admin/verifications` — operator application queue (list + detail with document viewer + approve/reject/request-info/suspend actions, all audit-logged)
- `/_authenticated/admin/customers`
- `/_authenticated/admin/operators`
- `/_authenticated/admin/audit-log`
- `/_authenticated/super-admin` — role management, pilot configuration editor, feature flags

Role-based redirect after sign-in via a small server fn returning primary role.

## 6. Design system extensions

- Desktop admin shell: sidebar nav, dense data tables (new `DataTable` primitive), status pills, verification-progress stepper.
- Mobile: bottom nav becomes role-scoped (customer vs operator). Admin/super-admin is desktop-first.
- New primitives: `StatusBadge`, `Stepper`, `FormField`, `FileUpload`, `EmptyState`, `SidebarNav`, `PageHeader`.
- All copy uses R currency, SA suburbs, spaza shop language. No Naira, no USD, no emoji icons — Lucide only.

## 7. Security

- All privileged reads/writes via `createServerFn` with `requireSupabaseAuth`; admin actions gated via `has_role` check inside handlers before touching `supabaseAdmin`.
- No service key on client. No frontend-only role checks. Every state change writes an `audit_logs` row.
- `public.has_role` security-definer function, RLS on user_roles, no recursive policies.
- Sensitive documents behind private bucket + RLS + short-lived signed URLs generated server-side only for authorized viewers.

## 8. Demo data (via migration insert)

Seed accounts (Auth users seeded manually via a documented setup script — Auth admin creation happens post-migration through a super-admin bootstrap):
- 1 customer (verified), 1 customer (pending)
- 1 approved spaza operator (Soweto), 1 pending operator (Alexandra), 1 suspended (Tembisa)
- 1 ops admin, 1 super admin

Businesses, staff rows, documents metadata (files not uploaded — bucket present), and audit history seeded deterministically.

## 9. Stage 1 exit — report

After build, produce the completion report per spec §29 covering audit, architecture, DB, routes, flows, security, test accounts (labelled demo), testing steps, known limits, and change summary. Then stop.

## Out of scope for Stage 1 (explicit)

Request creation, matching, offers, verification codes, transaction state machine, ratings, incidents, fees, invoices, notifications delivery (in-app shell only), analytics dashboards, PWA install manifest hardening, accessibility audit sweep. All scaffolded in schema *only* when required by Stage 1; the rest lands in later stages.

---

Approve this plan and I'll execute Stage 1 end-to-end, then stop with the completion report.