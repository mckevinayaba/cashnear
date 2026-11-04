# Private demo: try the real cash flow on the live app

Internal. This walks you through the real flow end to end: a customer asks for
cash, a shop accepts, the handshake words and code, the shop's payment
reference, and the customer's confirmation. It uses your own test accounts and
a pretend shop. No passwords or keys are written here.

**Time:** about 20 minutes. **You need:** two browser profiles (or one normal
window and one private window) and access to the Lovable Cloud database tools
(or ask Lovable to run the SQL below for you).

## Read this first

- While the rail is open and the demo shop is online, **any signed-in user** who
  opens `/cash` could request from it. Keep the window short, use the demo shop
  only, and don't point real customers at `/cash` yet.
- The "Founder demo controls" on `/admin` (from the earlier pass) point at demo
  accounts that no longer exist. Ignore them. Use the cleanup SQL at the end.
- Nothing here changes any real shop or customer.

## 1. Create three accounts

On `/auth`, create accounts with three different emails. Plus-addressing works
(`you+shop@yourmail.com`, `you+customer@yourmail.com`):

1. **You (founder)**, to become super admin.
2. **Demo shop owner.**
3. **Demo customer.**

Choose your own passwords. Never share them or put them in a file. If sign-up asks you
to confirm your email, confirm each account from its inbox before continuing.

## 2. Make yourself super admin

Run this once in the database tools, replacing the email with the one you used
for account 1:

```sql
insert into public.user_roles (user_id, role, granted_by)
select u.id, 'super_admin', u.id
from auth.users u
where lower(u.email) = lower('YOUR_FOUNDER_EMAIL')
  and not exists (
    select 1 from public.user_roles r where r.user_id = u.id and r.role = 'super_admin'
  );
```

Sign out and back in. You should now reach `/admin`.

## 3. Register and approve the demo shop

1. Sign in as the **shop owner** (second browser profile) and go to
   `/operator/apply`. Fill the form with made-up details and upload any harmless
   placeholder files for the documents. Submit.
2. As **you**, open `/admin/operators`, open the shop, and **Approve** it.

## 4. Enrol the shop and open the rail

1. On the shop's page in `/admin/operators`, find **Cash holds pilot**. Enter
   the shop's latitude and longitude, then **Enrol shop**.
   - To demo with your real location, right-click your position in Google Maps
     and copy the coordinates.
   - The customer's phone must allow location, because the app needs it to find shops. There is no default area.
   - The shop must be within 6 km of the customer.
2. Go to `/admin/cash` and **Open rail**. The rail is labelled "Partner cash-out
   (pilot)" and the fee shows as an example, because no partner has confirmed a
   fee yet.

## 5. Put the shop online

As the **shop owner**, open `/operator/dashboard`. The **Cash desk** appears in
daylight mode. Choose how much cash you can offer, tick small notes if you like,
pick 1 hour, and **Start taking requests**.

## 6. Run the flow as the customer

As the **demo customer**, open `/cash`:

1. Choose an amount. A new customer is capped at **R200**.
2. **Find cash near me.** Allow location when the phone asks. If you decline, the app asks you to turn it on.
3. Tap **Keep R… for me** on the demo shop. You'll see the 90-second countdown.
4. As the shop owner, **Someone needs cash** appears with a sound (after you've
   tapped the page once). Tap **Yes, I will keep … for them**.
5. The customer now sees the 15-minute ring, the **two handshake words**, and
   the **6-digit code**. The shop sees the same two words.
6. As the shop, type the customer's code and a made-up payment reference
   (letters and numbers, 4 to 24 characters, for example `DEMO1234`). Try a
   wrong code first to see the attempt counter. **I gave the cash.**
7. As the customer, check the masked reference and tap **Yes, I got my cash**.

Also try: **Cancel**, a shop tapping **No**, letting the 90 seconds run out, and
**Report a problem** (a serious report pauses the shop; clear it from the shop's
page in `/admin/operators`, and resolve the report in `/admin/cash`).

## 7. Close up

1. As the shop owner, tap **Stop taking requests**.
2. As you, in `/admin/cash`, **Close rail**.
3. Optional cleanup, in the database tools:

```sql
-- finish anything left open
update public.cash_requests
   set status = 'cancelled', closed_reason = 'demo_cleanup'
 where status in ('awaiting_shop', 'held');
```

To remove the demo's cash records entirely (replace the emails):

```sql
delete from public.cash_incidents
 where request_id in (
   select id from public.cash_requests
   where customer_id in (select id from auth.users where lower(email) in (lower('YOUR_CUSTOMER_EMAIL')))
 );
delete from public.cash_requests
 where customer_id in (select id from auth.users where lower(email) in (lower('YOUR_CUSTOMER_EMAIL')));
```

The audit log keeps its entries on purpose.

## Before any real customer uses this

- A signed partner agreement, and a confirmed fee schedule (then set
  `fee_verified` and rename the rail).
- The legal opinion on staying outside the payment flow, and the POPIA work.
- Real shops, visited and enrolled by a person.
- A decision on who is made whole when something goes wrong at the till.
