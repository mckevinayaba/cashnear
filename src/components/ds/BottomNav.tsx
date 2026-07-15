import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { SVGProps } from "react";

/**
 * BottomNav — quiet floating bar. Five equal items, active dot indicator.
 * No dominant floating circles. The primary CTA lives inside the Home screen.
 */

type IconProps = SVGProps<SVGSVGElement>;

const stroke: IconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

// Bespoke CashNear icon set — thin, rounded, geometric.
const HomeIcon = (p: IconProps) => (
  <svg {...stroke} {...p}>
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" />
  </svg>
);
const PulseIcon = (p: IconProps) => (
  <svg {...stroke} {...p}>
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);
const CashIcon = (p: IconProps) => (
  <svg {...stroke} {...p}>
    <rect x="3" y="7" width="18" height="12" rx="3" />
    <circle cx="12" cy="13" r="2.5" />
    <path d="M7 3.5h10" />
  </svg>
);
const SparkIcon = (p: IconProps) => (
  <svg {...stroke} {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </svg>
);
const PersonIcon = (p: IconProps) => (
  <svg {...stroke} {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
  </svg>
);

const items = [
  { to: "/", label: "Home", Icon: HomeIcon },
  { to: "/activity", label: "Activity", Icon: PulseIcon },
  { to: "/get-cash", label: "Cash", Icon: CashIcon },
  { to: "/earn", label: "Earn", Icon: SparkIcon },
  { to: "/profile", label: "Profile", Icon: PersonIcon },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-10 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="mx-auto flex w-full max-w-[440px] justify-center px-6 lg:max-w-[520px]">
        <div className="flex w-full items-center justify-between rounded-full border border-border-strong bg-surface/80 px-2 py-2 backdrop-blur-xl">
          {items.map((item) => {
            const isActive =
              item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-label={item.label}
                className={cn(
                  "relative flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
                )}
              >
                <item.Icon />
                <span
                  className={cn(
                    "h-1 w-1 rounded-full transition-colors",
                    isActive ? "bg-gold" : "bg-transparent",
                  )}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
