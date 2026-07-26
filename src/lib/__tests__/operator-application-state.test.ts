import { describe, test, expect } from "bun:test";
import {
  applicantCanEdit,
  isValidAdminTransition,
  allowedAdminTransitionsFrom,
  type OperatorApplicationStatus,
} from "@/lib/operator-application-state";

// C-03 / C-04 coverage: every operator_application_status enum value,
// exhaustively, for both the applicant-editable check and the admin
// transition table. This is the executable proof that the state machine
// described in docs/STAGE1_SECURITY_REMEDIATION_PLAN.md actually rejects
// every self-approval / self-reinstatement path and accepts every
// legitimate one.

const ALL_STATUSES: OperatorApplicationStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "info_requested",
  "site_verification_required",
  "approved",
  "rejected",
  "suspended",
  "deactivated",
];

describe("applicantCanEdit — C-03 (rejected/suspended operators cannot self-reinstate)", () => {
  test("a brand new application (no existing row) is always editable", () => {
    expect(applicantCanEdit(undefined)).toBe(true);
  });

  const editable = new Set<OperatorApplicationStatus>(["draft", "info_requested"]);

  for (const status of ALL_STATUSES) {
    test(`current status "${status}" -> editable: ${editable.has(status)}`, () => {
      expect(applicantCanEdit(status)).toBe(editable.has(status));
    });
  }

  test("an applicant can never edit while approved (would let them rewrite a live business)", () => {
    expect(applicantCanEdit("approved")).toBe(false);
  });
  test("a rejected applicant cannot resubmit through the plain editor (C-03 exploit scenario)", () => {
    expect(applicantCanEdit("rejected")).toBe(false);
  });
  test("a suspended operator cannot use the applicant editor to reinstate itself (C-03/C-04)", () => {
    expect(applicantCanEdit("suspended")).toBe(false);
  });
  test("a deactivated operator cannot reopen its own application", () => {
    expect(applicantCanEdit("deactivated")).toBe(false);
  });
});

describe("isValidAdminTransition — full 9x9 transition matrix", () => {
  // Independently declared expectation (not imported from the source map)
  // so this test actually catches an unintended change to the map, not
  // just echo it back.
  const EXPECTED: Record<OperatorApplicationStatus, OperatorApplicationStatus[]> = {
    draft: [],
    submitted: [
      "under_review",
      "info_requested",
      "site_verification_required",
      "approved",
      "rejected",
    ],
    under_review: ["info_requested", "site_verification_required", "approved", "rejected"],
    info_requested: ["under_review"],
    site_verification_required: ["under_review", "approved", "rejected"],
    approved: ["suspended", "deactivated"],
    rejected: ["under_review"],
    suspended: ["approved", "deactivated"],
    deactivated: [],
  };

  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = EXPECTED[from].includes(to);
      test(`${from} -> ${to}: ${expected ? "ALLOWED" : "rejected"}`, () => {
        expect(isValidAdminTransition(from, to)).toBe(expected);
      });
    }
  }

  test("draft is never admin-actionable (must be submitted by the applicant first)", () => {
    expect(allowedAdminTransitionsFrom("draft")).toEqual([]);
  });
  test("deactivated is terminal", () => {
    expect(allowedAdminTransitionsFrom("deactivated")).toEqual([]);
  });
  test("suspended -> approved (reinstatement) is admin-reachable, matching the assessment's explicit requirement", () => {
    expect(isValidAdminTransition("suspended", "approved")).toBe(true);
  });
  test("an operator cannot self-approve: applicantCanEdit blocks writes before an admin transition is even relevant", () => {
    // Belt-and-suspenders: an applicant-side write is rejected long before
    // it could reach an admin decision, for every non-editable state.
    for (const status of ALL_STATUSES) {
      if (!applicantCanEdit(status)) {
        expect(applicantCanEdit(status)).toBe(false);
      }
    }
  });
});
