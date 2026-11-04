import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createUser, startTestDb, type TestDb } from "./helpers/pg-harness";

/**
 * Behavioural tests for the cash hold engine, run against a real Postgres as
 * real roles (authenticated / anon), through the same functions the app calls.
 */

let db: TestDb;
let ops: string;
let superAdmin: string;
let shopOwner: string;
let shop2Owner: string;
let shop: string;
let shop2: string;
let draftShop: string;
const customers: string[] = [];

const RAIL = "gotyme_flash";
const LAT = -26.2405;
const LNG = 27.9055;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsonb comes back parsed or as text depending on the driver
const j = (v: unknown): any => (typeof v === "string" ? JSON.parse(v) : v);

async function insertBusiness(owner: string, name: string): Promise<string> {
  const [row] = await db.sql`
    insert into public.operator_businesses (owner_id, trading_name, legal_name, suburb, city, street_address, application_status)
    values (${owner}, ${name}, ${name}, 'Orlando West', 'Johannesburg', '1 Vilakazi Street', 'approved')
    returning id
  `;
  return row.id as string;
}

async function enrol(business: string, lat = LAT, lng = LNG) {
  await db.as(
    ops,
    "authenticated",
    (tx) =>
      tx`select * from public.cash_enrol_point(${business}::uuid, ${lat}::float8, ${lng}::float8, 'Orlando West', true)`,
  );
}

async function goOnline(owner: string, business: string, bandCents = 50000, small = true) {
  return db.as(owner, "authenticated", async (tx) =>
    j(
      (
        await tx`select public.cash_set_availability(${business}::uuid, 120, ${bandCents}::int, ${small}::boolean) as r`
      )[0].r,
    ),
  );
}

async function create(
  customer: string,
  business: string,
  amount = 10000,
  idem = crypto.randomUUID(),
) {
  return db.as(customer, "authenticated", async (tx) =>
    j(
      (
        await tx`select public.cash_create_request(${business}::uuid, ${amount}::int, ${RAIL}, false, ${idem}, 600::int) as r`
      )[0].r,
    ),
  );
}

async function get(who: string, id: string) {
  return db.as(who, "authenticated", async (tx) =>
    j((await tx`select public.cash_get_request(${id}::uuid) as r`)[0].r),
  );
}

async function act(who: string, id: string, action: string, payload: object = {}) {
  return db.as(who, "authenticated", async (tx) =>
    j(
      (
        await tx`select public.cash_transition(${id}::uuid, ${action}, ${JSON.stringify(payload)}::text::jsonb) as r`
      )[0].r,
    ),
  );
}

async function resetShop(business: string) {
  await db.sql`update public.cash_requests set status = 'cancelled' where business_id = ${business} and status in ('awaiting_shop','held')`;
  await db.sql`update public.cash_points set missed_count = 0, paused_reason = null, online = true, online_until = now() + interval '2 hours', cash_band_cents = 50000, small_notes = true where business_id = ${business}`;
}

beforeAll(async () => {
  db = await startTestDb();
  ops = await createUser(db.sql, "ops@example.test", "Ops Admin");
  superAdmin = await createUser(db.sql, "super@example.test", "Super Admin");
  shopOwner = await createUser(db.sql, "shop1@example.test", "Thandi Dlamini");
  shop2Owner = await createUser(db.sql, "shop2@example.test", "Sipho Nkosi");
  for (let i = 0; i < 6; i++)
    customers.push(await createUser(db.sql, `c${i}@example.test`, `Customer ${i}`));
  await db.sql`insert into public.user_roles (user_id, role) values (${ops}, 'ops_admin'), (${superAdmin}, 'super_admin')`;
  shop = await insertBusiness(shopOwner, "Mama Thandi's Spaza");
  shop2 = await insertBusiness(shop2Owner, "Sipho Mini Market");
  [{ id: draftShop }] =
    await db.sql`insert into public.operator_businesses (owner_id, trading_name, application_status) values (${customers[5]}, 'Draft shop', 'draft') returning id`;
}, 180_000);

afterAll(async () => {
  await db?.stop();
});

