import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guards for the parts of the operator document-upload
// security review that can't be exercised without a live database (RLS,
// storage policies) or a DOM (admin rendering) -- mirrors the pattern
// established in document-access.test.ts. These read the actual source/SQL
// files rather than mocking a database, so they catch real regressions
// (a weakened policy, a raw enum leaking into a label) without needing a
// DB-backed test harness this repo doesn't have.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("operator_documents RLS -- cross-business access denial", () => {
  const src = read("supabase/migrations/20260718061518_4f1b981e-7a82-4103-9ee8-838e3dae676d.sql");

  test("read policy scopes to the caller's own business (owner or active staff), not all documents", () => {
    const match = src.match(
      /CREATE POLICY "Business owner reads documents" ON public\.operator_documents[\s\S]*?;/,
    );
    expect(match).not.toBeNull();
    expect(match?.[0]).toContain("b.owner_id = auth.uid()");
    expect(match?.[0]).toContain("is_business_member(auth.uid(), b.id)");
  });

  test("upload policy requires the caller to own the target business_id", () => {
    const match = src.match(
      /CREATE POLICY "Owner uploads documents" ON public\.operator_documents[\s\S]*?;/,
    );
    expect(match).not.toBeNull();
    expect(match?.[0]).toContain("b.owner_id = auth.uid()");
  });

  test("delete policy requires the caller to own the target business_id (no cross-business replace/delete)", () => {
    const match = src.match(
      /CREATE POLICY "Owner deletes documents" ON public\.operator_documents[\s\S]*?;/,
    );
    expect(match).not.toBeNull();
    expect(match?.[0]).toContain("b.owner_id = auth.uid()");
  });
});

describe("operator-documents storage bucket RLS -- tenant-scoped paths", () => {
  const src = read("supabase/migrations/20260718061546_67b5efcb-66c7-42b7-95ac-27967cec865b.sql");

  test("upload/read/delete policies all check the {business_id}/... path segment against ownership", () => {
    for (const policy of [
      "Owner uploads to own business folder",
      "Owner reads own business files",
      "Owner deletes own business files",
    ]) {
      const match = src.match(new RegExp(`CREATE POLICY "${policy}"[\\s\\S]*?;`));
      expect(match).not.toBeNull();
      expect(match?.[0]).toContain("storage.foldername(name))[1]");
      expect(match?.[0]).toContain("b.owner_id = auth.uid()");
    }
  });
});

describe("admin document visibility -- readable labels, not raw enums", () => {
  const src = read("src/routes/_authenticated/admin.operators.$id.tsx");

  test("defines a DOC_TYPE_LABEL map covering the document types applicants can upload", () => {
    expect(src).toContain("DOC_TYPE_LABEL");
    expect(src).toMatch(/id_document/);
    expect(src).toMatch(/immigration_status/);
  });

  test("falls back to a spaced-out label instead of ever rendering a raw snake_case enum", () => {
    expect(src).toMatch(/DOC_TYPE_LABEL\[.*\]\s*\?\?.*replace\(\/_\/g/);
  });

  test("does not hardcode the old 'SA ID' wording for the representative identity row", () => {
    expect(src).not.toContain("SA ID");
  });
});

describe("admin operator list/queue view -- no sensitive document numbers", () => {
  test("admin.operators.index.tsx does not render the representative's raw ID/passport/permit number", () => {
    const src = read("src/routes/_authenticated/admin.operators.index.tsx");
    expect(src).not.toContain("representative_id_number");
  });
});

describe("repeated submission -- no duplicate operator business, edit lock after submission", () => {
  const src = read("src/lib/operators.functions.ts");

  test("an existing business_id always takes the update branch, never a second insert", () => {
    const insertMatches = src.match(/\.from\("operator_businesses"\)\s*\.insert\(/g) ?? [];
    expect(insertMatches.length).toBe(1);
    expect(src).toContain("if (businessId) {");
    expect(src).toContain(".update(contentFields)");
  });

  test("applicantCanEdit gates further writes once the application has moved past draft/changes-requested", () => {
    expect(src).toContain("applicantCanEdit(existing.application_status)");
    expect(src).toContain("This application cannot be edited");
  });

  test("submission completeness is enforced server-side, independent of what the client already checked", () => {
    expect(src).toContain("getCompletionChecklist");
    expect(src).toContain("isApplicationComplete(checklist)");
    expect(src).toContain("We still need some documents. Check the list above.");
  });
});
