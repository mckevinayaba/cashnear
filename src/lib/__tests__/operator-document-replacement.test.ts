import { describe, test, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadOperatorDocument } from "@/lib/operator-documents-client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Behavioural tests for the failure-safe replacement algorithm in
 * uploadOperatorDocument (src/lib/operator-documents-client.ts). This
 * repo's usual pattern for "can't stand up a real DB" logic is a
 * structural readFileSync test (see operator-documents-client-upload.test.ts),
 * but the property this pass needs to prove -- "if X fails, Y does/doesn't
 * happen, and the applicant's original document survives" -- is a runtime
 * behaviour, not a source-text pattern. So this file drives the real
 * function against a small in-memory fake client, tailored to exactly the
 * call shapes operator-documents-client.ts uses (not a general-purpose
 * Supabase mock).
 */

type DocRow = {
  id: string;
  business_id: string;
  doc_type: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
};

function makeFakeSupabase(opts: {
  documents: Map<string, DocRow>;
  storageObjects: Set<string>;
  failUpload?: boolean;
  failInsert?: boolean;
  failRemovePaths?: Set<string>;
  failDeleteIds?: Set<string>;
}) {
  let nextId = 1;

  const storage = {
    from(_bucket: string) {
      return {
        async upload(path: string) {
          if (opts.failUpload) return { error: { message: "upload failed" } };
          opts.storageObjects.add(path);
          return { error: null };
        },
        async remove(paths: string[]) {
          for (const p of paths) {
            if (opts.failRemovePaths?.has(p)) return { error: { message: "remove failed" } };
            opts.storageObjects.delete(p);
          }
          return { error: null };
        },
      };
    },
  };

  function documentsTable() {
    return {
      select(_cols: string) {
        const filters: { business_id?: string; doc_type?: string; neqId?: string } = {};
        const builder = {
          eq(col: string, val: string) {
            if (col === "business_id") filters.business_id = val;
            if (col === "doc_type") filters.doc_type = val;
            return builder;
          },
          neq(col: string, val: string) {
            if (col === "id") filters.neqId = val;
            return builder;
          },
          then(resolve: (v: { data: DocRow[]; error: null }) => void) {
            const rows = Array.from(opts.documents.values()).filter(
              (r) =>
                (!filters.business_id || r.business_id === filters.business_id) &&
                (!filters.doc_type || r.doc_type === filters.doc_type) &&
                (!filters.neqId || r.id !== filters.neqId),
            );
            resolve({ data: rows, error: null });
          },
        };
        return builder;
      },
      insert(row: Omit<DocRow, "id">) {
        return {
          select(_cols: string) {
            return {
              async single() {
                if (opts.failInsert) {
                  return { data: null, error: { message: "insert failed" } };
                }
                const id = String(nextId++);
                const full: DocRow = { id, ...row };
                opts.documents.set(id, full);
                return { data: full, error: null };
              },
            };
          },
        };
      },
      delete() {
        return {
          async eq(col: string, val: string) {
            if (col === "id") {
              if (opts.failDeleteIds?.has(val)) return { error: { message: "delete failed" } };
              opts.documents.delete(val);
            }
            return { error: null };
          },
        };
      },
    };
  }

  const client = {
    storage,
    from(table: string) {
      if (table === "operator_documents") return documentsTable();
      throw new Error(`unexpected table ${table}`);
    },
  };

  return client as unknown as SupabaseClient<Database>;
}

