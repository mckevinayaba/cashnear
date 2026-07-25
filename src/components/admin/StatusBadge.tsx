import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONE_CLASSES: Record<"muted" | "warn" | "success" | "danger", string> = {
  muted: "border-border-strong text-muted-foreground",
  warn: "border-gold/40 text-gold",
  success: "border-success/40 text-success",
  danger: "border-destructive/40 text-destructive",
};

export function StatusBadge({
  label,
  tone,
  className,
}: {
  label: string;
  tone: "muted" | "warn" | "success" | "danger";
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[tone], "capitalize", className)}>
      {label.replace(/_/g, " ")}
    </Badge>
  );
}

export const CUSTOMER_STATUS_TONE: Record<string, "muted" | "warn" | "success" | "danger"> = {
  unverified: "muted",
  pending: "warn",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
};

export const OPERATOR_STATUS_TONE: Record<string, "muted" | "warn" | "success" | "danger"> = {
  draft: "muted",
  submitted: "warn",
  under_review: "warn",
  info_requested: "warn",
  site_verification_required: "warn",
  approved: "success",
  rejected: "danger",
  suspended: "danger",
  deactivated: "muted",
};
