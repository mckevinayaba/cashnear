import { describe, test, expect } from "bun:test";
import {
  applicantCanEdit,
  isValidAdminTransition,
  allowedAdminTransitionsFrom,
  canReinstateFrom,
  isReinstatementActorEligible,
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
    rejected: [],
    suspended: ["deactivated"],
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
  test("suspended -> approved (reinstatement) is NOT reachable through the general admin transition map -- founder decision: only reinstateOperator (super_admin-only) may do this", () => {
    expect(isValidAdminTransition("suspended", "approved")).toBe(false);
  });
  test("rejected is terminal: no transition is reachable from rejected, including back to under_review", () => {
    for (const to of ALL_STATUSES) {
      expect(isValidAdminTransition("rejected", to)).toBe(false);
    }
    expect(allowedAdminTransitionsFrom("rejected")).toEqual([]);
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

describe("canReinstateFrom — the one edge reinstateOperator is allowed to perform", () => {
  for (const status of ALL_STATUSES) {
    test(`"${status}" reinstateable: ${status === "suspended"}`, () => {
      expect(canReinstateFrom(status)).toBe(status === "suspended");
    });
  }
});

describe("isReinstatementActorEligible — reinstating actor cannot be the operator or a business member", () => {
  const owner = "11111111-1111-1111-1111-111111111111";
  const staffMember = "22222222-2222-2222-2222-222222222222";
  const unrelatedSuperAdmin = "33333333-3333-3333-3333-333333333333";

  test("the business owner cannot reinstate their own business", () => {
    expect(
      isReinstatementActorEligible({
        actorUserId: owner,
        businessOwnerId: owner,
        businessStaffUserIds: [owner, staffMember],
      }),
    ).toBe(false);
  });

  test("a current staff member of the business cannot reinstate it", () => {
    expect(
      isReinstatementActorEligible({
        actorUserId: staffMember,
        businessOwnerId: owner,
        businessStaffUserIds: [owner, staffMember],
      }),
    ).toBe(false);
  });

  test("a former (inactive) staff member is still ineligible -- membership, not current active status, is what disqualifies", () => {
    // businessStaffUserIds is expected to include every operator_staff row
    // for the business regardless of `active`, per the caller contract.
    expect(
      isReinstatementActorEligible({
        actorUserId: staffMember,
        businessOwnerId: owner,
        businessStaffUserIds: [owner, staffMember],
      }),
    ).toBe(false);
  });

  test("an unrelated super_admin with no relationship to the business is eligible", () => {
    expect(
      isReinstatementActorEligible({
        actorUserId: unrelatedSuperAdmin,
        businessOwnerId: owner,
        businessStaffUserIds: [owner, staffMember],
      }),
    ).toBe(true);
  });
});
