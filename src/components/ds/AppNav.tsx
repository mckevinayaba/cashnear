import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { initialsOf } from "@/lib/cash";
import { isNavActive, navItemsFor, navModeFor, type NavGlyph, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * The app's main buttons. On a phone they sit along the bottom, where a thumb
 * reaches them; on a computer they move to a side bar. Every button always
 * shows its name, because a picture alone is not enough for everyone.
 *
 * The pictures are drawn here, on one grid with one line weight, so they sit
 * together as a set. No icon library.
 */

function Glyph({ name, active }: { name: NavGlyph; active: boolean }) {
  const props = {
    viewBox: "0 0 24 24",
    className: "h-6 w-6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M4 11.2 12 4.5l8 6.7V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "cash":
      return (
        <svg {...props}>
          <rect x="3" y="6.5" width="18" height="11" rx="2.5" />
          <circle cx="12" cy="12" r="2.4" />
          <path d="M6.6 12h.01M17.4 12h.01" />
        </svg>
      );
    case "activity":
      return (
        <svg {...props}>
          <path d="M5 7.5h14M5 12h14M5 16.5h8.5" />
        </svg>
      );
    case "account":
      return (
        <svg {...props}>
          <circle cx="12" cy="8.4" r="3.6" />
          <path d="M4.8 20c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6" />
        </svg>
      );
    case "desk":
      return (
        <svg {...props}>
          <path d="M4.5 9.5 6 4.5h12l1.5 5" />
          <path d="M4.5 9.5c0 1.4 1.1 2.4 2.5 2.4s2.5-1 2.5-2.4c0 1.4 1.1 2.4 2.5 2.4s2.5-1 2.5-2.4c0 1.4 1.1 2.4 2.5 2.4s2.5-1 2.5-2.4" />
          <path d="M6 12.5V20h12v-7.5" />
          <path d="M10 20v-4.5h4V20" />
        </svg>
      );
  }
}

/** Phone: along the bottom, four equal buttons, the main one picked out in gold. */
export function BottomNav({ items, pathname }: { items: readonly NavItem[]; pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur-xl lg:hidden"
    >
      <ul
        className="mx-auto grid max-w-[560px]"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isNavActive(pathname, item.to);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[64px] flex-col items-center justify-center gap-1 text-[12px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground active:text-foreground",
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-[3px] w-9 rounded-full bg-gold"
                  />
                ) : null}
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-full",
                    item.primary && "bg-gold text-gold-foreground",
                  )}
                >
                  <Glyph name={item.glyph} active={active} />
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Computer: a side bar with the same buttons and who is signed in. */
export function SideNav({
  items,
  pathname,
  who,
  email,
}: {
  items: readonly NavItem[];
  pathname: string;
  who: string;
  email: string;
}) {
  const primary = items.find((i) => i.primary);
  const rest = items.filter((i) => !i.primary);
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-border bg-background px-4 py-6 lg:flex">
      <Link to="/" className="px-3 font-display text-[24px] tracking-[-0.02em] text-foreground">
        CashNear
      </Link>
      <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1">
        {primary ? (
          <Link
            to={primary.to}
            aria-current={isNavActive(pathname, primary.to) ? "page" : undefined}
            className="mb-3 flex h-12 items-center justify-center gap-2 rounded-full bg-gold px-5 text-[15px] font-medium text-gold-foreground transition-colors hover:bg-gold/90"
          >
            <Glyph name={primary.glyph} active={isNavActive(pathname, primary.to)} />
            {primary.label}
          </Link>
        ) : null}
        {rest.map((item) => {
          const active = isNavActive(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                active
                  ? "bg-surface-2 text-foreground"
                  : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
              )}
            >
              <Glyph name={item.glyph} active={active} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3 border-t border-border px-3 pt-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-medium text-foreground">
          {initialsOf(who || email)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] text-foreground">{who || "Your account"}</p>
          {email ? <p className="truncate text-[12px] text-muted-foreground">{email}</p> : null}
        </div>
      </div>
    </aside>
  );
}

/** Chooses the right buttons for who is signed in and where they are. */
export function AppNav() {
  const auth = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = navItemsFor(navModeFor({ pathname, isOperator: auth.isOperator }));
  const meta = auth.user?.user_metadata as { full_name?: string | null } | undefined;
  return (
    <>
      <SideNav
        items={items}
        pathname={pathname}
        who={meta?.full_name?.trim() ?? ""}
        email={auth.user?.email ?? ""}
      />
      <BottomNav items={items} pathname={pathname} />
    </>
  );
}
