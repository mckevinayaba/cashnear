import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createUser, startTestDb, type TestDb } from "./helpers/pg-harness";

let db: TestDb;

beforeAll(async () => {
  db = await startTestDb();
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

describe("real-Postgres baseline: every committed migration applies", () => {
  test("core tables exist after all migrations", async () => {
    const rows = await db.sql`
      select to_regclass('public.operator_businesses') as ob,
             to_regclass('public.audit_logs') as al,
             to_regclass('public.rate_limit_hits') as rl
    `;
    expect(rows[0].ob).not.toBeNull();
    expect(rows[0].al).not.toBeNull();
    expect(rows[0].rl).not.toBeNull();
  });

  test("sign-up trigger creates a profile and the customer role", async () => {
    const uid = await createUser(db.sql, "baseline@example.test");
    const roles = await db.sql`select role from public.user_roles where user_id = ${uid}`;
    expect(roles.map((r) => r.role)).toContain("customer");
  });
});

describe("rate limiter is not callable by client roles", () => {
  test("authenticated and anon cannot execute check_rate_limit", async () => {
    const rows = await db.sql`
      select has_function_privilege('authenticated', 'public.check_rate_limit(text,text,integer,integer)', 'execute') as authed,
             has_function_privilege('anon', 'public.check_rate_limit(text,text,integer,integer)', 'execute') as anon
    `;
    expect(rows[0].authed).toBe(false);
    expect(rows[0].anon).toBe(false);
  });
});
