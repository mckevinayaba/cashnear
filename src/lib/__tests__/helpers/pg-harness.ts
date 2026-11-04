import EmbeddedPostgres from "embedded-postgres";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client, Pool } from "pg";

/**
 * Real-Postgres test harness. Starts a throwaway local Postgres, loads a small
 * Supabase stand-in (roles, auth.uid(), storage stubs), then applies every
 * committed migration in order. Nothing here can reach a real Supabase
 * project: the server only listens on localhost and is deleted afterwards.
 *
 * Uses the `pg` driver on purpose: Bun's built-in SQL client crashed and hung
 * under this kind of connection churn on Windows (Bun 1.3.14).
 */

const repoRoot = join(import.meta.dir, "..", "..", "..", "..");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are untyped in tests
type Row = any;

/** Tagged-template query runner: sql`select ${x}::int` -> rows. */
export type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]>;
  /** Raw text, may contain several statements, no parameters. */
  unsafe: (text: string) => Promise<Row[]>;
};

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }> };

function wrap(q: Queryable): Sql {
  const run = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
    return (await q.query(text, values)).rows;
  }) as Sql;
  run.unsafe = async (text: string) => {
    const res = (await q.query(text)) as unknown as { rows?: Row[] } | Array<{ rows: Row[] }>;
    return Array.isArray(res) ? (res[res.length - 1]?.rows ?? []) : (res.rows ?? []);
  };
  return run;
}

export type TestDb = {
  /** Superuser connection (migrations, fixtures, assertions). */
  sql: Sql;
  /** Runs fn inside one transaction as `role`, with auth.uid() = uid. */
  as: <T>(
    uid: string | null,
    role: "authenticated" | "anon" | "service_role",
    fn: (tx: Sql) => Promise<T>,
  ) => Promise<T>;
  stop: () => Promise<void>;
};

export async function startTestDb(): Promise<TestDb> {
  const dir = mkdtempSync(join(tmpdir(), "cashnear-pg-"));
  const port = 55000 + Math.floor(Math.random() * 4000);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("cashnear");

  const url = `postgres://postgres:postgres@localhost:${port}/cashnear`;
  const pool = new Pool({ connectionString: url, max: 8 });
  const sql = wrap(pool);

  await sql.unsafe(readFileSync(join(import.meta.dir, "supabase-shim.sql"), "utf8"));
  const migrationsDir = join(repoRoot, "supabase", "migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await sql.unsafe(readFileSync(join(migrationsDir, file), "utf8"));
    } catch (e) {
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    }
  }

  return {
    sql,
    // Each call gets its own connection and an explicit transaction, like a
    // PostgREST request: the JWT subject is set transaction-locally and the
    // role is switched, so row-level security and grants apply for real.
    as: async (uid, role, fn) => {
      const client = new Client({ connectionString: url });
      await client.connect();
      try {
        await client.query("begin");
        try {
          await client.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
          await client.query(`set local role ${role}`);
          const out = await fn(wrap(client));
          await client.query("commit");
          return out;
        } catch (e) {
          await client.query("rollback").catch(() => {});
          throw e;
        }
      } finally {
        await client.end();
      }
    },
    stop: async () => {
      await pool.end();
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Creates a user the same way sign-up does (the on_auth_user_created trigger fills profile + role). */
export async function createUser(sql: Sql, email: string, fullName = "Test User"): Promise<string> {
  const [row] = await sql`
    insert into auth.users (email, raw_user_meta_data)
    values (${email}, jsonb_build_object('full_name', ${fullName}::text))
    returning id
  `;
  return row.id as string;
}