describe("dark by default", () => {
  test("nothing is bookable before a rail is activated and a shop is enrolled", async () => {
    await expect(
      db.as(
        customers[0],
        "authenticated",
        (tx) => tx`select public.cash_quote(10000::int, ${RAIL})`,
      ),
    ).rejects.toThrow("rail_unavailable");
    await expect(goOnline(shopOwner, shop)).rejects.toThrow("not_enrolled");
  });

  test("an unconfirmed rail is not named after a partner", async () => {
    const [rail] =
      await db.sql`select label, fee_verified from public.cash_rails where id = ${RAIL}`;
    expect(rail.fee_verified).toBe(false);
    expect(rail.label).not.toMatch(/gotyme|flash|capitec|fnb|standard bank|kazang/i);
  });

  test("only a super_admin can activate a rail, and ops_admin cannot", async () => {
    await expect(
      db.as(
        ops,
        "authenticated",
        (tx) => tx`select public.cash_set_rail_active(${RAIL}, true, false)`,
      ),
    ).rejects.toThrow("forbidden");
    await db.as(
      superAdmin,
      "authenticated",
      (tx) => tx`select public.cash_set_rail_active(${RAIL}, true, false)`,
    );
  });

  test("only admins can enrol a shop, and only an approved one", async () => {
    await expect(
      db.as(
        shopOwner,
        "authenticated",
        (tx) =>
          tx`select * from public.cash_enrol_point(${shop}::uuid, ${LAT}::float8, ${LNG}::float8, 'x', true)`,
      ),
    ).rejects.toThrow("forbidden");
    await expect(
      db.as(
        ops,
        "authenticated",
        (tx) =>
          tx`select * from public.cash_enrol_point(${draftShop}::uuid, ${LAT}::float8, ${LNG}::float8, 'x', true)`,
      ),
    ).rejects.toThrow("business_not_approved");
    await enrol(shop);
    await enrol(shop2, -26.2455, 27.9105);
    const state = await goOnline(shopOwner, shop);
    expect(state.online).toBe(true);
    await goOnline(shop2Owner, shop2);
  });
});

