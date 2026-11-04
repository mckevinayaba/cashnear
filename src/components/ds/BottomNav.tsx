import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

function HomeIcon() {
  return (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></svg>);
}
function UserIcon() {
  return (<svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>);
}
function CashIcon() {
  return (<svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /></svg>);
}

/** Mobile-first bottom dock with a dominant "Get cash" centre action. */
export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const item = (to: "/customer" | "/account", label: string, icon: React.ReactNode) => {
    const active = path.startsWith(to);
    return (
      <Link to={to} className={cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[12px] font-medium", active ? "text-foreground" : "text-muted-foreground")}>
        {icon}
        <span>{label}</span>
      </Link>
    );
  };
  const cashActive = path.startsWith("/cash");
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[440px] items-end px-6 pt-2 lg:max-w-[520px]">
        {item("/customer", "Home", <HomeIcon />)}
        <Link to="/cash" className="-mt-7 flex flex-1 flex-col items-center gap-1 text-[12px] font-semibold text-foreground">
          <span className={cn("grid h-16 w-16 place-items-center rounded-full bg-gold text-primary shadow-lg ring-4 ring-background transition-transform active:scale-95", cashActive && "scale-105")}>
            <CashIcon />
          </span>
          <span>Get cash</span>
        </Link>
        {item("/account", "Account", <UserIcon />)}
      </div>
    </nav>
  );
}
