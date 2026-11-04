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
      { title: "CashNear — Cash, kept aside for you." },
      {
        name: "description",
        content:
          "See which checked shops nearby can serve you, know the fee before you walk, and have the shop keep your cash aside. Starting in Orlando West, Soweto. Not open yet.",
      },
      { property: "og:title", content: "CashNear — Cash, kept aside for you." },
      {
        property: "og:description",
        content: "Checked shops nearby, the fee up front, your cash kept aside. Not open yet.",
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

function PrimaryBtn({
  children,
  to,
  onClick,
  size = "md",
}: {
  children: React.ReactNode;
  to?: string;
  onClick?: () => void;
  size?: "md" | "lg";
}) {
  const cls = `inline-flex items-center justify-center rounded-full bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary/90 ${
    size === "lg" ? "h-12 text-[15px]" : "h-11 text-[14px]"
  }`;
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
  href,
  size = "md",
}: {
  children: React.ReactNode;
  to?: string;
  href?: string;
  size?: "md" | "lg";
}) {
  const cls = `inline-flex items-center justify-center rounded-full border border-border-strong bg-transparent px-6 font-medium text-foreground transition-colors hover:bg-surface ${
    size === "lg" ? "h-12 text-[15px]" : "h-11 text-[14px]"
  }`;
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
            Why it is safe
          </a>
          <a href="#operators" className="hover:text-foreground">
            For shops
          </a>
          <a href="#status" className="hover:text-foreground">
            Where we are
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
                className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </Container>
    </header>
  );
}

/* ---------------- Hero ---------------- */

function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-b border-border">
      <Container className="grid items-center gap-14 py-16 lg:grid-cols-[1.1fr_1fr] lg:py-24">
        <div className="animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3.5 py-1.5 text-[12px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Starting in Orlando West, Soweto · Not open yet
          </span>
          <h1 className="mt-7 font-display text-[54px] leading-[0.98] tracking-tight text-foreground md:text-[78px]">
            Cash, kept aside for you.
          </h1>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-muted-foreground">
            See which checked shops nearby can serve you. Know the fee before you walk. The shop
            keeps your cash aside until you arrive.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <PrimaryBtn to="/home" size="lg">
                Go to my account
              </PrimaryBtn>
            ) : (
              <>
                <PrimaryBtn to="/auth" size="lg">
                  Tell me when it opens
                </PrimaryBtn>
                <SecondaryBtn to="/auth" size="lg">
                  I own a shop
                </SecondaryBtn>
              </>
            )}
          </div>
          <p className="mt-6 max-w-[52ch] text-[13px] leading-relaxed text-muted-foreground">
            CashNear never holds your money. You pay the shop on its own payment device.
          </p>
        </div>

        <PhoneFrame caption="An example screen. Not a real request, shop or code.">
          <HeldScreen live />
        </PhoneFrame>
      </Container>
    </section>
  );
}

/* ---------------- The flow ---------------- */

