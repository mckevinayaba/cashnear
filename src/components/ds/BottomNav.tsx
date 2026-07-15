import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Activity, Wallet, Coins, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
}

const items: NavItem[] = [
  { to: "/", label: "Home", Icon: Home },
  { to: "/activity", label: "Activity", Icon: Activity },
  { to: "/get-cash", label: "Get Cash", Icon: Wallet },
  { to: "/earn", label: "Earn", Icon: Coins },
  { to: "/profile", label: "Profile", Icon: User },
];

/**
 * BottomNav — fixed 5-item navigation.
 * The center "Get Cash" action is visually dominant.
 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-background to-transparent" />
      <div className="mx-auto flex max-w-md items-end justify-between px-5">
        <div className="relative flex w-full items-end justify-between rounded-full border border-border-strong bg-surface-elevated/85 px-3 py-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
          {items.map((item, idx) => {
            const isCenter = idx === 2;
            const isActive =
              item.to === "/"
                ? pathname === "/"
                : pathname.startsWith(item.to);

            if (isCenter) {
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  className="relative -mt-8 flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      "grid h-16 w-16 place-items-center rounded-full bg-gold text-gold-foreground shadow-[var(--shadow-gold)] transition-transform duration-200",
                      "hover:scale-[1.04] active:scale-[0.97]",
                      isActive && "animate-pulse-ring",
                    )}
                  >
                    <item.Icon className="h-6 w-6" strokeWidth={2.25} />
                  </span>
                  <span className="text-[11px] font-medium tracking-tight text-foreground">
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.to}
                to={item.to}
                aria-label={item.label}
                className={cn(
                  "flex min-w-16 flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={isActive ? 2.25 : 1.75}
                />
                <span className="text-[11px] font-medium tracking-tight">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
