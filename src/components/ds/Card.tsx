import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "quiet" | "lift" | "outline";
}

/**
 * Card — subtle surface. No borders by default (surface elevation only).
 * quiet   — flat surface, no shadow
 * lift    — reserved for a screen's primary card
 * outline — hairline border, no fill
 */
export function Card({ className, variant = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl text-card-foreground",
        variant === "default" && "bg-surface",
        variant === "quiet" && "bg-surface-2/40",
        variant === "lift" && "bg-surface-2 shadow-[var(--shadow-lift)]",
        variant === "outline" && "border border-border bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pt-6 pb-2", className)} {...props} />;
}
export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-6", className)} {...props} />;
}
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[15px] font-medium tracking-tight text-foreground", className)}
      {...props}
    />
  );
}
export function CardSubtle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-muted-foreground", className)} {...props} />;
}
