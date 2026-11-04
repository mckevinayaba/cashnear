import { useEffect, useState } from "react";
import { Handshake } from "@/components/cash/Handshake";
import { HoldRing } from "@/components/cash/HoldRing";

/**
 * Example screens for the public site. They are built from the same pieces as
 * the real app (ring, handshake words, type scale) so the page shows the real
 * flow. Every one is labelled as an example, and none uses a real person,
 * shop, code or fee schedule.
 */

export function PhoneFrame({
  children,
  caption,
  daylight = false,
}: {
  children: React.ReactNode;
  caption: string;
  daylight?: boolean;
}) {
  return (
    <figure className="mx-auto w-[248px] shrink-0 snap-center sm:w-[264px]">
      <div
        aria-hidden="true"
        className={`${daylight ? "theme-daylight" : ""} rounded-[2.4rem] border border-border-strong bg-surface p-2 shadow-[var(--shadow-lift)]`}
      >
        <div className="flex min-h-[470px] flex-col justify-between overflow-hidden rounded-[1.9rem] bg-background px-5 pb-5 pt-6 text-foreground">
          {children}
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[12px] leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function ScreenHeader({ right }: { right: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-display text-[17px] tracking-tight">CashNear</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{right}</span>
    </div>
  );
}

function FauxButton({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-full bg-primary py-3 text-center text-[13px] font-medium text-primary-foreground">
      {children}
    </div>
  );
}

export function AskScreen() {
  return (
    <>
      <div>
        <ScreenHeader right="Orlando West" />
        <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Get cash
        </p>
        <p className="mt-1 font-display text-[24px] leading-[1.1]">How much cash do you need?</p>
        <p className="mt-4 font-display text-[54px] leading-none tracking-tight">R200</p>
        <div className="mt-3 flex gap-2 text-[11px]">
          <span className="rounded-full border border-border-strong px-3 py-1.5 text-muted-foreground">
            R100
          </span>
          <span className="rounded-full border border-gold px-3 py-1.5 text-gold">R200</span>
        </div>
        <div className="mt-5 rounded-2xl bg-surface-2/60 p-4 text-[12px] leading-relaxed">
          You pay your provider's fee. CashNear charges <span className="text-gold">R0</span>.
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Your provider sets the final fee.
          </span>
        </div>
      </div>
      <FauxButton>Find cash near me</FauxButton>
    </>
  );
}

export function HeldScreen({ live = false }: { live?: boolean }) {
  const total = 15 * 60;
  const [left, setLeft] = useState(total - 28);

  useEffect(() => {
    if (!live) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setLeft((s) => (s <= 1 ? total - 1 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [live, total]);

  return (
    <>
      <div>
        <ScreenHeader right="Held for you" />
        <div className="mt-5 flex justify-center">
          <HoldRing secondsLeft={left} totalSeconds={total} size={104} label="Example hold" />
        </div>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">
          R200 kept aside at an example shop
        </p>
        <div className="mt-5">
          <Handshake
            words="Amber · River"
            hint="Ask the shop to say these two words before you pay."
          />
        </div>
      </div>
      <div className="flex items-baseline justify-between rounded-2xl bg-surface-2/60 px-4 py-3">
        <span className="text-[11px] text-muted-foreground">Code for the till</span>
        <span className="font-mono text-[20px] tracking-[0.16em]">482951</span>
      </div>
    </>
  );
}

export function ConfirmScreen() {
  return (
    <>
      <div>
        <ScreenHeader right="Almost done" />
        <p className="mt-7 font-display text-[26px] leading-[1.1]">Did you get your R200?</p>
        <div className="mt-5 flex items-baseline justify-between rounded-2xl bg-surface-2/60 px-4 py-3">
          <span className="text-[11px] text-muted-foreground">Reference on the shop's slip</span>
          <span className="font-mono text-[14px]">••••7731</span>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Check it matches your provider's confirmation. Only confirm if you counted your cash.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <FauxButton>Yes, I got my cash</FauxButton>
        <p className="text-center text-[12px] text-muted-foreground">Something went wrong</p>
      </div>
    </>
  );
}

export function ShopAcceptScreen() {
  return (
    <>
      <div>
        <ScreenHeader right="Your shop" />
        <p className="mt-6 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          New request
        </p>
        <p className="mt-1 font-display text-[50px] leading-none tracking-tight">R200</p>
        <p className="mt-2 text-[12px] text-muted-foreground">Ayanda · Under 500 m away</p>
        <div className="mt-5 flex justify-center">
          <HoldRing secondsLeft={61} totalSeconds={90} size={92} label="Example time to accept" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <FauxButton>Accept and keep R200 aside</FauxButton>
        <p className="text-center text-[12px] text-muted-foreground">Decline</p>
      </div>
    </>
  );
}
