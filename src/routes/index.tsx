import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AskScreen,
  ConfirmScreen,
  HeldScreen,
  PhoneFrame,
  ShopAcceptScreen,
} from "@/components/landing/ExampleScreens";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CashNear — Get cash from a shop near you." },
      {
        name: "description",
        content:
          "Tell us how much cash you need. A shop near you says yes and keeps your cash for you. You see the fee before you go. Join free for early access.",
      },
      { property: "og:title", content: "CashNear — Get cash from a shop near you." },
      {
        property: "og:description",
        content:
          "Get cash from a shop near you. You see the fee before you go. Join free for early access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicHome,
});

function PublicHome() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    async function syncAuthState() {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSignedIn(!!data.session);

        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
          if (mounted) setSignedIn(!!session);
        });
        unsubscribe = () => sub.subscription.unsubscribe();
      } catch (error) {
        console.warn("[CashNear] Auth status unavailable on the public website.", error);
        if (mounted) setSignedIn(false);
      }
    }

    void syncAuthState();

    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.auth.signOut();
    } catch (error) {
      console.warn("[CashNear] Sign out unavailable on the public website.", error);
    } finally {
      setSignedIn(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader signedIn={signedIn} onSignOut={signOut} />

      <main>
        <Hero signedIn={signedIn} />
        <PhotoBand />
        <Flow />
        <Trust />
        <ForShops />
        <Status signedIn={signedIn} />
        <Faq />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ---------------- Layout primitives ---------------- */

function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-6 lg:px-10 ${className}`}>{children}</div>;
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground md:text-5xl">
      {children}
    </h2>
  );
}

type Join = "customer" | "shop";

function joinSearch(join: Join) {
  return join === "shop"
    ? ({ mode: "signup", as: "shop" } as const)
    : ({ mode: "signup" } as const);
}

function PrimaryBtn({
  children,
  to,
  join,
  onClick,
  size = "md",
}: {
  children: React.ReactNode;
  to?: string;
  join?: Join;
  onClick?: () => void;
  size?: "md" | "lg";
}) {
  const cls = `inline-flex items-center justify-center rounded-full bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary/90 ${
    size === "lg" ? "h-12 text-[15px]" : "h-11 text-[14px]"
  }`;
  if (join)
    return (
      <Link to="/auth" search={joinSearch(join)} className={cls}>
        {children}
      </Link>
    );
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  return (
    <button className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

function SecondaryBtn({
  children,
  to,
  join,
  href,
  size = "md",
}: {
  children: React.ReactNode;
  to?: string;
  join?: Join;
  href?: string;
  size?: "md" | "lg";
}) {
  const cls = `inline-flex items-center justify-center rounded-full border border-border-strong bg-transparent px-6 font-medium text-foreground transition-colors hover:bg-surface ${
    size === "lg" ? "h-12 text-[15px]" : "h-11 text-[14px]"
  }`;
  if (join)
    return (
      <Link to="/auth" search={joinSearch(join)} className={cls}>
        {children}
      </Link>
    );
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  return (
    <a href={href} className={cls}>
      {children}
    </a>
  );
}

/* ---------------- Header ---------------- */

function Wordmark() {
  return (
    <Link to="/" className="font-display text-[20px] tracking-[-0.02em] text-foreground">
      Cash<span className="text-gold">·</span>Near
    </Link>
  );
}

function SiteHeader({ signedIn, onSignOut }: { signedIn: boolean; onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between">
        <Wordmark />
        <nav className="hidden items-center gap-8 text-[13px] text-muted-foreground md:flex">
          <a href="#how" className="hover:text-foreground">
            How it works
          </a>
          <a href="#safety" className="hover:text-foreground">
            Why you can trust it
          </a>
          <a href="#operators" className="hover:text-foreground">
            For shops
          </a>
          <a href="#join" className="hover:text-foreground">
            Early access
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <Link
                to="/home"
                className="hidden md:inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to my account
              </Link>
              <button
                onClick={onSignOut}
                className="h-10 rounded-full border border-border-strong px-5 text-[13px] text-foreground hover:bg-surface"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className="hidden md:inline-flex h-10 items-center px-3 text-[13px] text-muted-foreground hover:text-foreground"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={joinSearch("customer")}
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                Join free
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}

/* ---------------- Hero ---------------- */

import counterPhoto from "@/assets/spaza-counter-cash.jpg";
import shopfrontPhoto from "@/assets/spaza-shopfront.jpg";
import cityPhoto from "@/assets/hillbrow-corner-store.jpg";
import ownerPhoto from "@/assets/shop-owner.jpg";

function PhotoBand() {
  return (
    <section className="border-b border-border">
      <div className="relative">
        <img src={cityPhoto} alt="A busy inner-city corner shop in Hillbrow, Johannesburg" width={1600} height={912} loading="lazy" className="h-[340px] w-full object-cover md:h-[520px]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/60 to-transparent">
          <Container className="pb-8 pt-24">
            <p className="font-display text-[34px] leading-tight text-foreground md:text-[48px]">The shop on your corner. In the township or the city.</p>
            <p className="mt-2 max-w-[48ch] text-[16px] text-foreground/80">You already know it. Now it can give you cash too. In the app you see a photo of the shop and a landmark, like "next to the taxi rank".</p>
          </Container>
        </div>
      </div>
    </section>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-b border-border">
      <Container className="grid items-center gap-14 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div className="animate-rise">
          <p className="text-[14px] text-gold">Early access. Join free.</p>
          <h1 className="mt-5 font-display text-[54px] leading-[0.98] tracking-tight text-foreground md:text-[78px]">
            Get cash from a shop near you.
          </h1>
          <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-muted-foreground">
            Tell us how much you need. A shop near you says yes and keeps your cash for you. You see
            the fee before you go.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <PrimaryBtn to="/home" size="lg">
                Go to my account
              </PrimaryBtn>
            ) : (
              <>
                <PrimaryBtn join="customer" size="lg">
                  Join free
                </PrimaryBtn>
                <SecondaryBtn join="shop" size="lg">
                  Register my shop
                </SecondaryBtn>
              </>
            )}
          </div>
          <p className="mt-6 max-w-[48ch] text-[14px] leading-relaxed text-muted-foreground">
            CashNear never keeps your money. You pay the shop on their payment machine.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[460px]">
          <img src={counterPhoto} alt="A shopkeeper hands cash through the counter to a smiling customer" width={1280} height={1600} className="aspect-[4/5] w-full rounded-[28px] object-cover shadow-2xl" />
          <div className="absolute -bottom-6 -left-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-xl md:-left-10">
            <p className="text-[13px] text-muted-foreground">Your cash is ready</p>
            <p className="font-display text-[30px] leading-none text-foreground">R200</p>
            <p className="mt-1 text-[13px] text-gold">Kept for you for 15 min</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------------- The flow ---------------- */

function Flow() {
  const steps = [
    {
      label: "First",
      title: "You ask",
      body: "Say how much cash you need. You see the fee before anything happens.",
      screen: <AskScreen />,
      caption: "How it looks when you ask",
    },
    {
      label: "Then",
      title: "The shop says yes",
      body: "A shop we have checked has 90 seconds to say yes. If it says no, nothing happens and you pay nothing.",
      screen: <ShopAcceptScreen />,
      caption: "How it looks to the shop",
      daylight: true,
    },
    {
      label: "Then",
      title: "You walk over",
      body: "The shop keeps your cash for you for 15 minutes. Show your code at the shop and say the two words.",
      screen: <HeldScreen />,
      caption: "How it looks while your cash is kept",
    },
    {
      label: "Last",
      title: "You count your cash",
      body: "The shop types the number from its payment slip. You say you got your cash.",
      screen: <ConfirmScreen />,
      caption: "How it looks at the end",
    },
  ];
  return (
    <section id="how" className="scroll-mt-16 border-b border-border">
      <Container className="py-16 lg:py-24">
        <SectionEyebrow>How it works</SectionEyebrow>
        <SectionTitle>Four easy steps.</SectionTitle>
      </Container>
      <div className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 lg:justify-center lg:gap-8 lg:px-10">
        {steps.map((s) => (
          <div key={s.title} className="flex w-[264px] shrink-0 snap-center flex-col lg:w-[270px]">
            <p className="text-[13px] text-gold">{s.label}</p>
            <h3 className="mt-1 font-display text-[28px] leading-none text-foreground">
              {s.title}
            </h3>
            <p className="mb-6 mt-3 min-h-[96px] text-[15px] leading-relaxed text-muted-foreground">
              {s.body}
            </p>
            <PhoneFrame caption={s.caption} daylight={s.daylight}>
              {s.screen}
            </PhoneFrame>
          </div>
        ))}
      </div>
      <Container className="pb-16 pt-8 lg:pb-24">
        <p className="text-[14px] text-muted-foreground">
          These screens show how the app looks. The names and numbers on them are not real.
        </p>
      </Container>
    </section>
  );
}

/* ---------------- Trust ---------------- */

function Trust() {
  const items: [string, string][] = [
    [
      "We check every shop first.",
      "A real person checks the shop and its papers before it can help anyone.",
    ],
    [
      "Two words keep you safe.",
      "You and the shop see the same two words. Say them out loud. If they are the same, you are with the right person.",
    ],
    [
      "Your cash is kept for you.",
      "The shop keeps your cash for 15 minutes. You will not walk over and find no cash.",
    ],
    [
      "You pay the shop, not us.",
      "CashNear never keeps your money. You pay the shop on their payment machine.",
    ],
    [
      "You both say it is done.",
      "The shop types the number from the slip. You say you got your cash. If something is wrong, tell us and a real person will look into it.",
    ],
    [
      "The shop does not know where you are.",
      "The shop only sees your first name and about how far away you are.",
    ],
  ];
  return (
    <section id="safety" className="scroll-mt-16 border-b border-border">
      <Container className="grid gap-12 py-16 lg:grid-cols-[1fr_1.4fr] lg:py-24">
        <div>
          <SectionEyebrow>Why you can trust it</SectionEyebrow>
          <SectionTitle>Safe for you. Safe for the shop.</SectionTitle>
        </div>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {items.map(([title, body]) => (
            <div key={title} className="py-6">
              <h3 className="font-display text-[24px] leading-tight text-foreground">{title}</h3>
              <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------- For shops ---------------- */

function ForShops() {
  const items = [
    "You choose when you take requests, and how much cash you can give out.",
    "You see how much cash they want before you say yes.",
    "Customers never see how much cash you have. They only see if you can help.",
    "The screen is bright and easy to read in daylight.",
    "It is free to join. CashNear charges shops nothing for now.",
  ];
  return (
    <section id="operators" className="scroll-mt-16 border-b border-border">
      <Container className="grid items-center gap-14 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <SectionEyebrow>For shops</SectionEyebrow>
          <SectionTitle>
            Do you have a shop? Be one of the first to help people near you get cash.
          </SectionTitle>
          <div className="mt-8 flex flex-col divide-y divide-border border-y border-border">
            {items.map((it) => (
              <p key={it} className="py-4 text-[16px] leading-relaxed text-foreground">
                {it}
              </p>
            ))}
          </div>
          <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            Register now. We check your papers and your payment machine, and a real person visits
            your shop before you start. Customers pay you on your own payment machine.
          </p>
          <div className="mt-8">
            <PrimaryBtn join="shop" size="lg">
              Register my shop
            </PrimaryBtn>
          </div>
        </div>
        <img src={ownerPhoto} alt="A shop owner holding his phone and payment machine behind the counter" width={1280} height={1600} loading="lazy" className="mx-auto aspect-[4/5] w-full max-w-[460px] rounded-[28px] object-cover shadow-2xl" />
      </Container>
    </section>
  );
}

/* ---------------- Join ---------------- */

function Status({ signedIn }: { signedIn: boolean }) {
  return (
    <section id="join" className="scroll-mt-16 border-b border-border">
      <Container className="py-16 lg:py-24">
        <SectionEyebrow>Early access</SectionEyebrow>
        <SectionTitle>Be one of the first.</SectionTitle>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-muted-foreground">
          CashNear is growing shop by shop. A real person checks every shop before it can help
          anyone, so it is safe for you. Join free now, and you will be first in line as soon as a
          shop near you is ready.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {signedIn ? (
            <PrimaryBtn to="/home" size="lg">
              Go to my account
            </PrimaryBtn>
          ) : (
            <>
              <PrimaryBtn join="customer" size="lg">
                Join free
              </PrimaryBtn>
              <SecondaryBtn join="shop" size="lg">
                Register my shop
              </SecondaryBtn>
            </>
          )}
        </div>
      </Container>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

function Faq() {
  const faqs: [string, string][] = [
    [
      "When can I get cash?",
      "We are adding shops one at a time, and a real person checks each one first. Join free now and we will tell you as soon as a shop near you is ready.",
    ],
    [
      "Is it free to join?",
      "Yes. Joining is free. CashNear charges you nothing, and charges shops nothing for now.",
    ],
    [
      "How much does it cost?",
      "CashNear charges you nothing. Your bank or wallet charges its own fee. You see the fee before you ask.",
    ],
    [
      "Do I need to show my ID?",
      "CashNear does not ask you for an ID to ask for cash. At the start you can ask for a small amount. You can ask for more after you collect cash with no problems.",
    ],
    [
      "Does CashNear keep my money?",
      "No. You pay the shop on their payment machine. CashNear only helps you find the shop.",
    ],
    [
      "What if the shop does not have my cash?",
      "The shop says yes before you walk. If it does not say yes, nothing happens and you can pick another shop. If something goes wrong at the shop, tell us in the app. A real person will look into it.",
    ],
    [
      "Can any shop join?",
      "No. We check each shop and its papers first. We can stop a shop from taking requests if someone reports a problem.",
    ],
  ];
  return (
    <section id="faq" className="scroll-mt-16 border-b border-border">
      <Container className="py-16 lg:py-24">
        <SectionEyebrow>Questions</SectionEyebrow>
        <SectionTitle>Questions people ask.</SectionTitle>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {faqs.map(([q, a]) => (
            <details key={q} className="group py-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] text-foreground [&::-webkit-details-marker]:hidden">
                {q}
                <span className="shrink-0 text-[13px] text-muted-foreground">
                  <span className="group-open:hidden">Read</span>
                  <span className="hidden group-open:inline">Close</span>
                </span>
              </summary>
              <p className="mt-4 max-w-[70ch] text-[15px] leading-relaxed text-muted-foreground">
                {a}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------- Footer ---------------- */

function SiteFooter() {
  return (
    <footer className="bg-background">
      <Container className="grid gap-10 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <Wordmark />
          <p className="mt-4 max-w-[40ch] text-[13px] leading-relaxed text-muted-foreground">
            Get cash from a shop near you. Early access.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            ["Join free", "/auth", "customer"],
            ["Register my shop", "/auth", "shop"],
            ["Sign in", "/auth"],
            ["Why you can trust it", "#safety"],
            ["FAQ", "#faq"],
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            ["Terms", "/legal/terms"],
            ["Privacy", "/legal/privacy"],
            ["Support", "mailto:support@cashnear.co"],
          ]}
        />
      </Container>
      <div className="border-t border-border">
        <Container className="flex flex-col items-start justify-between gap-2 py-6 text-[12px] text-muted-foreground md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} CashNear. All rights reserved.</span>
          <span>CashNear · South Africa</span>
        </Container>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string, Join?][] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{title}</div>
      <ul className="mt-4 flex flex-col gap-3 text-[13px]">
        {links.map(([label, href, join]) =>
          join ? (
            <li key={label}>
              <Link
                to="/auth"
                search={joinSearch(join)}
                className="text-foreground hover:text-gold"
              >
                {label}
              </Link>
            </li>
          ) : href.startsWith("/") ? (
            <li key={label}>
              <Link to={href} className="text-foreground hover:text-gold">
                {label}
              </Link>
            </li>
          ) : (
            <li key={label}>
              <a href={href} className="text-foreground hover:text-gold">
                {label}
              </a>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
