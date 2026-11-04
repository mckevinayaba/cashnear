import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("docs/FOUNDER_DEMO_GUIDE.md contains no secrets", () => {
  const src = read("docs/FOUNDER_DEMO_GUIDE.md");

  test("contains no password/credential values", () => {
    expect(src).not.toMatch(/password\s*[:=]\s*\S/i);
    expect(src).not.toMatch(/HxW9c_kXo1uN|zqzgTbvkhqLJiR9bY0Z9tQHg9Jso4PyV/); // the actual generated demo passwords
  });

  test("contains no JWT-shaped key or production project ref", () => {
    expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(src).not.toContain("cfwylchvtfwtqhfwoefm");
  });

  test("does not expose the founder's personal email", () => {
    expect(src).not.toMatch(/mckevin/i);
  });

  test("points to the git-ignored local file for demo credentials, not inline values", () => {
    expect(src).toContain(".env.demo-accounts.local");
  });

  test("walks through both approval and the demo reset step", () => {
    expect(src).toMatch(/Reset demo customer/);
    expect(src).toMatch(/Reset demo operator/);
  });

  test("does not instruct sharing the founder's super-admin password", () => {
    expect(src).not.toMatch(/share.*(super.admin|founder).*password/i);
  });
});