describe("privileges: clients reach the engine only through its functions", () => {
  test("customers cannot read request rows or secrets, or write them", async () => {
    const rows = await db.as(
      customers[0],
      "authenticated",
      (tx) => tx`select * from public.cash_requests`,
    );
    expect(rows.length).toBe(0);
    await expect(
      db.as(customers[0], "authenticated", (tx) => tx`select * from public.cash_request_secrets`),
    ).rejects.toThrow();
    await expect(
      db.as(
        customers[0],
        "authenticated",
        (tx) => tx`update public.cash_requests set status = 'completed'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.as(
        customers[0],
        "authenticated",
        (tx) => tx`insert into public.cash_points (business_id) values (${shop}::uuid)`,
      ),
    ).rejects.toThrow();
  });

  test("anon cannot call any engine function; internals are closed to everyone but the service role", async () => {
    const rows = await db.sql`
      select p.proname,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authed
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'cash\_%' or p.proname = 'check_rate_limit')
    `;
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) expect(r.anon).toBe(false);
    const internals = [
      "cash_cfg",
      "cash_sweep",
      "cash_shape",
      "cash_reserved_cents",
      "cash_customer_cap_cents",
      "cash_drop_secret",
      "check_rate_limit",
    ];
    for (const r of rows.filter((x) => internals.includes(x.proname))) expect(r.authed).toBe(false);
  });

  test("a customer cannot enrol shops, resolve incidents or change rails", async () => {
    await expect(
      db.as(
        customers[0],
        "authenticated",
        (tx) =>
          tx`select * from public.cash_enrol_point(${shop}::uuid, 0::float8, 0::float8, 'x', true)`,
      ),
    ).rejects.toThrow("forbidden");
    await expect(
      db.as(
        customers[0],
        "authenticated",
        (tx) => tx`select public.cash_set_rail_active(${RAIL}, false, false)`,
      ),
    ).rejects.toThrow("forbidden");
  });
});

describe("the request lifecycle", () => {
  let id: string;

  test("a customer sees the fee up front, labelled as an example until verified", async () => {
    const q = await db.as(customers[0], "authenticated", async (tx) =>
      j((await tx`select public.cash_quote(20000::int, ${RAIL}) as r`)[0].r),
    );
    expect(q.partner_fee_cents).toBe(700);
    expect(q.cashnear_fee_cents).toBe(0);
    expect(q.fee_verified).toBe(false);
    expect(q.max_cents).toBe(20000);
  });

  test("nearby returns shops that can serve, without exposing cash or contact details", async () => {
    const rows = await db.as(
      customers[0],
      "authenticated",
      (tx) =>
        tx`select * from public.cash_nearby(${LAT}::float8, ${LNG}::float8, 10000::int, ${RAIL}, false)`,
    );
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.can_serve === true)).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "business_id",
      "can_serve",
      "distance_m",
      "landmark",
      "name",
      "photo_path",
      "suburb",
      "walk_min",
    ]);
    expect(rows[0].distance_m).toBeLessThanOrEqual(rows[1].distance_m);
  });

  test("a request is created once, even if the app retries it", async () => {
    const key = crypto.randomUUID();
    const first = await create(customers[0], shop, 10000, key);
    const retry = await create(customers[0], shop, 10000, key);
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.id).toBe(first.id);
    id = first.id;
    const [{ n }] =
      await db.sql`select count(*)::int as n from public.cash_requests where customer_id = ${customers[0]}`;
    expect(n).toBe(1);
  });

  test("before the shop accepts, the customer has no code and the shop sees no handshake", async () => {
    const c = await get(customers[0], id);
    expect(c.status).toBe("awaiting_shop");
    expect(c.code).toBeNull();
    expect(c.handshake).toBeNull();
    expect(c.shop.address).toBeNull();
    const s = await get(shopOwner, id);
    expect(s.handshake).toBeNull();
    expect(s.customer.first_name).toBe("Customer");
    expect(JSON.stringify(s)).not.toContain("example.test");
  });

  test("after accepting, only the customer sees the code and both see the handshake words", async () => {
    expect((await act(shopOwner, id, "accept")).status).toBe("held");
    const c = await get(customers[0], id);
    expect(c.code).toMatch(/^\d{6}$/);
    expect(c.handshake).toMatch(/^\S+ · \S+$/);
    expect(c.shop.address).toBe("1 Vilakazi Street");
    const s = await get(shopOwner, id);
    expect(s.handshake).toBe(c.handshake);
    expect(s.code).toBeNull();
    expect(JSON.stringify(s)).not.toContain(c.code);
  });

  test("a stranger cannot read the request, and a missing id looks the same", async () => {
    await expect(get(customers[1], id)).rejects.toThrow("not_found");
    await expect(get(customers[1], crypto.randomUUID())).rejects.toThrow("not_found");
  });

  test("a wrong code is refused and counted; the count is kept, not rolled back", async () => {
    const r1 = await act(shopOwner, id, "shop_complete", {
      code: "000000",
      reference: "FL12347731",
    });
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe("code_mismatch");
    expect(r1.attempts_left).toBe(4);
    const r2 = await act(shopOwner, id, "shop_complete", {
      code: "000001",
      reference: "FL12347731",
    });
    expect(r2.attempts_left).toBe(3);
    const [{ code_attempts }] =
      await db.sql`select code_attempts from public.cash_requests where id = ${id}`;
    expect(code_attempts).toBe(2);
  });

  test("the shop completes with the code and its payment reference; the customer confirms", async () => {
    const code = (await get(customers[0], id)).code;
    const done = await act(shopOwner, id, "shop_complete", { code, reference: "fl1234 7731" });
    expect(done.ok).toBe(true);
    expect(done.status).toBe("awaiting_confirmation");
    const c = await get(customers[0], id);
    expect(c.reference_masked).toBe("••••7731");
    const [{ n }] =
      await db.sql`select count(*)::int as n from public.cash_request_secrets where request_id = ${id}`;
    expect(n).toBe(0);
    const confirmed = await act(customers[0], id, "confirm", { stars: 5 });
    expect(confirmed.status).toBe("completed");
  });

  test("the audit trail records each step without the code", async () => {
    const rows =
      await db.sql`select action, metadata::text as m from public.audit_logs where entity_id = ${id} order by created_at`;
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "cash.request.created",
        "cash.request.accept",
        "cash.request.shop_complete",
        "cash.request.confirm",
      ]),
    );
    expect(rows.every((r) => !/\d{6}/.test(r.m ?? ""))).toBe(true);
  });
});

describe("guessing the code is limited", () => {
  test("five wrong attempts lock completion, even for the correct code", async () => {
    await resetShop(shop);
    const { id } = await create(customers[1], shop);
    await act(shopOwner, id, "accept");
    const code = (await get(customers[1], id)).code;
    let last;
    for (let i = 0; i < 5; i++)
      last = await act(shopOwner, id, "shop_complete", { code: "999999", reference: "REF00001" });
    expect(last.error).toBe("code_mismatch");
    expect(last.locked_until).not.toBeNull();
    const locked = await act(shopOwner, id, "shop_complete", { code, reference: "REF00001" });
    expect(locked.ok).toBe(false);
    expect(locked.error).toBe("locked");
    await db.sql`update public.cash_requests set code_locked_until = now() - interval '1 minute' where id = ${id}`;
    expect((await act(shopOwner, id, "shop_complete", { code, reference: "REF00001" })).ok).toBe(
      true,
    );
  });

  test("a customer cannot complete their own request, and a shop cannot confirm it", async () => {
    await resetShop(shop);
    const { id } = await create(customers[2], shop);
    await act(shopOwner, id, "accept");
    await expect(
      act(customers[2], id, "shop_complete", { code: "123456", reference: "REF00002" }),
    ).rejects.toThrow("forbidden");
    await expect(act(shopOwner, id, "confirm")).rejects.toThrow("forbidden");
    await expect(act(shopOwner, id, "cancel")).rejects.toThrow("forbidden");
  });
});

describe("concurrency: the engine never over-promises", () => {
  test("four customers racing for a shop that can serve two: exactly two get it", async () => {
    await resetShop(shop);
    await db.sql`update public.cash_points set cash_band_cents = 20000 where business_id = ${shop}`;
    const results = await Promise.allSettled(
      customers.slice(0, 4).map((c) => create(c, shop, 10000)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(2);
    expect(refused.length).toBe(2);
    for (const r of refused)
      expect(String((r as PromiseRejectedResult).reason)).toContain("shop_cannot_serve");
    const [{ total }] =
      await db.sql`select coalesce(sum(amount_cents),0)::int as total from public.cash_requests where business_id = ${shop} and status = 'awaiting_shop'`;
    expect(total).toBe(20000);
  });

  test("one customer cannot hold cash at two shops at once, even with simultaneous taps", async () => {
    await resetShop(shop);
    await resetShop(shop2);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[4]}`;
    const results = await Promise.allSettled([
      create(customers[4], shop),
      create(customers[4], shop2),
      create(customers[4], shop),
    ]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const [{ n }] =
      await db.sql`select count(*)::int as n from public.cash_requests where customer_id = ${customers[4]} and status = 'awaiting_shop'`;
    expect(n).toBe(1);
  });

  test("a double tap with the same key creates one request", async () => {
    await resetShop(shop);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[5]}`;
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      create(customers[5], shop, 10000, key),
      create(customers[5], shop, 10000, key),
    ]);
    expect(a.id).toBe(b.id);
    const [{ n }] =
      await db.sql`select count(*)::int as n from public.cash_requests where customer_id = ${customers[5]}`;
    expect(n).toBe(1);
  });

  test("a shop cannot accept twice or after the customer cancelled", async () => {
    await resetShop(shop);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[0]} and status = 'awaiting_shop'`;
    const { id } = await create(customers[0], shop);
    await act(customers[0], id, "cancel");
    await expect(act(shopOwner, id, "accept")).rejects.toThrow("invalid_state");
  });
});

describe("limits that protect shops and customers", () => {
  test("new customers are capped at R200 until two clean completions, then R500", async () => {
    await resetShop(shop);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[3]}`;
    await expect(create(customers[3], shop, 30000)).rejects.toThrow("amount_not_allowed");
    for (let i = 0; i < 2; i++) {
      await db.sql`insert into public.cash_requests (customer_id, business_id, amount_cents, rail_id, status, handshake, partner_fee_cents, idempotency_key, accept_by, completed_at)
        values (${customers[3]}, ${shop}, 10000, ${RAIL}, 'completed', 'x · y', 700, ${crypto.randomUUID()}, now(), now())`;
    }
    expect((await create(customers[3], shop, 30000)).replayed).toBe(false);
  });

  test("probing for a shop's cash above the pilot cap is refused", async () => {
    await expect(
      db.as(
        customers[0],
        "authenticated",
        (tx) =>
          tx`select * from public.cash_nearby(${LAT}::float8, ${LNG}::float8, 300000::int, ${RAIL}, false)`,
      ),
    ).rejects.toThrow("amount_not_allowed");
  });

  test("a shop owner cannot request cash from their own shop", async () => {
    await expect(create(shopOwner, shop)).rejects.toThrow("own_shop");
  });

  test("three abandoned holds in a week pause new requests", async () => {
    const u = await createUser(db.sql, "noshow@example.test", "No Show");
    for (let i = 0; i < 3; i++) {
      await db.sql`insert into public.cash_requests (customer_id, business_id, amount_cents, rail_id, status, closed_reason, handshake, partner_fee_cents, idempotency_key, accept_by)
        values (${u}, ${shop}, 10000, ${RAIL}, 'expired', 'hold_window_passed', 'x · y', 700, ${crypto.randomUUID()}, now())`;
    }
    await resetShop(shop);
    await expect(create(u, shop)).rejects.toThrow("paused_no_shows");
  });

  test("the fee table is data: a new schedule changes quotes but not requests already made", async () => {
    await db.sql`insert into public.cash_fee_schedule (rail_id, min_cents, max_cents, partner_fee_cents, cashnear_fee_cents, effective_from)
      values (${RAIL}, 5000, 300000, 700, 200, now() + interval '1 second')`;
    await Bun.sleep(1200);
    const q = await db.as(customers[0], "authenticated", async (tx) =>
      j((await tx`select public.cash_quote(10000::int, ${RAIL}) as r`)[0].r),
    );
    expect(q.total_fee_cents).toBe(900);
    const [old] =
      await db.sql`select partner_fee_cents, cashnear_fee_cents from public.cash_requests where status = 'completed' limit 1`;
    expect(old.cashnear_fee_cents).toBe(0);
    await db.sql`delete from public.cash_fee_schedule where cashnear_fee_cents = 200`;
  });
});

describe("shops that do not respond are paused automatically", () => {
  test("three missed requests in a row take the shop offline, and it can come back by going online", async () => {
    await resetShop(shop);
    for (let i = 0; i < 3; i++) {
      await db.sql`delete from public.cash_requests where customer_id = ${customers[2]} and status in ('awaiting_shop','held')`;
      const { id } = await create(customers[2], shop);
      await db.sql`update public.cash_requests set accept_by = now() - interval '1 second' where id = ${id}`;
      const c = await get(customers[2], id);
      expect(c.status).toBe("expired");
    }
    const [pt] =
      await db.sql`select online, paused_reason, missed_count, trust_score from public.cash_points where business_id = ${shop}`;
    expect(pt.online).toBe(false);
    expect(pt.paused_reason).toBe("missed_requests");
    expect(pt.trust_score).toBeLessThan(80);
    const rows = await db.as(
      customers[0],
      "authenticated",
      (tx) =>
        tx`select * from public.cash_nearby(${LAT}::float8, ${LNG}::float8, 10000::int, ${RAIL}, false)`,
    );
    expect(rows.map((r) => r.business_id)).not.toContain(shop);
    const back = await goOnline(shopOwner, shop);
    expect(back.online).toBe(true);
    expect(back.paused_reason).toBeNull();
  });

  test("a held request that nobody collects expires and frees the cash", async () => {
    await resetShop(shop);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[1]} and status in ('awaiting_shop','held')`;
    const { id } = await create(customers[1], shop);
    await act(shopOwner, id, "accept");
    await db.sql`update public.cash_requests set expires_at = now() - interval '1 second' where id = ${id}`;
    const c = await get(customers[1], id);
    expect(c.status).toBe("expired");
    expect(c.closed_reason).toBe("hold_window_passed");
    const [{ n }] =
      await db.sql`select count(*)::int as n from public.cash_request_secrets where request_id = ${id}`;
    expect(n).toBe(0);
  });

  test("availability expires by itself", async () => {
    await resetShop(shop);
    await db.sql`update public.cash_points set online_until = now() - interval '1 minute' where business_id = ${shop}`;
    await db.sql`delete from public.cash_requests where customer_id = ${customers[0]} and status in ('awaiting_shop','held')`;
    await expect(create(customers[0], shop)).rejects.toThrow("shop_unavailable");
  });
});

