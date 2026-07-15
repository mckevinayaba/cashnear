import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "outline" | "gold";
}

/**
 * Card — floating surface with subtle elevation.
 * Use `elevated` for the primary card on a screen.
 * Use `gold` sparingly, only for critical trust/emphasis moments.
 */
export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card text-card-foreground",
        variant === "default" && "shadow-[var(--shadow-elevated)]",
        variant === "elevated" &&
          "bg-surface-elevated border-border-strong shadow-[var(--shadow-float)]",
        variant === "outline" && "bg-transparent",
        variant === "gold" &&
          "border-gold/30 bg-surface-elevated shadow-[var(--shadow-gold)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-3", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-lg font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  );
}

export function CardSubtle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}
