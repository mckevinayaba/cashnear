import { describe, test, expect } from "bun:test";
import { isAuthorizedAdmin, type AppRole } from "@/lib/admin-authorization";

// Exhaustive-ish coverage of the pure authorization rule the beforeLoad
// guard is built on -- this is what actually decides whether an admin
// route renders. The guard function itself (requireAdminBeforeLoad) is not
// unit-tested directly since it depends on a live Supabase session/network
// call; this pure predicate is where the real decision logic lives, and it
// is fully exercised here.

const NONE: AppRole[] = [];
const CUSTOMER: AppRole[] = ["customer"];
const OPS_ADMIN: AppRole[] = ["ops_admin"];
const SUPER_ADMIN: AppRole[] = ["super_admin"];
const OPERATOR_OWNER: AppRole[] = ["operator_owner"];
const OPS_ADMIN_AND_OPERATOR: AppRole[] = ["ops_admin", "operator_owner"];
const BOTH_ADMIN_ROLES: AppRole[] = ["ops_admin", "super_admin"];

describe("isAuthorizedAdmin — default (ops_admin OR super_admin)", () => {
  test("no roles at all is denied", () => {
    expect(isAuthorizedAdmin(NONE)).toBe(false);
  });
  test("plain customer is denied", () => {
    expect(isAuthorizedAdmin(CUSTOMER)).toBe(false);
  });
  test("operator_owner alone is denied -- role possession is not admin access", () => {
    expect(isAuthorizedAdmin(OPERATOR_OWNER)).toBe(false);
  });
  test("ops_admin is allowed", () => {
    expect(isAuthorizedAdmin(OPS_ADMIN)).toBe(true);
  });
  test("super_admin is allowed", () => {
    expect(isAuthorizedAdmin(SUPER_ADMIN)).toBe(true);
  });
  test("holding an admin role alongside an unrelated role is still allowed", () => {
    expect(isAuthorizedAdmin(OPS_ADMIN_AND_OPERATOR)).toBe(true);
  });
  test("holding both admin roles is allowed", () => {
    expect(isAuthorizedAdmin(BOTH_ADMIN_ROLES)).toBe(true);
  });
});

describe("isAuthorizedAdmin — requireSuperAdmin: true (the reinstatement-page-equivalent gate)", () => {
  test("ops_admin alone is denied when super_admin is specifically required", () => {
    expect(isAuthorizedAdmin(OPS_ADMIN, { requireSuperAdmin: true })).toBe(false);
  });
  test("super_admin passes when super_admin is specifically required", () => {
    expect(isAuthorizedAdmin(SUPER_ADMIN, { requireSuperAdmin: true })).toBe(true);
  });
  test("holding both roles passes the super_admin-specific gate", () => {
    expect(isAuthorizedAdmin(BOTH_ADMIN_ROLES, { requireSuperAdmin: true })).toBe(true);
  });
  test("no roles fails the super_admin-specific gate", () => {
    expect(isAuthorizedAdmin(NONE, { requireSuperAdmin: true })).toBe(false);
  });
});
