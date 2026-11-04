# Cash holds pilot

Internal. How the cash hold engine works, how to switch it on, and how to test it.

## What it does

A customer asks for cash on the pilot rail (GoTyme via Flash). An enrolled,
approved shop confirms within 90 seconds and keeps the cash aside for 15
minutes. The customer collects it on the shop's own payment device. CashNear
never touches the cash-out money and charges nothing in the pilot.

Lifecycle: `awaiting_shop` → `held` → `awaiting_confirmation` → `completed`.
Other endings: `declined`, `expired`, `cancelled`, `disputed`, `needs_review`.

## Dark by default

Deploying the migrations changes nothing customers can see. Cash holds go
live only when **both** of these happen:

1. A **super admin** opens the rail: `/admin/cash` → Open rail. (The fee shown
   to customers is labelled "example" until `fee_verified` is set.)
2. **Ops** enrol an approved shop with its coordinates: the "Cash holds pilot"
   panel on the shop's page in `/admin/operators`.

Then the shop owner goes online from their dashboard.

## Rules (all editable in `pilot_configuration`)

| Key | Pilot value |
|---|---|
| `cash_max_amount_cents` | 50000 (R500) |
| `cash_starter_cap_cents` | 20000 (R200, until two clean completions) |
| `cash_hold_minutes` | 15 |
| `cash_accept_seconds` | 90 |
| `cash_review_minutes` | 120 (unconfirmed completion becomes a review case) |
| `cash_search_radius_m` | 6000 |

Fees live in `cash_fee_schedule` (partner fee and CashNear fee per amount band,
with an effective date). CashNear's share is R0. Changing a price is a data
change, not a code change, and requests already made keep the fee they were made
with.

## Safety properties (each has a test)

- Clients never read or write the request tables. Everything goes through
  database functions that take identity from `auth.uid()`, never an argument.
- The completion code is in its own table no client role can read, and is
  deleted when the request leaves its active states.
- A wrong code returns a result instead of raising, so the attempt counter is
  kept. Five wrong attempts lock completion for 10 minutes.
- One active request per customer, enforced by a unique index.
- A shop's cash is reserved under a row lock, so concurrent requests can never
  promise more than the shop offered.
- Searching above the customer's cap is refused, so amounts can't be probed to
  learn a shop's cash.
- A serious dispute pauses the shop for review; it does not suspend the
  business. Only ops can clear the pause.
- Shops see a customer's first name and a distance bucket. No phone, no
  location. Customer coordinates are never stored.
- Three missed requests in a row take a shop offline automatically.

## Testing

```sh
bun test src/lib/__tests__/cash-engine.test.ts src/lib/__tests__/db-baseline.test.ts
```

These start a throwaway local Postgres (the `embedded-postgres` dev dependency),
load a small Supabase stand-in, apply every migration in order, and run the
engine as real database roles. They need no Docker, no Supabase project and no
credentials, and cannot reach any real database.

## Not built yet

- Light, high-contrast shop screens for sunlight (the shop desk currently uses
  the dark theme).
- isiZulu and Sesotho, and SMS or WhatsApp accept links for shops. Today a shop
  must have the page open.
- Shop vouching for regulars, and phone-number login (accounts are still email).
- Admin MFA.
- Fee collection from shops. Revenue starts with a partner agreement.
