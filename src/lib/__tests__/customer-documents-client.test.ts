import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  uploadCustomerDocument,
  validateCustomerDocumentFile,
  MAX_CUSTOMER_DOCUMENT_SIZE_BYTES,
} from "@/lib/customer-documents-client";
import type { Database } from "@/integrations/supabase/types";

/**
 * Behavioural tests for the failure-safe customer document replacement,
 * mirroring the pattern used for operator-document-replacement.test.ts --
 * drives the real uploadCustomerDocument against a small in-memory fake
 * client and a fake updatePath call, tailored to exactly the shapes this
 * module actually uses (not a general-purpose Supabase mock).
 */

function makeFakeSupabase(opts: {
  storageObjects: Set<string>;
  failUpload?: boolean;
  failRemovePaths?: Set<string>;
}) {
  const client = {
    storage: {
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
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

type FakeRecord = { id: string | null; selfie: string | null };

function makeFakeUpdatePath(record: FakeRecord, opts?: { fail?: boolean }) {
  return async ({ data }: { data: { kind: "id" | "selfie"; path: string } }) => {
    if (opts?.fail) throw new Error("db update failed");
    const key = data.kind === "id" ? "id" : "selfie";
    const previousPath = record[key];
    record[key] = data.path;
    return { previousPath };
  };
}

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

const USER_ID = "user-1";

describe("uploadCustomerDocument — failure-safe replacement", () => {
  test("successful replacement: old object removed, record points to the new path", async () => {
    const storageObjects = new Set([`${USER_ID}/id-1000.jpg`]);
    const record: FakeRecord = { id: `${USER_ID}/id-1000.jpg`, selfie: null };
    const supabase = makeFakeSupabase({ storageObjects });
    const updatePath = makeFakeUpdatePath(record);

    const result = await uploadCustomerDocument(supabase, updatePath, {
      userId: USER_ID,
      kind: "id",
      file: makeFile("new-id.jpg", "image/jpeg"),
    });

    expect(record.id).toBe(result.path);
    expect(storageObjects.has(result.path)).toBe(true);
    expect(storageObjects.has(`${USER_ID}/id-1000.jpg`)).toBe(false);
    expect(storageObjects.size).toBe(1);
  });

  test("upload failure: nothing is touched, old document survives", async () => {
    const oldPath = `${USER_ID}/id-1000.jpg`;
    const storageObjects = new Set([oldPath]);
    const record: FakeRecord = { id: oldPath, selfie: null };
    const supabase = makeFakeSupabase({ storageObjects, failUpload: true });
    const updatePath = makeFakeUpdatePath(record);

    await expect(
      uploadCustomerDocument(supabase, updatePath, {
        userId: USER_ID,
        kind: "id",
        file: makeFile("new-id.jpg", "image/jpeg"),
      }),
    ).rejects.toThrow();

    expect(record.id).toBe(oldPath);
    expect(storageObjects.has(oldPath)).toBe(true);
    expect(storageObjects.size).toBe(1);
  });

  test("database update failure: the newly uploaded orphan is removed, old document survives untouched", async () => {
    const oldPath = `${USER_ID}/id-1000.jpg`;
    const storageObjects = new Set([oldPath]);
    const record: FakeRecord = { id: oldPath, selfie: null };
    const supabase = makeFakeSupabase({ storageObjects });
    const updatePath = makeFakeUpdatePath(record, { fail: true });

    await expect(
      uploadCustomerDocument(supabase, updatePath, {
        userId: USER_ID,
        kind: "id",
        file: makeFile("new-id.jpg", "image/jpeg"),
      }),
    ).rejects.toThrow();

    // old document remains available after failure
    expect(record.id).toBe(oldPath);
    expect(storageObjects.has(oldPath)).toBe(true);
    // no orphaned object remains after the compensated failure
    expect(storageObjects.size).toBe(1);
  });

  test("first-ever upload for a slot (no prior document): succeeds, nothing to clean up", async () => {
    const storageObjects = new Set<string>();
    const record: FakeRecord = { id: null, selfie: null };
    const supabase = makeFakeSupabase({ storageObjects });
    const updatePath = makeFakeUpdatePath(record);

    const result = await uploadCustomerDocument(supabase, updatePath, {
      userId: USER_ID,
      kind: "selfie",
      file: makeFile("selfie.png", "image/png"),
    });

    expect(record.selfie).toBe(result.path);
    expect(storageObjects.size).toBe(1);
  });

  test("cleanup failure on the old object after a successful replacement is non-fatal", async () => {
    const oldPath = `${USER_ID}/id-1000.jpg`;
    const storageObjects = new Set([oldPath]);
    const record: FakeRecord = { id: oldPath, selfie: null };
    const supabase = makeFakeSupabase({ storageObjects, failRemovePaths: new Set([oldPath]) });
    const updatePath = makeFakeUpdatePath(record);

    const result = await uploadCustomerDocument(supabase, updatePath, {
      userId: USER_ID,
      kind: "id",
      file: makeFile("new-id.jpg", "image/jpeg"),
    });

    // Replacement itself succeeded -- the record points at the new file --
    // even though the stale old object couldn't be removed this time.
    expect(record.id).toBe(result.path);
    expect(storageObjects.has(oldPath)).toBe(true);
  });

  test("repeated replacement across multiple calls leaves only the currently active document", async () => {
    const storageObjects = new Set<string>();
    const record: FakeRecord = { id: null, selfie: null };
    const supabase = makeFakeSupabase({ storageObjects });
    const updatePath = makeFakeUpdatePath(record);
    // Paths are timestamp-based (Date.now()); a tiny delay between calls
    // guarantees distinct paths instead of a same-millisecond collision.
    const wait = () => new Promise((resolve) => setTimeout(resolve, 2));

    const first = await uploadCustomerDocument(supabase, updatePath, {
      userId: USER_ID,
      kind: "id",
      file: makeFile("attempt-1.jpg", "image/jpeg"),
    });
    await wait();
    const second = await uploadCustomerDocument(supabase, updatePath, {
      userId: USER_ID,
      kind: "id",
      file: makeFile("attempt-2.jpg", "image/jpeg"),
    });
    await wait();
    const third = await uploadCustomerDocument(supabase, updatePath, {
      userId: USER_ID,
      kind: "id",
      file: makeFile("attempt-3.jpg", "image/jpeg"),
    });

    expect(record.id).toBe(third.path);
    expect(storageObjects.size).toBe(1);
    expect(storageObjects.has(first.path)).toBe(false);
    expect(storageObjects.has(second.path)).toBe(false);
    expect(storageObjects.has(third.path)).toBe(true);
  });
});

describe("validateCustomerDocumentFile — format/size checks", () => {
  test("accepts a PDF for the id-document slot", () => {
    expect(validateCustomerDocumentFile(makeFile("id.pdf", "application/pdf"), "id")).toBeNull();
  });
  test("accepts a JPEG for the id-document slot", () => {
    expect(validateCustomerDocumentFile(makeFile("id.jpg", "image/jpeg"), "id")).toBeNull();
  });
  test("rejects a PDF for the selfie slot -- a selfie can never be a document scan", () => {
    expect(
      validateCustomerDocumentFile(makeFile("selfie.pdf", "application/pdf"), "selfie"),
    ).not.toBeNull();
  });
  test("accepts a PNG for the selfie slot", () => {
    expect(validateCustomerDocumentFile(makeFile("selfie.png", "image/png"), "selfie")).toBeNull();
  });
  test("rejects a file over the configured size limit", () => {
    const file = makeFile("id.jpg", "image/jpeg", MAX_CUSTOMER_DOCUMENT_SIZE_BYTES + 1);
    expect(validateCustomerDocumentFile(file, "id")).not.toBeNull();
  });
  test("accepts a file exactly at the size limit", () => {
    const file = makeFile("id.jpg", "image/jpeg", MAX_CUSTOMER_DOCUMENT_SIZE_BYTES);
    expect(validateCustomerDocumentFile(file, "id")).toBeNull();
  });
});

describe("submitCustomerVerification -- optional selfie stored as null, not empty string", () => {
  const src = readFileSync(join(import.meta.dir, "..", "customer.functions.ts"), "utf8");

  test("selfie_path is coalesced to null before the upsert, never persisted as an empty string", () => {
    expect(src).toContain("selfie_path: data.selfie_path || null");
  });
});
