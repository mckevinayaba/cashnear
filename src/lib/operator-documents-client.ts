import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type OperatorDocumentType = Database["public"]["Enums"]["document_type"];
type OperatorDocRow = Database["public"]["Tables"]["operator_documents"]["Row"];

/**
 * Client-side, RLS-scoped upload/replace for the applicant-facing operator
 * document flow -- mirrors the pattern already used for customer document
 * uploads (src/routes/_authenticated/customer.tsx's `upload` function):
 * direct `supabase.storage`/table calls under the caller's own session,
 * relying on the existing RLS policies (business ownership, suspended/
 * deactivated block) rather than a service-role server function, since
 * nothing here needs privileges beyond what the applicant already has over
 * their own business.
 */

// Matches the operator-documents bucket's own configured limits (see
// supabase/migrations/20260718070500_storage_bucket_provisioning.sql) --
// enforced again here for immediate client-side feedback, not as the
// authoritative check. The bucket itself remains the source of truth and
// rejects anything outside its own allowed_mime_types/file_size_limit
// regardless of what this client-side check does. Deliberately narrower
// than the bucket's allowance (which also permits image/webp) to match
// the plain "PDF, JPG, JPEG, PNG" list this flow was scoped to.
export const ALLOWED_OPERATOR_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
export const MAX_OPERATOR_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export function validateOperatorDocumentFile(file: File): string | null {
  if (!ALLOWED_OPERATOR_DOCUMENT_MIME_TYPES.has(file.type)) {
    return "Please upload a PDF, JPG or PNG file.";
  }
  if (file.size > MAX_OPERATOR_DOCUMENT_SIZE_BYTES) {
    return "That file is too large. Please upload a file under 10 MB.";
  }
  return null;
}

/**
 * Original filenames are preserved only where safe: stored purely as a
 * display-only DB column value (src/routes/_authenticated/admin.operators.$id.tsx
 * never renders it into an href/path), never used to construct the actual
 * storage path or any URL. Still stripped to a safe character set before
 * it ever reaches the database, since it's untrusted user input that a
 * browser will render as text.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

/**
 * Uploads (or replaces) the document for one business/doc_type slot.
 *
 * Failure-safe replace sequence (release-correction fix -- the previous
 * version deleted the old document before the new one was safely stored,
 * so a failure between those two steps left the applicant with no document
 * at all):
 *   1. validate the new file
 *   2. upload the new file to a new unique path -- the existing document
 *      (row + storage object) is completely untouched at this point
 *   3. create the new operator_documents record
 *   4. confirm the replacement is complete (the insert returned exactly
 *      one row -- see the `.single()` below)
 *   5. only now, with the new document safely in place, delete the old
 *      storage object(s) and row(s)
 *
 * If step 2 or 3 fails, the original document is untouched and unreferenced
 * new state is cleaned up where possible (see the insert-failure branch) --
 * the applicant is never left with no document. Step 5's cleanup is
 * best-effort: it re-queries for every row at this (business_id, doc_type)
 * slot OTHER than the one just inserted (not the pre-upload snapshot, so a
 * concurrent write is not clobbered) and removes each one individually; if
 * any single removal fails, the loop continues rather than surfacing an
 * error to the applicant, because the replacement itself already fully
 * succeeded -- an applicant who successfully replaced their document should
 * never see an error message. A leftover stale row cannot misrepresent the
 * applicant, since every caller that reads "the current document for a
 * slot" resolves it from the newest-created row for that doc_type.
 *
 * Storage path follows the existing convention the RLS policies already
 * enforce: {business_id}/{doc_type}/{filename} (see
 * supabase/migrations/20260718061546_...sql, "Owner uploads to own
 * business folder" and friends) -- this function does not introduce a new
 * path shape, and cannot write outside a path RLS would already reject.
 */
export async function uploadOperatorDocument(
  supabase: SupabaseClient<Database>,
  params: { businessId: string; docType: OperatorDocumentType; file: File; userId: string },
): Promise<OperatorDocRow> {
  const { businessId, docType, file, userId } = params;

  // 1. validate
  const validationError = validateOperatorDocumentFile(file);
  if (validationError) throw new Error(validationError);

  // 2. upload the new file to a new unique path. Nothing about the
  // existing document is touched yet, so a failure here leaves the
  // applicant exactly as they were before this call.
  const ext = sanitizeFilename(file.name).split(".").pop() || "bin";
  const path = `${businessId}/${docType}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("operator-documents")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) throw new Error("We could not send your document. Please try again.");

  // 3. create the new operator_documents record.
  const { data: inserted, error: insertErr } = await supabase
    .from("operator_documents")
    .insert({
      business_id: businessId,
      doc_type: docType,
      storage_path: path,
      original_filename: sanitizeFilename(file.name),
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: userId,
    })
    .select("*")
    .single();
  if (insertErr) {
    // The new record was never created, so this is a completely new
    // (unreferenced) file, not the applicant's existing document -- remove
    // it so it doesn't sit orphaned in storage (including RLS rejecting
    // the insert, e.g. a suspended business, which the table policy blocks
    // but the storage upload policy alone does not). The applicant's
    // original document, if any, is still exactly as it was.
    await supabase.storage.from("operator-documents").remove([path]);
    throw new Error("We could not send your document. Please try again.");
  }

  // 4. Replacement is now complete and durable: `inserted` is the single
  // row PostgREST returned for this insert, so the new document is safely
  // recorded before anything old is touched.

  // 5. Clean up whatever else is left at this slot now that the new
  // document is in place. Best-effort and non-fatal: the applicant already
  // has a valid, complete document at this point, so a cleanup failure
  // must never be reported to them as a failed upload.
  const { data: staleRows } = await supabase
    .from("operator_documents")
    .select("id, storage_path")
    .eq("business_id", businessId)
    .eq("doc_type", docType)
    .neq("id", inserted.id);

  for (const stale of staleRows ?? []) {
    try {
      await supabase.storage.from("operator-documents").remove([stale.storage_path]);
    } catch {
      // Best-effort: the replacement already succeeded regardless.
    }
    try {
      await supabase.from("operator_documents").delete().eq("id", stale.id);
    } catch {
      // Best-effort: see above.
    }
  }

  return inserted;
}
