import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard: private documents must only ever be
// reachable through short-lived signed URLs, never a permanent public URL.
// This reads the actual source files rather than rendering components, so
// it works without a DOM test environment, and it catches the exact
// regression the task calls out ("private documents are not exposed
// through permanent public URLs") -- if anyone ever adds a
// `.getPublicUrl(` call to the documents path, this test fails.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("document access uses signed URLs only", () => {
  test("documents.functions.ts uses createSignedUrl, never getPublicUrl", () => {
    const src = read("src/lib/documents.functions.ts");
    expect(src).toContain("createSignedUrl");
    expect(src).not.toContain("getPublicUrl");
  });

  test("the signed URL has a short, bounded expiry", () => {
    const src = read("src/lib/documents.functions.ts");
    const match = src.match(/SIGNED_URL_TTL_SECONDS\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const ttl = Number(match?.[1]);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300); // 5 minutes -- viewing, not long-term access
  });

  test("no admin route or component calls getPublicUrl", () => {
    const files = [
      "src/routes/_authenticated/admin.customers.tsx",
      "src/routes/_authenticated/admin.operators.$id.tsx",
      "src/components/admin/DocumentLink.tsx",
    ];
    for (const file of files) {
      expect(read(file)).not.toContain("getPublicUrl");
    }
  });

  test("DocumentLink never renders a raw storage path as a clickable href", () => {
    const src = read("src/components/admin/DocumentLink.tsx");
    // The only href-shaped thing this component should ever open is the
    // signed URL returned from the server call, via window.open -- never a
    // path passed straight into an <a href>.
    expect(src).not.toMatch(/<a\s+[^>]*href=\{?path/);
  });
});
