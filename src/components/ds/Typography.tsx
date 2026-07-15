import { cn } from "@/lib/utils";
import type { HTMLAttributes, PropsWithChildren } from "react";

/**
 * Typography scale for CashNear.
 * Large numbers, minimal text, tight tracking.
 */

export function Display({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h1
      className={cn(
        "text-[44px] leading-[1.02] font-semibold tracking-[-0.03em] text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  );
}

export function Headline({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h2
      className={cn(
        "text-2xl font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  );
}

export function Title({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h3
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function Body({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  return (
    <p className={cn("text-[15px] leading-6 text-foreground", className)} {...props}>
      {children}
    </p>
  );
}

export function Muted({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) {
  return (
    <p
      className={cn("text-sm leading-5 text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function Eyebrow({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>>) {
  return (
    <span
      className={cn(
        "text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Numeric({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>>) {
  return (
    <span
      className={cn(
        "tabular font-semibold tracking-[-0.02em] text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
