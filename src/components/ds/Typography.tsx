import { cn } from "@/lib/utils";
import type { HTMLAttributes, PropsWithChildren } from "react";

/**
 * Typography — editorial serif for hero moments, geometric sans for UI.
 * Numbers are big and quiet. Text breathes.
 */

export function Display({
  className,
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h1
      className={cn(
        "font-display text-[52px] leading-[0.98] tracking-[-0.02em] text-foreground sm:text-[64px]",
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
        "font-display text-[28px] leading-[1.05] tracking-[-0.015em] text-foreground",
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
      className={cn(
        "text-[15px] font-medium tracking-[-0.005em] text-foreground",
        className,
      )}
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
    <p className={cn("text-[15px] leading-[1.55] text-foreground/90", className)} {...props}>
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
      className={cn("text-[13.5px] leading-[1.55] text-muted-foreground", className)}
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
        "text-[10.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground",
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
        "tabular font-display tracking-[-0.02em] text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
