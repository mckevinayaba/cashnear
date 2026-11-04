# How CashNear is managed, and how it gets paid

Internal. Written for the founder.

## What the team can see and do today

All of it is under `/admin`, behind the admin role, with one tab strip across
the top.

| Tab | What it is for |
|---|---|
| Overview | The doorway. Counts of shops and customers waiting for review. |
| Business | The weekly number, the funnel, people, shops, money, and how each shop is doing. |
| Transactions | Every cash request. Search, filter, open a row, export to a file. |
| Shops | Review and approve shops. Enrol an approved shop into the pilot, add its landmark and photo. |
| Customers | Review optional identity details someone chose to send. |
| Cash controls | Open or close the payment route, resolve reports, clear a paused shop. |
| Audit | Every privileged action, who did it, when. Read only. |

### The one number

The north star is **cash collections the customer confirms as received, each
week** (`.lovable/north-star/north-star.md`). The Business tab leads with it,
next to last week's.

Everything else on that page explains the number:

- Asked → shop said yes → collected, so you can see where requests are lost.
- Shop did not answer, cancelled, ran out of time: the three ways a request
  fails without anyone being at fault.
- Under review: the shop marked it done but the customer never confirmed. These
  need a person, and the page puts them at the top.
- People: joined, got cash, came back. "Came back" (two or more collections) is
  the early signal that this is a habit and not a novelty.
- Shops: approved, in the pilot, online now.

### The ledger

Transactions lists every request with the amount, both fees, the shop, the
customer, the **payment slip number** the shop typed from its own payment
device, and how long the shop took to say yes. The slip number is what lets you
match a row to the payment partner's statement.

It never shows a completion code or the two words.

Exporting writes a CSV and writes a line to the audit log (who, when, how many
rows, which filters). A single export is capped at 2000 rows; the screen says
so when it was cut short. Names and emails from customers are made safe for
spreadsheets (a value that starts with `=`, `+`, `-` or `@` is stored as text),
so opening an export cannot run anything.

## How CashNear gets paid

**This is a business decision. Software does not decide it.** What the software
does is record exactly what happened, so that whichever model you choose can be
invoiced and defended.

The key fact: **CashNear never touches the cash-out money.** The customer pays
the shop on the shop's own payment device, through the payment partner. So
CashNear is not paid out of the transaction unless someone agrees to send it a
share. There are three realistic ways.

### 1. The payment partner pays CashNear for each cash-out it brings

A referral or agent commission, agreed in writing with the partner and paid to
CashNear on a statement, usually monthly. This is the cleanest:

- The customer's fee does not change.
- CashNear never holds anyone's money.
- It grows with volume.

It needs a partner agreement, and the partner decides the rate. Nothing in this
repository can create it. This is the one to pursue first.

### 2. Shops pay CashNear

A small monthly fee, or a small fee per collected request, invoiced to the
shop. This works without the partner, but it asks a shopkeeper to pay before
they have seen income, so it is a harder sell in a pilot. If it is ever
introduced, introduce it only after a shop has seen its own results.

### 3. CashNear adds its own fee to the customer's cost

Possible, but only if the customer's payment can be split at source, so the fee
reaches CashNear without CashNear collecting the money. If CashNear itself
collects and passes on money, it is handling funds, and that needs legal advice
on licensing and anti-money-laundering rules **before** it is built. Do not
build this by default.

### Recommendation

1. Keep the fee at **R0** through the pilot. The pilot exists to prove the
   north-star number, not to earn.
2. Open the partner conversation now, with real numbers from the Business tab as
   evidence: collections per week, repeat customers, how fast shops answer.
3. Decide the model only once there is volume to argue with.
4. Do not promise shops any income. The shop-facing screens say none, and a
   test keeps it that way.

## What is already built for getting paid

- Every request stores the partner fee and CashNear's fee **as they were when
  the request was made**, so changing a price later never rewrites history.
- Prices live in `cash_fee_schedule`. Setting a CashNear fee above R0 is a data
  change, not a code change.
- The Business tab shows "CashNear has earned" (the sum of CashNear fees on
  collected requests) and, separately, what customers paid their bank or
  wallet, which is **not** CashNear's money.
- The ledger export carries every line an invoice or a partner reconciliation
  needs.

## What is not built

- **Settlement tracking:** recording that a given month was invoiced and paid,
  with a reference. Build it once a real agreement exists and the payment
  mechanics are known. Building it before then would mean guessing the mechanics.
- **Shop statements:** a monthly summary a shop can see of its own collections.
- **Shop-side Activity:** a shop's own request history in its app.
- **Roles below admin for finance:** today `ops_admin` and `super_admin` can
  both read the ledger. If someone in finance is hired, give them a narrower
  role rather than full admin.
