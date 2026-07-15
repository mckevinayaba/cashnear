import type { PropsWithChildren, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  header?: ReactNode;
  className?: string;
  /** Hide the bottom nav (e.g. for full-screen flows like onboarding). */
  hideNav?: boolean;
}

/**
 * AppShell — mobile-first layout with fixed bottom nav.
 * Desktop is fully responsive: content stays centered in a phone-width column.
 */
export function AppShell({
  header,
  hideNav,
  className,
  children,
}: PropsWithChildren<AppShellProps>) {
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {header ? (
          <header className="sticky top-0 z-30 bg-background/80 px-5 pb-3 pt-[max(env(safe-area-inset-top),1rem)] backdrop-blur-xl">
            {header}
          </header>
        ) : null}
        <main
          className={cn(
            "flex-1 px-5",
            hideNav ? "pb-8" : "pb-32",
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
    <div className={cn("flex flex-col gap-6 py-4 animate-rise", className)}>
      {children}
    </div>
  );
}
