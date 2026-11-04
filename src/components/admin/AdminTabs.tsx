import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * The team's way around: one strip of tabs along the top of every admin
 * screen. It scrolls sideways on a phone.
 */
const TABS = [
  { to: "/admin", label: "Overview", exact: true },
  { to: "/admin/business", label: "Business" },
  { to: "/admin/transactions", label: "Transactions" },
  { to: "/admin/operators", label: "Shops" },
  { to: "/admin/customers", label: "Customers" },
  { to: "/admin/cash", label: "Cash controls" },
  { to: "/admin/audit", label: "Audit" },
] as const;

export function AdminTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Admin"
      className="-mx-6 overflow-x-auto border-b border-border px-6 lg:mx-0 lg:px-0"
    >
      <ul className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const active =
            "exact" in tab && tab.exact
              ? pathname === tab.to
              : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
          return (
            <li key={tab.to}>
              <Link
                to={tab.to}
                activeOptions={{ exact: "exact" in tab && tab.exact === true }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-12 items-center border-b-2 px-4 text-[14px] font-medium transition-colors",
                  active
                    ? "border-gold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
