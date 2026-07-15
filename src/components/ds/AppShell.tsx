import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  header?: ReactNode;
  className?: string;
  hideNav?: boolean;
  /** Wide desktop layout for institution / analytics views. */
  desktopWide?: boolean;
}

/**
 * AppShell — mobile-first single-column with responsive desktop widening.
 * On >= lg, the shell centres in a narrow reading column unless
 * `desktopWide` is set, which unlocks a Stripe-Dashboard-style canvas.
 */
export function AppShell({
  header,
  hideNav,
  className,
  desktopWide,
  children,
}: PropsWithChildren<AppShellProps>) {
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full flex-col",
          desktopWide ? "max-w-6xl" : "max-w-[440px] lg:max-w-[520px]",
        )}
      >
        {header ? (
          <header className="sticky top-0 z-30 bg-background/70 px-6 pb-3 pt-[max(env(safe-area-inset-top),1.25rem)] backdrop-blur-xl">
            {header}
          </header>
        ) : null}
        <main
          className={cn(
            "flex-1 px-6",
            hideNav ? "pb-10" : "pb-28",
            className,
          )}
        >
          {children}
        </main>
      </div>
      {hideNav ? null : <BottomNav />}
    </div>
  );
}

export function Screen({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("flex flex-col gap-10 py-6 animate-rise", className)}>
      {children}
    </div>
  );
}

export function Section({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <section className={cn("flex flex-col gap-4", className)}>{children}</section>;
}