function makeFile(name: string, type: string, sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const BUSINESS_ID = "biz-1";
const DOC_TYPE = "id_document" as Database["public"]["Enums"]["document_type"];

describe("uploadOperatorDocument — failure-safe replacement", () => {
  test("successful replacement: old row and old storage object are both removed, new one is the only one left", async () => {
    const documents = new Map<string, DocRow>([
      [
        "old-1",
        {
          id: "old-1",
          business_id: BUSINESS_ID,
          doc_type: DOC_TYPE,
          storage_path: `${BUSINESS_ID}/${DOC_TYPE}/old.pdf`,
          original_filename: "old.pdf",
          mime_type: "application/pdf",
          size_bytes: 10,
          uploaded_by: "user-1",
        },
      ],
    ]);
    const storageObjects = new Set([`${BUSINESS_ID}/${DOC_TYPE}/old.pdf`]);
    const supabase = makeFakeSupabase({ documents, storageObjects });

    const file = makeFile("new.pdf", "application/pdf", 20);
    const result = await uploadOperatorDocument(supabase, {
      businessId: BUSINESS_ID,
      docType: DOC_TYPE,
      file,
      userId: "user-1",
    });

    expect(documents.size).toBe(1);
    expect(documents.has("old-1")).toBe(false);
    expect(documents.get(result.id)).toBeDefined();
    expect(storageObjects.has(`${BUSINESS_ID}/${DOC_TYPE}/old.pdf`)).toBe(false);
    expect(storageObjects.size).toBe(1);
  });

  test("upload failure during replacement: old row and old storage object are untouched, no new row is created", async () => {
    const oldRow: DocRow = {
      id: "old-1",
      business_id: BUSINESS_ID,
      doc_type: DOC_TYPE,
      storage_path: `${BUSINESS_ID}/${DOC_TYPE}/old.pdf`,
      original_filename: "old.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      uploaded_by: "user-1",
    };
    const documents = new Map<string, DocRow>([["old-1", oldRow]]);
    const storageObjects = new Set([oldRow.storage_path]);
    const supabase = makeFakeSupabase({ documents, storageObjects, failUpload: true });

    const file = makeFile("new.pdf", "application/pdf", 20);
    await expect(
      uploadOperatorDocument(supabase, {
        businessId: BUSINESS_ID,
        docType: DOC_TYPE,
        file,
        userId: "user-1",
      }),
    ).rejects.toThrow();

    // old document remains available after failure
    expect(documents.size).toBe(1);
    expect(documents.get("old-1")).toEqual(oldRow);
    expect(storageObjects.has(oldRow.storage_path)).toBe(true);
    expect(storageObjects.size).toBe(1);
  });

  test("database-row failure during replacement: old row/object untouched, and the orphaned new storage object is cleaned up (no orphan left behind)", async () => {
    const oldRow: DocRow = {
      id: "old-1",
      business_id: BUSINESS_ID,
      doc_type: DOC_TYPE,
      storage_path: `${BUSINESS_ID}/${DOC_TYPE}/old.pdf`,
      original_filename: "old.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      uploaded_by: "user-1",
    };
    const documents = new Map<string, DocRow>([["old-1", oldRow]]);
    const storageObjects = new Set([oldRow.storage_path]);
    const supabase = makeFakeSupabase({ documents, storageObjects, failInsert: true });

    const file = makeFile("new.pdf", "application/pdf", 20);
    await expect(
      uploadOperatorDocument(supabase, {
        businessId: BUSINESS_ID,
        docType: DOC_TYPE,
        file,
        userId: "user-1",
      }),
    ).rejects.toThrow();

    // old document remains available after failure
    expect(documents.size).toBe(1);
    expect(documents.get("old-1")).toEqual(oldRow);
    // no orphaned object remains after compensated failure -- the new file
    // that was uploaded before the DB insert failed must be cleaned up,
    // leaving only the untouched old object.
    expect(storageObjects.size).toBe(1);
    expect(storageObjects.has(oldRow.storage_path)).toBe(true);
  });

  test("first upload for a slot (no prior document): succeeds and leaves exactly one row, no cleanup errors from an empty stale-row query", async () => {
    const documents = new Map<string, DocRow>();
    const storageObjects = new Set<string>();
    const supabase = makeFakeSupabase({ documents, storageObjects });

    const file = makeFile("first.pdf", "application/pdf", 20);
    const result = await uploadOperatorDocument(supabase, {
      businessId: BUSINESS_ID,
      docType: DOC_TYPE,
      file,
      userId: "user-1",
    });

    expect(documents.size).toBe(1);
    expect(documents.get(result.id)).toBeDefined();
    expect(storageObjects.size).toBe(1);
  });

  test("old-row cleanup failure after a successful replacement is non-fatal: the new document is still returned, no error is surfaced", async () => {
    const oldRow: DocRow = {
      id: "old-1",
      business_id: BUSINESS_ID,
      doc_type: DOC_TYPE,
      storage_path: `${BUSINESS_ID}/${DOC_TYPE}/old.pdf`,
      original_filename: "old.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      uploaded_by: "user-1",
    };
    const documents = new Map<string, DocRow>([["old-1", oldRow]]);
    const storageObjects = new Set([oldRow.storage_path]);
    const supabase = makeFakeSupabase({
      documents,
      storageObjects,
      failDeleteIds: new Set(["old-1"]),
    });

    const file = makeFile("new.pdf", "application/pdf", 20);
    const result = await uploadOperatorDocument(supabase, {
      businessId: BUSINESS_ID,
      docType: DOC_TYPE,
      file,
      userId: "user-1",
    });

    // The replacement itself succeeded -- the applicant is never shown an
    // error for a cleanup step that is entirely internal bookkeeping.
    expect(result).toBeDefined();
    expect(documents.get(result.id)).toBeDefined();
    // The stale old row could not be deleted in this scenario (by design,
    // to prove cleanup failure doesn't propagate) -- documented as a
    // best-effort limitation, not silently pretended away.
    expect(documents.has("old-1")).toBe(true);
  });
});
