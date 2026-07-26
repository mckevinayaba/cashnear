import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateOperatorDocumentFile,
  ALLOWED_OPERATOR_DOCUMENT_MIME_TYPES,
  MAX_OPERATOR_DOCUMENT_SIZE_BYTES,
} from "@/lib/operator-documents-client";

function makeFile(name: string, type: string, sizeBytes: number): File {
  const bytes = new Uint8Array(sizeBytes);
  return new File([bytes], name, { type });
}

describe("validateOperatorDocumentFile — client-side format/size checks", () => {
  test("accepts a valid PDF under the size limit", () => {
    const file = makeFile("id.pdf", "application/pdf", 1024);
    expect(validateOperatorDocumentFile(file)).toBeNull();
  });
  test("accepts a valid JPEG under the size limit", () => {
    const file = makeFile("id.jpg", "image/jpeg", 1024);
    expect(validateOperatorDocumentFile(file)).toBeNull();
  });
  test("accepts a valid PNG under the size limit", () => {
    const file = makeFile("id.png", "image/png", 1024);
    expect(validateOperatorDocumentFile(file)).toBeNull();
  });

  test("invalid file type: rejects an executable disguised with a document-ish name", () => {
    const file = makeFile("id.exe", "application/x-msdownload", 1024);
    const err = validateOperatorDocumentFile(file);
    expect(err).not.toBeNull();
    expect(err).toContain("PDF, JPG or PNG");
  });
  test("invalid file type: rejects a plain text file", () => {
    const file = makeFile("id.txt", "text/plain", 1024);
    expect(validateOperatorDocumentFile(file)).not.toBeNull();
  });
  test("invalid file type: rejects webp even though the storage bucket itself technically allows it -- this flow intentionally offers a narrower set (PDF/JPG/PNG only, per spec)", () => {
    const file = makeFile("id.webp", "image/webp", 1024);
    expect(validateOperatorDocumentFile(file)).not.toBeNull();
  });
  test("invalid file type: rejects an HTML file (script-injection-adjacent format)", () => {
    const file = makeFile("id.html", "text/html", 1024);
    expect(validateOperatorDocumentFile(file)).not.toBeNull();
  });

  test("file too large: rejects a file over the configured limit", () => {
    const file = makeFile("id.pdf", "application/pdf", MAX_OPERATOR_DOCUMENT_SIZE_BYTES + 1);
    const err = validateOperatorDocumentFile(file);
    expect(err).not.toBeNull();
    expect(err).toContain("too large");
  });
  test("accepts a file exactly at the size limit", () => {
    const file = makeFile("id.pdf", "application/pdf", MAX_OPERATOR_DOCUMENT_SIZE_BYTES);
    expect(validateOperatorDocumentFile(file)).toBeNull();
  });

  test("the allowed MIME set matches exactly PDF/JPEG/PNG -- no more, no less", () => {
    expect(ALLOWED_OPERATOR_DOCUMENT_MIME_TYPES).toEqual(
      new Set(["application/pdf", "image/jpeg", "image/png"]),
    );
  });

  test("the size limit matches the operator-documents bucket's own configured limit (10 MiB) -- see storage_bucket_provisioning migration", () => {
    expect(MAX_OPERATOR_DOCUMENT_SIZE_BYTES).toBe(10 * 1024 * 1024);
    const bucketMigration = readFileSync(
      join(
        import.meta.dir,
        "..",
        "..",
        "..",
        "supabase",
        "migrations",
        "20260718070500_storage_bucket_provisioning.sql",
      ),
      "utf8",
    );
    expect(bucketMigration).toContain("10485760");
  });

  test("error messages are plain language, never a raw MIME string or byte count", () => {
    const typeErr = validateOperatorDocumentFile(
      makeFile("id.exe", "application/x-msdownload", 1024),
    );
    const sizeErr = validateOperatorDocumentFile(
      makeFile("id.pdf", "application/pdf", MAX_OPERATOR_DOCUMENT_SIZE_BYTES + 1),
    );
    expect(typeErr).not.toMatch(/application\/|image\//);
    expect(sizeErr).not.toMatch(/\d{6,}/); // no raw byte count leaking through
  });
});

describe("uploadOperatorDocument — structural checks on replace/orphan-avoidance behaviour", () => {
  const src = readFileSync(join(import.meta.dir, "..", "operator-documents-client.ts"), "utf8");

  test("failure-safe order: the new file is uploaded, then inserted as a row, BEFORE any old object/row is removed (old document survives an upload or insert failure)", () => {
    const uploadIndex = src.indexOf('.storage\n    .from("operator-documents")\n    .upload(path');
    const insertIndex = src.indexOf('.from("operator_documents")\n    .insert({');
    const staleQueryIndex = src.indexOf('.select("id, storage_path")');
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(-1);
    expect(staleQueryIndex).toBeGreaterThan(-1);
    // upload new -> insert new -> only then look up what's now stale
    expect(uploadIndex).toBeLessThan(insertIndex);
    expect(insertIndex).toBeLessThan(staleQueryIndex);
  });

  test("stale-row lookup excludes the row that was just inserted (re-queries live state rather than trusting a pre-upload snapshot)", () => {
    expect(src).toContain('.neq("id", inserted.id)');
  });

  test("old row/object cleanup happens after the insert, and is wrapped so a cleanup failure cannot propagate as an error to the applicant", () => {
    const insertIndex = src.indexOf('.from("operator_documents")\n    .insert({');
    const cleanupBlock = src.slice(insertIndex);
    const removeIndex = cleanupBlock.indexOf(
      '.storage.from("operator-documents").remove([stale.storage_path])',
    );
    const deleteIndex = cleanupBlock.indexOf(
      '.from("operator_documents").delete().eq("id", stale.id)',
    );
    expect(removeIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(-1);
    // both cleanup calls are individually try/catch-wrapped
    const tryCount = (cleanupBlock.match(/try \{/g) ?? []).length;
    expect(tryCount).toBeGreaterThanOrEqual(2);
  });

  test("cleans up the newly uploaded storage object if the row insert fails (never leaves an orphaned file behind)", () => {
    const insertIndex = src.indexOf('.from("operator_documents")\n    .insert({');
    const cleanupBlock = src.slice(insertIndex);
    expect(cleanupBlock).toContain("insertErr");
    expect(cleanupBlock).toContain(".remove([path])");
  });

  test("storage path follows the existing RLS-enforced {business_id}/{doc_type}/... convention -- not a new path shape", () => {
    expect(src).toMatch(/\$\{businessId\}\/\$\{docType\}\//);
  });

  test("never constructs or exposes a public URL -- only storage.upload/remove and table inserts/deletes", () => {
    expect(src).not.toContain("getPublicUrl");
  });
});
