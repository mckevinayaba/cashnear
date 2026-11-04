import type { CashStatus } from "@/lib/cash";

/**
 * Types and plain helpers for the team's management screens: the weekly
 * numbers, the transaction ledger and the CSV export.
 */

export interface AdminSummary {
  days: number;
  from: string;
  window: {
    requests: number;
    accepted: number;
    collected: number;
    collected_cents: number;
    shop_no_answer: number;
    declined: number;
    cancelled: number;
    time_ran_out: number;
    in_progress: number;
    under_review: number;
    cashnear_fees_cents: number;
    partner_fees_cents: number;
    median_accept_seconds: number | null;
  };
  week: { collected_this_week: number; collected_last_week: number };
  shops: {
    approved: number;
    enrolled: number;
    online_now: number;
    paused: number;
    waiting_for_review: number;
  };
  people: { joined: number; collected_once: number; came_back: number; open_reports: number };
  daily: { day: string; requests: number; collected: number }[];
}

export interface AdminRequestRow {
  id: string;
  created_at: string;
  status: CashStatus;
  amount_cents: number;
  partner_fee_cents: number;
  cashnear_fee_cents: number;
  closed_reason: string | null;
  shop_reference: string | null;
  held_at: string | null;
  shop_completed_at: string | null;
  completed_at: string | null;
  accept_seconds: number | null;
  shop: { business_id: string; name: string | null; suburb: string | null };
  customer: { id: string; name: string | null; email: string | null };
}

export interface AdminShopRow {
  business_id: string;
  name: string;
  suburb: string | null;
  enrolled: boolean;
  online: boolean | null;
  paused_reason: string | null;
  trust_score: number;
  requests: number;
  collected: number;
  collected_cents: number;
  no_answer: number;
  declined: number;
  under_review: number;
  median_accept_seconds: number | null;
}

export type StatusTone = "muted" | "warn" | "success" | "danger";

const STATUS_VIEW: Record<CashStatus, { label: string; tone: StatusTone }> = {
  completed: { label: "Collected", tone: "success" },
  awaiting_shop: { label: "Waiting for shop", tone: "warn" },
  held: { label: "Cash kept", tone: "warn" },
  awaiting_confirmation: { label: "Waiting for customer", tone: "warn" },
  declined: { label: "Shop declined", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  disputed: { label: "Dispute", tone: "danger" },
  needs_review: { label: "Needs review", tone: "danger" },
};

export const ADMIN_STATUSES = Object.keys(STATUS_VIEW) as CashStatus[];

export function statusView(status: CashStatus): { label: string; tone: StatusTone } {
  return STATUS_VIEW[status] ?? { label: status, tone: "muted" };
}

/** Why a request ended, for the team. More exact than what a customer is told. */
export function describeReasonForTeam(status: CashStatus, reason: string | null): string {
  if (status === "completed") return "Customer confirmed they got the cash.";
  if (status === "expired" && reason === "shop_no_response")
    return "The shop did not answer in time.";
  if (status === "expired" && reason === "hold_window_passed")
    return "The hold ran out before the cash was collected.";
  if (status === "cancelled") return "The customer cancelled.";
  if (status === "declined") return "The shop said it could not give this cash.";
  if (status === "needs_review")
    return "The shop marked it done but the customer never confirmed. Check with both.";
  if (status === "disputed") return "The customer reported a problem. See the open reports.";
  if (status === "awaiting_shop") return "Waiting for the shop to say yes.";
  if (status === "held") return "The shop is keeping the cash aside.";
  if (status === "awaiting_confirmation") return "Waiting for the customer to confirm.";
  if (status === "expired") return "The request expired.";
  return reason ?? "This request has ended.";
}

/** A whole-number percentage, or null when there is nothing to divide by. */
export function percentOf(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** Of the requests that have finished, how many ended with cash collected. */
export function collectionRate(w: AdminSummary["window"]): number | null {
  return percentOf(w.collected, w.requests - w.in_progress);
}

/** Of all requests, how many the shop said yes to. */
export function acceptanceRate(w: AdminSummary["window"]): number | null {
  return percentOf(w.accepted, w.requests);
}

export function formatSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "—";
  const s = Math.round(Number(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/** "Up 3 on last week", "Down 2", "Same as last week". */
export function describeTrend(thisWeek: number, lastWeek: number): string {
  const diff = thisWeek - lastWeek;
  if (diff === 0)
    return lastWeek === 0 ? "None last week either" : `Same as last week (${lastWeek})`;
  return `${diff > 0 ? "Up" : "Down"} ${Math.abs(diff)} on last week (${lastWeek})`;
}

/* ---------------- CSV ---------------- */

/**
 * One cell, made safe for a spreadsheet. A value that starts with = + - @ (or a
 * tab or return) would be run as a formula when the file is opened, and names
 * and emails come from customers, so such a value is stored as plain text.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const rand = (cents: number) => (cents / 100).toFixed(2);

export const LEDGER_COLUMNS = [
  "Request ID",
  "Created",
  "Status",
  "Amount (R)",
  "Partner fee (R)",
  "CashNear fee (R)",
  "Shop",
  "Area",
  "Customer",
  "Customer email",
  "Payment slip number",
  "Shop said yes after (seconds)",
  "Collected at",
  "Reason",
] as const;

/** The ledger as a CSV file's text, with a byte-order mark so Excel reads it as UTF-8. */
export function ledgerToCsv(rows: readonly AdminRequestRow[]): string {
  const lines = [LEDGER_COLUMNS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.created_at,
        statusView(r.status).label,
        rand(r.amount_cents),
        rand(r.partner_fee_cents),
        rand(r.cashnear_fee_cents),
        r.shop.name,
        r.shop.suburb,
        r.customer.name,
        r.customer.email,
        r.shop_reference,
        r.accept_seconds,
        r.completed_at,
        describeReasonForTeam(r.status, r.closed_reason),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const BOM = String.fromCharCode(0xfeff);
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