function Flow() {
  const steps = [
    {
      n: "01",
      title: "Ask",
      body: "Say how much you need. You see your provider's fee before anything happens.",
      screen: <AskScreen />,
      caption: "Example: asking for R200",
    },
    {
      n: "02",
      title: "The shop confirms",
      body: "A checked shop has 90 seconds to say yes. If it doesn't, nothing happens and nothing is charged.",
      screen: <ShopAcceptScreen />,
      caption: "Example: what the shop sees",
      daylight: true,
    },
    {
      n: "03",
      title: "Walk over",
      body: "The shop keeps your cash aside for 15 minutes. Say the two words and show your code at the till.",
      screen: <HeldScreen />,
      caption: "Example: your cash is held",
    },
    {
      n: "04",
      title: "Count it, confirm it",
      body: "The shop enters the reference from its payment slip. You confirm you got your cash.",
      screen: <ConfirmScreen />,
      caption: "Example: both sides confirm",
    },
  ];
  return (
    <section id="how" className="scroll-mt-16 border-b border-border">
      <Container className="py-16 lg:py-24">
        <SectionEyebrow>How it works</SectionEyebrow>
        <SectionTitle>Four steps. No wasted trip.</SectionTitle>
      </Container>
      <div className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-4 lg:justify-center lg:gap-8 lg:px-10">
        {steps.map((s) => (
          <div key={s.n} className="flex w-[264px] shrink-0 snap-center flex-col lg:w-[270px]">
            <div className="mb-5 flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-gold">{s.n}</span>
              <h3 className="font-display text-[26px] leading-none text-foreground">{s.title}</h3>
            </div>
            <p className="mb-6 min-h-[84px] text-[14px] leading-relaxed text-muted-foreground">
              {s.body}
            </p>
            <PhoneFrame caption={s.caption} daylight={s.daylight}>
              {s.screen}
            </PhoneFrame>
          </div>
        ))}
      </div>
      <Container className="pb-16 pt-8 lg:pb-24">
        <p className="text-[13px] text-muted-foreground">
          These are example screens built from the real app. They use made-up people and numbers.
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
      "A person reviews the business, its documents and its card machine before it can help anyone.",
    ],
    [
      "Two words, said out loud.",
      "You and the shop both see the same two words. Saying them confirms you're meeting the right person before any money moves.",
    ],
    [
      "Your cash is kept aside.",
      'The shop reserves the amount for you for 15 minutes, so you don\'t walk over to "no cash today".',
    ],
    [
      "You pay the shop directly.",
      "CashNear never holds or moves your money. The payment happens on the shop's own payment device.",
    ],
    [
      "Both sides confirm.",
      "The shop enters the reference from its slip. You confirm you counted your cash. If something doesn't match, you can report it and a person reviews it.",
    ],
    [
      "The shop never sees where you are.",
      "Shops see your first name and roughly how far away you are. Nothing else.",
    ],
  ];
  return (
    <section id="safety" className="scroll-mt-16 border-b border-border">
      <Container className="grid gap-12 py-16 lg:grid-cols-[1fr_1.4fr] lg:py-24">
        <div>
          <SectionEyebrow>Why it is safe</SectionEyebrow>
          <SectionTitle>Built so you don't have to trust a stranger.</SectionTitle>
        </div>
        <ol className="flex flex-col divide-y divide-border border-y border-border">
          {items.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4 py-6">
              <span className="pt-1 font-mono text-[12px] text-gold">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-[22px] leading-tight text-foreground">{title}</h3>
                <p className="mt-2 max-w-[56ch] text-[14px] leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

/* ---------------- For shops ---------------- */

function ForShops() {
  const items = [
    "You choose when you're online, and how much cash you're willing to offer.",
    "You see the amount before you accept. No surprises at the till.",
    "Customers never see how much cash you hold. They only see whether you can serve them.",
    "A bright, high-contrast screen made for a busy counter in daylight.",
    "Free to join. CashNear charges shops nothing in the pilot.",
  ];
  return (
    <section id="operators" className="scroll-mt-16 border-b border-border">
      <Container className="grid items-center gap-14 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <SectionEyebrow>For shops</SectionEyebrow>
          <SectionTitle>Do you run a shop? Help your neighbours get cash.</SectionTitle>
          <ul className="mt-8 flex flex-col divide-y divide-border border-y border-border">
            {items.map((it) => (
              <li key={it} className="flex items-start gap-4 py-4">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                <span className="text-[15px] leading-relaxed text-foreground">{it}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">
            Register now. We check your documents and payment device, and a person visits before
            your shop goes live. Customers pay on your own payment device.
          </p>
          <div className="mt-8">
            <PrimaryBtn to="/auth" size="lg">
              Register my shop
            </PrimaryBtn>
          </div>
        </div>
        <PhoneFrame caption="An example of what a shop sees, in daylight mode." daylight>
          <ShopAcceptScreen />
        </PhoneFrame>
      </Container>
    </section>
  );
}

/* ---------------- Where we are ---------------- */

function Status({ signedIn }: { signedIn: boolean }) {
  const stages = [
    {
      label: "Now",
      title: "Checking shops in Orlando West",
      body: "We're checking and approving the first shops, one by one.",
      active: true,
    },
    {
      label: "Next",
      title: "A small private pilot",
      body: "A handful of checked shops and the first customers, with low limits.",
      active: false,
    },
    {
      label: "Then",
      title: "More shops, more places",
      body: "Only once the pilot shows it works and is safe.",
      active: false,
    },
  ];
  return (
    <section id="status" className="scroll-mt-16 border-b border-border">
      <Container className="py-16 lg:py-24">
        <SectionEyebrow>Where we are</SectionEyebrow>
        <SectionTitle>Small on purpose. Not open yet.</SectionTitle>
        <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground">
          You can't ask for cash on CashNear today. We'd rather open slowly and get it right.
        </p>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {stages.map((s) => (
            <li
              key={s.label}
              className={`border-t pt-5 ${s.active ? "border-gold" : "border-border-strong"}`}
            >
              <span
                className={`text-[11px] uppercase tracking-[0.22em] ${s.active ? "text-gold" : "text-muted-foreground"}`}
              >
                {s.label}
              </span>
              <h3 className="mt-3 font-display text-[24px] leading-tight text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        {!signedIn ? (
          <div className="mt-10">
            <PrimaryBtn to="/auth" size="lg">
              Tell me when it opens
            </PrimaryBtn>
          </div>
        ) : null}
      </Container>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

function Faq() {
  const faqs: [string, string][] = [
    [
      "Can I get cash through CashNear now?",
      "Not yet. We're checking and approving the first shops in Orlando West, Soweto. Create an account and we'll tell you when it opens.",
    ],
    [
      "What does it cost?",
      "During the pilot CashNear charges nothing. You pay your provider's normal fee, and you see it before you ask.",
    ],
    [
      "Do I need to upload my ID?",
      "CashNear doesn't ask for an ID document to request cash in the pilot. New customers start with a low limit that rises as they collect cash without problems.",
    ],
    [
      "Does CashNear hold my money?",
      "No. You pay the shop on its own payment device. CashNear only helps you find the shop and keeps track of the request.",
    ],
    [
      "What if the shop doesn't have my cash?",
      "Shops confirm before you walk. If a shop doesn't confirm in time, nothing happens and you can pick another. If something goes wrong at the till, report it in the app and a person reviews it.",
    ],
    [
      "Can any shop join?",
      "No. We check the business, its documents and its payment device before approval, and we can pause a shop if something is reported.",
    ],
  ];
  return (
    <section id="faq" className="scroll-mt-16 border-b border-border">
      <Container className="py-16 lg:py-24">
        <SectionEyebrow>FAQ</SectionEyebrow>
        <SectionTitle>Common questions.</SectionTitle>
        <div className="mt-12 divide-y divide-border border-y border-border">
          {faqs.map(([q, a]) => (
            <details key={q} className="group py-6">
              <summary className="flex cursor-pointer items-center justify-between gap-6 text-[16px] text-foreground">
                {q}
                <span className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-4 max-w-[70ch] text-[14px] leading-relaxed text-muted-foreground">
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
            Cash, kept aside for you. Starting in Orlando West, Soweto. Not open yet.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            ["Sign in", "/auth"],
            ["Register my business", "/auth"],
            ["Why it is safe", "#safety"],
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

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{title}</div>
      <ul className="mt-4 flex flex-col gap-3 text-[13px]">
        {links.map(([label, href]) =>
          href.startsWith("/") ? (
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
