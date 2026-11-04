import type { PropsWithChildren, ReactNode } from "react";
import { useApplyTheme } from "@/hooks/use-shop-theme";
import { cn } from "@/lib/utils";
import { AppNav } from "./AppNav";

interface AppShellProps {
  header?: ReactNode;
  className?: string;
  /** Leave out the app's main buttons. For sign-in, forms and public pages. */
  hideNav?: boolean;
  /** How wide the page may grow on a computer. Phones always use the full width. */
  size?: "narrow" | "medium" | "wide";
  /** Wide desktop layout for the admin screens. */
  desktopWide?: boolean;
}

const SIZE_CLASS = {
  narrow: "lg:max-w-[600px]",
  medium: "lg:max-w-[760px]",
  wide: "lg:max-w-[1000px]",
} as const;

/** Puts the app's look (daylight or night) on the page. Rendered once, with the buttons. */
function ThemeApplier() {
  useApplyTheme();
  return null;
}

/**
 * AppShell: on a phone, one column with the app's buttons along the bottom. On a
 * computer, the same buttons move to a side bar and the page gets room to
 * breathe. Screens that are not part of the app (sign in, forms, public
 * pages) pass `hideNav` and keep the plain centred column.
 */
export function AppShell({
  header,
  hideNav,
  className,
  size = "narrow",
  desktopWide,
  children,
}: PropsWithChildren<AppShellProps>) {
  const withNav = !hideNav;
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      {withNav ? <ThemeApplier /> : null}
      <div className={cn(withNav && "lg:pl-[248px]")}>
        <div
          className={cn(
            "mx-auto flex min-h-dvh w-full flex-col",
            desktopWide
              ? "max-w-6xl"
              : withNav
                ? cn("max-w-[560px]", SIZE_CLASS[size])
                : "max-w-[440px] lg:max-w-[520px]",
          )}
        >
          {header ? (
            <header className="sticky top-0 z-30 bg-background/70 px-6 pb-3 pt-[max(env(safe-area-inset-top),1.25rem)] backdrop-blur-xl">
              {header}
            </header>
          ) : null}
          <main
            className={cn("flex-1 px-6", withNav ? "pb-28 lg:px-10 lg:pb-12" : "pb-10", className)}
          >
            {children}
          </main>
        </div>
      </div>
      {withNav ? <AppNav /> : null}
    </div>
  );
}

export function Screen({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("flex flex-col gap-10 py-6 animate-rise", className)}>{children}</div>;
}

export function Section({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <section className={cn("flex flex-col gap-4", className)}>{children}</section>;
}
