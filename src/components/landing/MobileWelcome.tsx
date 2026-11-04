import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AskScreen, ConfirmScreen, HeldScreen } from "@/components/landing/ExampleScreens";
import { cn } from "@/lib/utils";

/**
 * The first screen on a phone. It is an app's welcome, not a web page: it fills
 * the screen, shows the product, and puts the two things a person can do right
 * under their thumb. Swipe sideways for three short ideas. The rest of the site
 * waits below for anyone who wants to read more.
 *
 * The screens here are the real ones, drawn with blanked-out details, and the
 * line under them says so.
 */

const SLIDES = [
  {
    title: "Cash from the shop on your corner.",
    body: "Say how much you need. A shop near you keeps it aside for you.",
    screen: <AskScreen />,
  },
  {
    title: "See the fee before you go.",
    body: "You pay the shop on their payment machine. CashNear never keeps your money.",
    screen: <HeldScreen live />,
  },
  {
    title: "Safe for you and for the shop.",
    body: "We check every shop. You count your cash, then tell us you got it.",
    screen: <ConfirmScreen />,
  },
] as const;

function Phone({ children }: { children: React.ReactNode }) {
  // Only the top of the phone shows, fading out behind the buttons.
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto h-[clamp(150px,29dvh,300px)] w-[236px] overflow-hidden"
    >
      {/* The app opens in daylight, so the preview does too. It also stands out from the dark page. */}
      <div className="theme-daylight rounded-[2.2rem] border border-border-strong bg-surface p-2 shadow-[var(--shadow-lift)]">
        <div className="flex min-h-[470px] flex-col justify-between overflow-hidden rounded-[1.8rem] bg-background px-5 pb-5 pt-6 text-foreground">
          {children}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

export function MobileWelcome({ signedIn }: { signedIn: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section
      aria-label="Welcome to CashNear"
      className="flex min-h-dvh flex-col bg-background px-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-[max(env(safe-area-inset-top),1.25rem)] lg:hidden"
    >
      <header className="flex items-center justify-between">
        <span className="font-display text-[24px] tracking-[-0.02em] text-foreground">
          Cash<span className="text-gold">·</span>Near
        </span>
        {signedIn ? null : (
          <Link
            to="/auth"
            className="inline-flex min-h-11 items-center px-2 text-[15px] font-medium text-foreground"
          >
            Sign in
          </Link>
        )}
      </header>

      <div className="mt-4 flex flex-1 flex-col">
        <div
          ref={track}
          role="group"
          aria-roledescription="carousel"
          aria-label="How CashNear works"
          className="-mx-6 flex flex-1 snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {SLIDES.map((s, i) => (
            <div
              key={s.title}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}`}
              className="flex w-full shrink-0 snap-center flex-col px-6"
            >
              <h1 className="mt-4 font-display text-[40px] leading-[1.02] tracking-tight text-foreground">
                {s.title}
              </h1>
              <p className="mt-3 max-w-[34ch] text-[16px] leading-relaxed text-muted-foreground">
                {s.body}
              </p>
              <div className="mt-auto pt-5">
                <Phone>{s.screen}</Phone>
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-1 flex items-center justify-center gap-2"
          role="tablist"
          aria-label="Slides"
        >
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={index === i}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => go(i)}
              className="grid h-6 place-items-center px-1"
            >
              <span
                className={cn(
                  "h-1 rounded-full transition-all",
                  index === i ? "w-7 bg-gold" : "w-3 bg-border-strong",
                )}
              />
            </button>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Example screens. The numbers on them are not real.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {signedIn ? (
          <Link
            to="/home"
            className="inline-flex h-14 items-center justify-center rounded-full bg-primary text-[16px] font-medium text-primary-foreground"
          >
            Open the app
          </Link>
        ) : (
          <>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-14 items-center justify-center rounded-full bg-primary text-[16px] font-medium text-primary-foreground transition-transform active:scale-[0.985]"
            >
              Join free
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup", as: "shop" }}
              className="inline-flex h-14 items-center justify-center rounded-full border border-border-strong text-[16px] font-medium text-foreground transition-transform active:scale-[0.985]"
            >
              I own a shop
            </Link>
          </>
        )}
        <a
          href="#how"
          className="site-extra-link py-1 text-center text-[13px] text-muted-foreground"
        >
          How it works, and your questions answered
        </a>
      </div>
    </section>
  );
}
