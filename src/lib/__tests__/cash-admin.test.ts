import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_STATUSES,
  LEDGER_COLUMNS,
  acceptanceRate,
  collectionRate,
  csvCell,
  describeReasonForTeam,
  describeTrend,
  formatSeconds,
  ledgerToCsv,
  percentOf,
  statusView,
  type AdminRequestRow,
  type AdminSummary,
} from "@/lib/cash-admin";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

const row = (over: Partial<AdminRequestRow> = {}): AdminRequestRow => ({
  id: "11111111-2222-3333-4444-555555555555",
  created_at: "2026-11-04T10:00:00.000Z",
  status: "completed",
  amount_cents: 20000,
  partner_fee_cents: 1000,
  cashnear_fee_cents: 150,
  closed_reason: null,
  shop_reference: "SLIP123",
  held_at: "2026-11-04T10:00:30.000Z",
  shop_completed_at: null,
  completed_at: "2026-11-04T10:08:00.000Z",
  accept_seconds: 30,
  shop: { business_id: "b", name: "Mama Thandi's Spaza", suburb: "Orlando West" },
  customer: { id: "c", name: "Thandi Dlamini", email: "thandi@example.test" },
  ...over,
});

describe("CSV export is safe to open in a spreadsheet", () => {
  test("a value that would run as a formula is stored as plain text", () => {
    for (const bad of ['=HYPERLINK("http://x")', "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(bad).replace(/^"/, "").startsWith("'")).toBe(true);
    }
    expect(csvCell("=1+1")).toBe("'=1+1");
  });

  test("ordinary text, numbers and blanks pass through, and quotes and commas are escaped", () => {
    expect(csvCell("Thandi")).toBe("Thandi");
    expect(csvCell(30)).toBe("30");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell("Mama, Thandi")).toBe('"Mama, Thandi"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  test("a number is not mistaken for a formula, even a negative one", () => {
    expect(csvCell(-5)).toBe("-5");
  });

  test("the file has a header, one line per transaction, amounts in rand, and opens as UTF-8", () => {
    const csv = ledgerToCsv([
      row(),
      row({ id: "second", status: "expired", closed_reason: "shop_no_response" }),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(LEDGER_COLUMNS.join(","));
    expect(lines.length).toBe(4); // header, two rows, trailing blank
    expect(lines[1]).toContain(",Collected,200.00,10.00,1.50,");
    expect(lines[1]).toContain("SLIP123");
    expect(lines[2]).toContain("The shop did not answer in time.");
  });

  test("a customer who signs up with a formula as their name cannot attack whoever exports", () => {
    const csv = ledgerToCsv([
      row({ customer: { id: "c", name: "=cmd|' /C calc'!A0", email: "+evil@example.test" } }),
    ]);
    expect(csv).toContain("'=cmd|' /C calc'!A0");
    expect(csv).toContain("'+evil@example.test");
    expect(csv).not.toMatch(/,=cmd/);
  });

  test("the file never carries a code, the two words or a hidden internal field", () => {
    const csv = ledgerToCsv([row()]);
    expect(LEDGER_COLUMNS.join(",")).not.toMatch(/code|handshake|word/i);
    expect(csv).not.toMatch(/handshake/i);
  });
});

describe("the numbers", () => {
  const w = (over: Partial<AdminSummary["window"]> = {}): AdminSummary["window"] => ({
    requests: 10,
    accepted: 7,
    collected: 5,
    collected_cents: 100000,
    shop_no_answer: 1,
    declined: 1,
    cancelled: 1,
    time_ran_out: 0,
    in_progress: 2,
    under_review: 0,
    cashnear_fees_cents: 0,
    partner_fees_cents: 5000,
    median_accept_seconds: 40,
    ...over,
  });

  test("percentages are whole numbers, and blank when there is nothing to divide by", () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBeNull();
    expect(percentOf(5, -1)).toBeNull();
  });

  test("collection rate looks only at requests that have finished", () => {
    expect(collectionRate(w())).toBe(63); // 5 of the 8 finished
    expect(collectionRate(w({ requests: 2, in_progress: 2, collected: 0 }))).toBeNull();
  });

  test("shop acceptance is out of every request", () => {
    expect(acceptanceRate(w())).toBe(70);
    expect(acceptanceRate(w({ requests: 0, accepted: 0 }))).toBeNull();
  });

  test("seconds read as seconds or minutes", () => {
    expect(formatSeconds(12)).toBe("12 s");
    expect(formatSeconds(75)).toBe("1 min 15 s");
    expect(formatSeconds(null)).toBe("—");
    expect(formatSeconds(undefined)).toBe("—");
  });

  test("the weekly trend is said in plain words", () => {
    expect(describeTrend(5, 2)).toBe("Up 3 on last week (2)");
    expect(describeTrend(1, 4)).toBe("Down 3 on last week (4)");
    expect(describeTrend(3, 3)).toBe("Same as last week (3)");
    expect(describeTrend(0, 0)).toBe("None last week either");
  });

  test("every status has a label, a tone and an explanation for the team", () => {
    for (const s of ADMIN_STATUSES) {
      expect(statusView(s).label.length).toBeGreaterThan(3);
      expect(describeReasonForTeam(s, null).length).toBeGreaterThan(5);
    }
    expect(statusView("disputed").tone).toBe("danger");
    expect(statusView("completed").tone).toBe("success");
  });
});

