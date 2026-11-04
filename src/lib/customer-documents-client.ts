import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type CustomerDocumentKind = "id" | "selfie";

// A selfie can never be a scanned PDF; an identity document photo can be
// either a photo or a PDF scan. Matches the same PDF/JPEG/PNG allowance
// used for operator documents (see operator-documents-client.ts).
const ALLOWED_ID_DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_SELFIE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
export const MAX_CUSTOMER_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export function validateCustomerDocumentFile(
  file: File,
  kind: CustomerDocumentKind,
): string | null {
  const allowed = kind === "id" ? ALLOWED_ID_DOCUMENT_MIME_TYPES : ALLOWED_SELFIE_MIME_TYPES;
  if (!allowed.has(file.type)) {
    return kind === "id"
      ? "Please upload a PDF, JPG or PNG file."
      : "Please upload a JPG or PNG photo.";
  }
  if (file.size > MAX_CUSTOMER_DOCUMENT_SIZE_BYTES) {
    return "That file is too large. Please upload a file under 10 MB.";
  }
  return null;
}

function sanitizeExtension(name: string): string {
  const ext = name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

/**
 * Failure-safe upload/replace for a customer's id-document or selfie
 * photo:
 *   1. validate the new file
 *   2. upload it to a new unique path -- the existing document is
 *      completely untouched at this point
 *   3. persist the new path to the customer record via `updatePath`
 *      (service-role-backed; these columns are admin-only for direct
 *      client UPDATE -- see updateCustomerDocumentPath)
 *   4. confirmed by (3) succeeding, which returns the previous path
 *   5. only now, with the new document safely on record, delete the
 *      previous object, if the record actually had one
 *
 * If the upload fails, nothing is touched -- the existing document (if
 * any) is untouched. If the record update fails, the newly uploaded
 * (now-unreferenced) object is removed, so nothing is left orphaned, and
 * the document that was actually on record is untouched.
 */
export async function uploadCustomerDocument(
  supabase: SupabaseClient<Database>,
  updatePath: (input: {
    data: { kind: CustomerDocumentKind; path: string };
  }) => Promise<{ previousPath: string | null }>,
  params: { userId: string; kind: CustomerDocumentKind; file: File },
): Promise<{ path: string; previousPath: string | null }> {
  const { userId, kind, file } = params;

  const validationError = validateCustomerDocumentFile(file, kind);
  if (validationError) throw new Error(validationError);

  const ext = sanitizeExtension(file.name);
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("customer-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw new Error("We could not send your document. Please try again.");

  let previousPath: string | null;
  try {
    const result = await updatePath({ data: { kind, path } });
    previousPath = result.previousPath;
  } catch {
    // The record was never updated to reference the new file -- it's an
    // orphan, not a replacement. Clean it up; the document that was
    // actually on record (if any) was never touched.
    await supabase.storage.from("customer-documents").remove([path]);
    throw new Error("We could not send your document. Please try again.");
  }

  if (previousPath && previousPath !== path) {
    try {
      await supabase.storage.from("customer-documents").remove([previousPath]);
    } catch {
      // Best-effort cleanup only -- the replacement itself already
      // succeeded, so a stale object here must never be reported as a
      // failed upload to the customer.
    }
  }

  return { path, previousPath };
}
