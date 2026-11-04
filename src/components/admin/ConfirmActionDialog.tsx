import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ds/Button";
import { Textarea } from "@/components/ui/textarea";
import { MIN_REASON_LENGTH } from "@/lib/admin-reason-validation";

/**
 * Pure, exported so it's directly testable: the confirm button is enabled
 * only when not already submitting (prevents duplicate/double-submit) and,
 * if a reason is required, only once it meets the minimum length.
 */
export function canSubmitAction(params: {
  requireReason?: boolean;
  reason: string;
  busy: boolean;
  minReasonLength?: number;
}): boolean {
  const reasonOk =
    !params.requireReason ||
    params.reason.trim().length >= (params.minReasonLength ?? MIN_REASON_LENGTH);
  return reasonOk && !params.busy;
}

export interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** When true, a non-empty (>= MIN_REASON_LENGTH char) reason is required before the confirm button enables. */
  requireReason?: boolean;
  reasonLabel?: string;
  destructive?: boolean;
  /** Resolves on success (dialog closes, onSuccess fires) or throws (error shown, dialog stays open). */
  onConfirm: (reason: string) => Promise<void>;
  onSuccess?: () => void;
}

/**
 * Shared confirmation dialog for every privileged admin decision (approve,
 * reject, suspend, reinstate). Deliberately built on the plain Dialog
 * primitive rather than AlertDialog: AlertDialog.Action closes on click by
 * default regardless of an in-flight async operation, which is the wrong
 * behaviour here -- we need the dialog to stay open, disabled, and showing
 * an error if the server call fails, and only close after a confirmed
 * success. Using a plain button (not DialogClose) for the confirm action
 * gives full manual control over when the dialog actually closes.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requireReason,
  reasonLabel = "Reason",
  destructive,
  onConfirm,
  onSuccess,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonOk = !requireReason || reason.trim().length >= MIN_REASON_LENGTH;
  const canSubmit = canSubmitAction({ requireReason, reason, busy });

  const handleOpenChange = (next: boolean) => {
    if (busy) return; // prevent closing mid-submit
    if (!next) {
      setReason("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason("");
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {requireReason ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted-foreground">{reasonLabel}</span>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={`At least ${MIN_REASON_LENGTH} characters -- this is recorded on the record.`}
              disabled={busy}
              aria-required="true"
              aria-invalid={!reasonOk}
            />
            {!reasonOk && reason.length > 0 ? (
              <span className="text-[12px] text-destructive">
                Reason must be at least {MIN_REASON_LENGTH} characters.
              </span>
            ) : null}
          </label>
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="primary"
            className={destructive ? "!bg-destructive !text-destructive-foreground" : undefined}
            disabled={!canSubmit}
            onClick={handleConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