describe("the management screens", () => {
  const screens = [
    "src/routes/_authenticated/admin.business.tsx",
    "src/routes/_authenticated/admin.transactions.tsx",
  ];

  test("both are behind the admin guard, and none of the data calls come from the browser tables", () => {
    for (const f of screens) {
      const src = read(f);
      expect(src).toContain("requireAdminBeforeLoad()");
      expect(src).not.toMatch(/\.from\(\s*["']cash_(requests|request_secrets)["']/);
    }
    expect(read("src/lib/cash-admin-api.ts")).not.toMatch(/\.from\(/);
  });

  test("every admin screen shows the same tab strip", () => {
    for (const f of [
      "admin.index.tsx",
      "admin.business.tsx",
      "admin.transactions.tsx",
      "admin.operators.index.tsx",
      "admin.operators.$id.tsx",
      "admin.customers.tsx",
      "admin.cash.tsx",
      "admin.audit.tsx",
    ])
      expect(read(`src/routes/_authenticated/${f}`)).toContain("<AdminTabs />");
    const tabs = read("src/components/admin/AdminTabs.tsx");
    for (const label of [
      "Overview",
      "Business",
      "Transactions",
      "Shops",
      "Customers",
      "Cash controls",
      "Audit",
    ])
      expect(tabs).toContain(`"${label}"`);
  });

  test("the business screen leads with the one number the company is working for", () => {
    const src = read("src/routes/_authenticated/admin.business.tsx");
    expect(src).toContain("collected_this_week");
    expect(src).toContain("cash collections the customer confirmed");
  });

  test("the money section is honest that CashNear charges nothing in the pilot", () => {
    const src = read("src/routes/_authenticated/admin.business.tsx");
    expect(src).toContain("CashNear charges no fee during the pilot");
    expect(src).toContain("This goes to the payment partner, not to CashNear");
  });

  test("an export says it is recorded in the audit log, and warns when it was cut short", () => {
    const src = read("src/routes/_authenticated/admin.transactions.tsx");
    expect(src).toContain("exportIt: true");
    expect(src).toContain("recorded in the audit log");
    expect(src).toContain("Choose a shorter period");
  });

  test("a customer or shop screen never calls the management functions", () => {
    for (const f of [
      "src/routes/_authenticated/customer.tsx",
      "src/routes/_authenticated/cash.tsx",
      "src/routes/_authenticated/activity.tsx",
      "src/routes/_authenticated/operator.dashboard.tsx",
      "src/lib/cash-api.ts",
    ])
      expect(read(f)).not.toMatch(/cash_admin_|cash-admin/);
  });
});
