# Founder Demonstration Guide

Internal, private document. **No passwords, production keys, or other
credentials are written here on purpose.** Demo-account credentials live only
in the git-ignored `.env.demo-accounts.local` file in the project root —
never in this doc, never committed, never shared beyond the founder.

This guide walks through a full, safe demonstration of CashNear's Stage 1
flows using **synthetic accounts only** — no real customer or operator data
is ever touched.

## Before you start

- **Where to run this**: locally, via `bun run dev` (this connects to the
  staging Supabase project already configured in `.env.local` — not
  production). If a hosted staging preview URL exists in your Lovable
  dashboard, you can use that instead; the flow below is identical either
  way.
- **Accounts involved**:
  - Your own founder account, with `super_admin`. See
    [`ENVIRONMENT_REQUIREMENTS.md`](ENVIRONMENT_REQUIREMENTS.md) for how
    roles are governed; you set your own password via the normal sign-up /
    password reset flow — nobody else ever sees or sets it.
  - The synthetic **demo customer** (`demo-customer@cashnear-demo.test`).
  - The synthetic **demo operator** (`demo-operator@cashnear-demo.test`).
  - Credentials for the two demo accounts: open `.env.demo-accounts.local`
    locally.
- **Isolation**: use a private/incognito window per role (or separate
  browser profiles) so you can be signed in as founder, demo customer, and
  demo operator at the same time without constantly signing out.

## Walkthrough

### 1. Sign in as founder (super_admin)

Open a normal browser window, go to `/auth`, and sign in with your own
founder account. You should land on `/admin` and see the Operations Control
Centre, including a **Founder demo controls** section near the bottom (only
visible to `super_admin`).

### 2. Sign in as the demo customer

Open a private/incognito window, go to `/auth`, and sign in with the demo
customer credentials from `.env.demo-accounts.local`.

### 3. Demonstrate customer verification

From the demo customer's account, go through the identity verification form:
full name, mobile number (try `+27 82 123 4567` to show the international
format support), ID type/number, and upload two small placeholder
files (any harmless JPG/PNG — **never a real ID photo**) for the ID document
and selfie steps. Submit.

### 4. Sign in as the demo operator

Open a second, separate private window/profile, go to `/auth`, and sign in
with the demo operator credentials.

### 5. Demonstrate operator registration

Walk through the operator application form: business details, representative
identity details, and upload placeholder documents for the required proofs
(again, harmless placeholder files only). Submit the application.

### 6. Switch back to the founder window

In your founder session, go to `/admin/customers` — the demo customer's
submission appears in the queue, labelled **Demo**. Open it and approve it.
Then go to `/admin/operators` — the demo operator's application appears,
also labelled **Demo**. Open it and approve it.

### 7. Show the operator dashboard

Switch to the demo operator's window and refresh `/operator/dashboard`. It
now shows **"Your business is approved"**, with the honest next-step
messaging: cash requests are not open yet, CashNear is preparing the first
group of businesses, and will make contact before requests begin. Point out
that no launch date or income figure is shown or implied anywhere.

### 8. Explain: cash requests are not open yet

This is the natural stopping point for a Stage 1 demo — customer-facing cash
requests and operator payout handling are future work, not yet built. Both
the operator dashboard and the customer side are honest about this rather
than implying the feature exists.

### 9. Reset the demo data afterwards

Back in the founder's `/admin` window, use the **Founder demo controls**
section: **Reset demo customer** and **Reset demo operator**. Confirm each.
This deletes the demo accounts' submitted data and uploaded placeholder
documents (and revokes the demo operator's business/role grant), returning
both accounts to a blank, freshly-signed-up state — ready for the next
demonstration. This can only ever affect these two designated demo accounts,
never a real customer or operator.

## If something goes wrong mid-demo

- If a demo account's data is confusing partway through, you can reset just
  that one account via the same admin controls — no need to restart from
  the founder step.
- If a step throws a rate-limit message ("Too many attempts..."), wait a few
  minutes — this is the same server-side protection real users get, applied
  evenly to demo accounts too. It resets in 10 minutes for most actions.
