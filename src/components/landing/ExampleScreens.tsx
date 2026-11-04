import { useEffect, useState } from "react";
import { Handshake } from "@/components/cash/Handshake";
import { HoldRing } from "@/components/cash/HoldRing";

/**
 * Screens for the public site. They are built from the same pieces as the real
 * app (ring, two words, type scale) so the page shows how it really looks.
 * They contain no real or made-up person, shop, code or phone number: the
 * private parts are blanked out, and each screen says it is not real.
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
        <ScreenHeader right="Get cash" />
        <p className="mt-6 font-display text-[24px] leading-[1.1]">How much cash do you need?</p>
        <p className="mt-4 font-display text-[54px] leading-none tracking-tight">R200</p>
        <div className="mt-3 flex gap-2 text-[11px]">
          <span className="rounded-full border border-border-strong px-3 py-1.5 text-muted-foreground">
            R100
          </span>
          <span className="rounded-full border border-gold px-3 py-1.5 text-gold">R200</span>
        </div>
        <div className="mt-5 rounded-2xl bg-surface-2/60 p-4 text-[12px] leading-relaxed">
          Your bank or wallet charges its own fee. CashNear charges{" "}
          <span className="text-gold">R0</span>.
          <span className="mt-1 block text-[11px] text-muted-foreground">
            You see the fee before you ask.
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
        <ScreenHeader right="Kept for you" />
        <div className="mt-5 flex justify-center">
          <HoldRing secondsLeft={left} totalSeconds={total} size={104} label="Time left" />
        </div>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">
          Your cash is kept for you at the shop
        </p>
        <div className="mt-5">
          <Handshake
            words="word · word"
            hint="Ask the shop to say these two words. If they are the same, it is safe to pay."
          />
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-surface-2/60 px-4 py-3">
        <span className="text-[11px] leading-snug text-muted-foreground">
          Your code. Show it to the shop.
        </span>
        <span className="font-mono text-[18px] tracking-[0.18em]">••••••</span>
      </div>
    </>
  );
}

export function ConfirmScreen() {
  return (
    <>
      <div>
        <ScreenHeader right="Almost done" />
        <p className="mt-7 font-display text-[26px] leading-[1.1]">Did you get your cash?</p>
        <div className="mt-5 flex items-baseline justify-between gap-3 rounded-2xl bg-surface-2/60 px-4 py-3">
          <span className="text-[11px] leading-snug text-muted-foreground">
            Number on the shop's slip
          </span>
          <span className="font-mono text-[14px]">••••••••</span>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          Check that this number is also on your own payment message. Only press yes if you counted
          your cash.
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
          Someone needs cash
        </p>
        <p className="mt-1 font-display text-[50px] leading-none tracking-tight">R200</p>
        <p className="mt-2 text-[12px] text-muted-foreground">A customer · Under 500 m away</p>
        <div className="mt-5 flex justify-center">
          <HoldRing secondsLeft={61} totalSeconds={90} size={92} label="Time to answer" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <FauxButton>Yes, I will keep R200 for them</FauxButton>
        <p className="text-center text-[12px] text-muted-foreground">No</p>
      </div>
    </>
  );
}
