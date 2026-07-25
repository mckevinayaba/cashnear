import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ds";
import { getSignedDocumentUrl } from "@/lib/documents.functions";

/**
 * Opens a private document via a short-lived signed URL, generated on
 * demand -- never a permanent public URL, never a raw storage path exposed
 * in the DOM/href. The signed URL itself is requested only at click time
 * and is not logged or persisted anywhere on the client.
 */
export function DocumentLink({
  bucket,
  path,
  label,
}: {
  bucket: "operator-documents" | "customer-documents";
  path: string;
  label: string;
}) {
  const getSignedUrl = useServerFn(getSignedDocumentUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await getSignedUrl({ data: { bucket, path } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this document.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void open()}>
        {busy ? "Opening…" : label}
      </Button>
      {error ? <span className="text-[12px] text-destructive">{error}</span> : null}
    </div>
  );
}