describe("disputes and review", () => {
  test("a serious claim pauses the shop for review without suspending the business", async () => {
    await resetShop(shop);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[4]} and status in ('awaiting_shop','held')`;
    const { id } = await create(customers[4], shop);
    await act(shopOwner, id, "accept");
    const res = await act(customers[4], id, "dispute", {
      kind: "paid_no_cash",
      details: "I paid but got nothing",
    });
    expect(res.status).toBe("disputed");
    const [biz] =
      await db.sql`select application_status from public.operator_businesses where id = ${shop}`;
    expect(biz.application_status).toBe("approved");
    const [pt] =
      await db.sql`select online, paused_reason from public.cash_points where business_id = ${shop}`;
    expect(pt.online).toBe(false);
    expect(pt.paused_reason).toBe("dispute_review");
    await expect(goOnline(shopOwner, shop)).rejects.toThrow("paused_for_review");
    const [inc] =
      await db.sql`select id, severity from public.cash_incidents where request_id = ${id}`;
    expect(inc.severity).toBe("high");

    await expect(
      db.as(
        shopOwner,
        "authenticated",
        (tx) =>
          tx`select public.cash_resolve_incident(${inc.id}::uuid, 'I resolved my own dispute')`,
      ),
    ).rejects.toThrow("forbidden");
    await expect(
      db.as(
        ops,
        "authenticated",
        (tx) => tx`select public.cash_clear_pause(${shop}::uuid, 'short')`,
      ),
    ).rejects.toThrow("reason_required");
    await db.as(
      ops,
      "authenticated",
      (tx) =>
        tx`select public.cash_resolve_incident(${inc.id}::uuid, 'Checked the slip with the shop; paid out in full.')`,
    );
    await db.as(
      ops,
      "authenticated",
      (tx) => tx`select public.cash_clear_pause(${shop}::uuid, 'Incident reviewed and closed.')`,
    );
    expect((await goOnline(shopOwner, shop)).online).toBe(true);
  });

  test("a completion the customer never confirms becomes a review case, and can still be confirmed", async () => {
    await resetShop(shop);
    await db.sql`delete from public.cash_requests where customer_id = ${customers[2]} and status in ('awaiting_shop','held')`;
    const { id } = await create(customers[2], shop);
    await act(shopOwner, id, "accept");
    const code = (await get(customers[2], id)).code;
    await act(shopOwner, id, "shop_complete", { code, reference: "REF77777" });
    await db.sql`update public.cash_requests set shop_completed_at = now() - interval '3 hours' where id = ${id}`;
    expect((await get(customers[2], id)).status).toBe("needs_review");
    const [inc] = await db.sql`select kind from public.cash_incidents where request_id = ${id}`;
    expect(inc.kind).toBe("unconfirmed_completion");
    expect((await act(customers[2], id, "confirm")).status).toBe("completed");
  });
});

describe("availability can be changed one field at a time", () => {
  test("omitting arguments leaves them unchanged, as the app now sends them", async () => {
    await resetShop(shop);
    await db.sql`update public.cash_points set cash_band_cents = 30000, small_notes = true where business_id = ${shop}`;

    // Only the band: duration and small-notes are omitted entirely.
    await db.as(
      shopOwner,
      "authenticated",
      (tx) =>
        tx`select public.cash_set_availability(p_business := ${shop}::uuid, p_band_cents := 20000::int)`,
    );
    let [pt] =
      await db.sql`select cash_band_cents, small_notes, online from public.cash_points where business_id = ${shop}`;
    expect(pt.cash_band_cents).toBe(20000);
    expect(pt.small_notes).toBe(true);
    expect(pt.online).toBe(true);

    // Only going offline.
    await db.as(
      shopOwner,
      "authenticated",
      (tx) =>
        tx`select public.cash_set_availability(p_business := ${shop}::uuid, p_minutes := 0::int)`,
    );
    [pt] =
      await db.sql`select cash_band_cents, small_notes, online from public.cash_points where business_id = ${shop}`;
    expect(pt.online).toBe(false);
    expect(pt.cash_band_cents).toBe(20000);
  });

  test("an invalid band is still refused", async () => {
    await expect(
      db.as(
        shopOwner,
        "authenticated",
        (tx) =>
          tx`select public.cash_set_availability(p_business := ${shop}::uuid, p_band_cents := 99000::int)`,
      ),
    ).rejects.toThrow("invalid_band");
  });
});

describe("audit attribution (restored hardening)", () => {
  test("a super_admin who also holds the customer role is logged as super_admin", async () => {
    await db.sql`insert into public.user_roles (user_id, role) values (${superAdmin}, 'customer') on conflict do nothing`;
    await db.as(
      superAdmin,
      "authenticated",
      (tx) => tx`select public.log_audit_event('test.audit.role', 'test', 'x', null)`,
    );
    const [row] =
      await db.sql`select actor_role from public.audit_logs where action = 'test.audit.role'`;
    expect(row.actor_role).toBe("super_admin");
  });

  test("the audit writer rejects malformed actions", async () => {
    await expect(
      db.as(
        superAdmin,
        "authenticated",
        (tx) => tx`select public.log_audit_event('Not A Valid Action', 'test', 'x', null)`,
      ),
    ).rejects.toThrow("Invalid action");
  });
});

describe("shopfront: a landmark and a photo, set only by the person who visits", () => {
  const photo = () => `${shop}/front-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const setFront = (who: string, business: string, landmark: string | null, path: string | null) =>
    db.as(
      who,
      "authenticated",
      (tx) => tx`select * from public.cash_set_shopfront(${business}::uuid, ${landmark}, ${path})`,
    );
  let viewer: string;

  test("an admin can set a landmark and a photo; a shop owner or customer cannot", async () => {
    const path = photo();
    const [row] = await setFront(ops, shop, "  Next to the clinic  ", path);
    expect(row.landmark).toBe("Next to the clinic");
    expect(row.photo_path).toBe(path);
    await expect(setFront(shopOwner, shop, "Mine now", null)).rejects.toThrow("forbidden");
    await expect(setFront(customers[0], shop, "Mine now", null)).rejects.toThrow("forbidden");
  });

  test("a shop owner cannot write the columns directly either", async () => {
    await db
      .as(
        shopOwner,
        "authenticated",
        (tx) =>
          tx`update public.cash_points set landmark = 'Hacked', photo_path = null where business_id = ${shop}::uuid`,
      )
      .catch(() => undefined);
    const [row] = await db.sql`select landmark from public.cash_points where business_id = ${shop}`;
    expect(row.landmark).toBe("Next to the clinic");
  });

  test("a photo can only sit in its own shop's folder, with a plain file name", async () => {
    const bad = [
      `${shop2}/front.jpg`, // another shop's folder
      "front.jpg", // no folder
      `${shop}/../${shop2}/front.jpg`, // traversal
      `${shop}/a b.jpg`, // unsafe characters
      `${shop}/${"x".repeat(100)}.jpg`, // too long
    ];
    for (const p of bad)
      await expect(setFront(ops, shop, "Next to the clinic", p)).rejects.toThrow("invalid_photo");
  });

  test("a shop that is not enrolled has nothing to attach a photo to", async () => {
    await expect(setFront(ops, draftShop, "Somewhere", null)).rejects.toThrow("not_enrolled");
  });

  test("an overlong landmark is cut to 120 characters, and a blank one is cleared", async () => {
    const [long] = await setFront(ops, shop, "x".repeat(300), null);
    expect(long.landmark.length).toBe(120);
    const [blank] = await setFront(ops, shop, "   ", null);
    expect(blank.landmark).toBeNull();
    await setFront(ops, shop, "Next to the clinic", photo());
  });

  test("setting a shopfront is written to the audit log", async () => {
    const rows = await db.sql`
      select actor_role from public.audit_logs where action = 'cash.point.shopfront' and entity_id = ${shop}
    `;
    expect(rows.length).toBeGreaterThan(0);
  });

  test("a customer searching sees the landmark and photo, and the order is still best-first", async () => {
    await resetShop(shop);
    await resetShop(shop2);
    await setFront(ops, shop2, null, null);
    const shops = await db.as(
      customers[1],
      "authenticated",
      (tx) =>
        tx`select * from public.cash_nearby(${LAT}::float8, ${LNG}::float8, 10000::int, ${RAIL}, false)`,
    );
    const mine = shops.find((s) => s.business_id === shop);
    const other = shops.find((s) => s.business_id === shop2);
    expect(mine.landmark).toBe("Next to the clinic");
    expect(mine.photo_path).toMatch(new RegExp(`^${shop}/front-`));
    expect(other.landmark).toBeNull();
    expect(other.photo_path).toBeNull();
    const canServe = shops.map((s) => s.can_serve);
    expect(canServe).toEqual([...canServe].sort((a, b) => Number(b) - Number(a)));
  });

  test("the customer's request screen carries them; the shop's own view does not", async () => {
    viewer = await createUser(db.sql, "viewer@example.test", "Viewer");
    await resetShop(shop);
    const made = await create(viewer, shop, 10000);
    await act(shopOwner, made.id, "accept");
    const asCustomer = await get(viewer, made.id);
    expect(asCustomer.shop.landmark).toBe("Next to the clinic");
    expect(asCustomer.shop.photo_path).toMatch(new RegExp(`^${shop}/front-`));
    const asShop = await get(shopOwner, made.id);
    expect(asShop.shop).toBeNull();
    await act(viewer, made.id, "cancel");
  });

  test("only admins can add, replace or remove photos in storage; anyone can be shown one", async () => {
    const [bucket] =
      await db.sql`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'shopfronts'`;
    expect(bucket.public).toBe(true);
    expect(Number(bucket.file_size_limit)).toBeLessThanOrEqual(3 * 1024 * 1024);
    expect(bucket.allowed_mime_types.every((m: string) => m.startsWith("image/"))).toBe(true);
    expect(bucket.allowed_mime_types).not.toContain("image/svg+xml");

    const name = `${shop}/storage-${crypto.randomUUID().slice(0, 8)}.jpg`;
    for (const who of [shopOwner, customers[0]])
      await expect(
        db.as(
          who,
          "authenticated",
          (tx) => tx`insert into storage.objects (bucket_id, name) values ('shopfronts', ${name})`,
        ),
      ).rejects.toThrow();
    await db.as(
      ops,
      "authenticated",
      (tx) => tx`insert into storage.objects (bucket_id, name) values ('shopfronts', ${name})`,
    );
    // A shop owner cannot delete or rename it either (the row is simply not visible to them).
    await db
      .as(
        shopOwner,
        "authenticated",
        (tx) => tx`delete from storage.objects where bucket_id = 'shopfronts' and name = ${name}`,
      )
      .catch(() => undefined);
    const [still] =
      await db.sql`select count(*)::int as n from storage.objects where bucket_id = 'shopfronts' and name = ${name}`;
    expect(still.n).toBe(1);
  });
});
