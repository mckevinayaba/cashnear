import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CashNear — Find cash near you." },
      {
        name: "description",
        content:
          "CashNear helps you find a checked shop near you for cash. Cash requests are not open yet. We are checking shops in Johannesburg.",
      },
      { property: "og:title", content: "CashNear — Need cash? Find a shop nearby." },
      {
        property: "og:description",
        content: "Find a checked shop near you for cash. Cash requests are not open yet.",
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
        <HowItWorks />
        <ForCustomers />
        <ForOperators />
        <Safety />
        <Pilot />
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
          <a href="#customers" className="hover:text-foreground">
            For customers
          </a>
          <a href="#operators" className="hover:text-foreground">
            For businesses
          </a>
          <a href="#safety" className="hover:text-foreground">
            Trust
          </a>
          <a href="#about" className="hover:text-foreground">
            About
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
      <Container className="grid gap-16 py-20 lg:grid-cols-[1.15fr_1fr] lg:py-28">
        <div className="flex flex-col justify-center">
          <h1 className="font-display text-[56px] leading-[0.98] tracking-tight text-foreground md:text-[76px]">
            Need cash?
            <br />
            Find a shop nearby that can help.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted-foreground">
            CashNear helps you find a checked shop near you. You will see the fee before you go.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <PrimaryBtn to="/home" size="lg">
                Go to my account
              </PrimaryBtn>
            ) : (
              <>
                <PrimaryBtn to="/auth" size="lg">
                  I need cash
                </PrimaryBtn>
                <SecondaryBtn to="/auth" size="lg">
                  I own a shop
                </SecondaryBtn>
              </>
            )}
          </div>

          <p className="mt-8 text-[13px] text-muted-foreground">
            Cash requests are not open yet. We are checking shops in Johannesburg.
          </p>
        </div>

        {/* Editorial visual — abstract midnight card */}
        <div className="relative hidden lg:block">
          <div className="absolute inset-0 rounded-[28px] border border-border-strong bg-surface" />
          <div className="relative flex h-full flex-col justify-between rounded-[28px] p-8">
            <div className="flex items-center justify-between">
              <SectionEyebrow>How a request could look</SectionEyebrow>
            </div>
            <div>
              <div className="text-[13px] text-muted-foreground">Amount</div>
              <div className="mt-1 font-display text-[64px] leading-none text-foreground">
                R 500
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4 text-[12px]">
                <Stat label="Fee" value="R 6" />
                <Stat label="Time" value="9 min" />
                <Stat label="Distance" value="1.2 km" />
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-5">
              <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Example shop nearby
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                This is only an example. The amount, fee, time and distance are not from a real
                request.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className="font-display text-[22px] text-foreground">{value}</span>
    </div>
  );
}

/* ---------------- How it works ---------------- */

function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Tell us how much you need",
      body: "Enter the amount and your location.",
    },
    {
      n: "02",
      title: "See a shop near you and the fee",
      body: "A checked shop confirms it can help.",
    },
    {
      n: "03",
      title: "Go there and get your cash",
      body: "See the fee and address before you go.",
    },
  ];
  return (
    <section id="how" className="border-b border-border">
      <Container className="py-20 lg:py-28">
        <SectionEyebrow>How it works</SectionEyebrow>
        <SectionTitle>How to get cash</SectionTitle>
        <p className="mt-4 text-[15px] text-muted-foreground">When cash requests open:</p>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col gap-4">
              <span className="font-mono text-[12px] text-gold">{s.n}</span>
              <h3 className="font-display text-[26px] leading-tight text-foreground">{s.title}</h3>
              <p className="text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-border-strong bg-surface p-6 text-[14px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Please note: </span>
          CashNear does not hold your money. You pay the shop directly.
        </div>
      </Container>
    </section>
  );
}

/* ---------------- For customers ---------------- */

function ForCustomers() {
  const items = [
    "Find a shop near you.",
    "See the fee before you agree.",
    "Meet at the shop, not someone's home.",
    "Get the address after the shop agrees.",
    "Pay the shop, not CashNear.",
  ];
  return (
    <section id="customers" className="border-b border-border">
      <Container className="grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <SectionEyebrow>For customers</SectionEyebrow>
          <SectionTitle>Cash near you, when you need it.</SectionTitle>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
            No standing at a strange machine. No walking around with money in your hand.
          </p>
          <div className="mt-8">
            <PrimaryBtn to="/auth" size="lg">
              I need cash
            </PrimaryBtn>
          </div>
        </div>
        <div>
          <p className="mb-3 text-[13px] uppercase tracking-[0.2em] text-muted-foreground">
            Once cash requests open:
          </p>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {items.map((it) => (
              <li key={it} className="flex items-center gap-4 py-5">
                <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                <span className="text-[15px] text-foreground">{it}</span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

/* ---------------- For businesses ---------------- */

function ForOperators() {
  const items = [
    "Get more customers.",
    "When cash requests open, approved businesses can earn a fee.",
    "Choose when you are available.",
    "See the amount before you accept.",
  ];
  return (
    <section id="operators" className="border-b border-border">
      <Container className="grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <ul className="order-2 flex flex-col divide-y divide-border border-y border-border lg:order-1">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-4 py-5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              <span className="text-[15px] text-foreground">{it}</span>
            </li>
          ))}
        </ul>
        <div className="order-1 lg:order-2">
          <SectionEyebrow>For businesses</SectionEyebrow>
          <SectionTitle>Do you own a shop?</SectionTitle>
          <p className="mt-3 text-[18px] font-medium text-foreground">
            Get more customers and earn a fee.
          </p>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
            Join CashNear and help people nearby get cash.
          </p>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Register your business now. We will let you know when cash requests open.
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Shops and other approved businesses can join.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryBtn to="/auth" size="lg">
              Register my business
            </PrimaryBtn>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------------- Trust ---------------- */

function Safety() {
  const items = [
    "We check every shop before it can help customers.",
    "When cash requests open, you will see the fee before you agree.",
    "The address will be shared after the shop accepts your request.",
    "Meet at the shop, not at someone's home.",
  ];
  return (
    <section id="safety" className="border-b border-border">
      <Container className="py-20 lg:py-28">
        <SectionEyebrow>Trust</SectionEyebrow>
        <SectionTitle>Know before you go</SectionTitle>
        <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          CashNear is designed to make the process clearer and safer.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {items.map((item) => (
            <div key={item} className="rounded-2xl border border-border-strong bg-surface p-6">
              <p className="font-display text-[19px] leading-tight text-foreground">{item}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------- About ---------------- */

function Pilot() {
  return (
    <section id="about" className="border-b border-border">
      <Container className="grid gap-12 py-20 lg:grid-cols-[1fr_1.1fr] lg:py-28">
        <div>
          <SectionEyebrow>Our approach</SectionEyebrow>
          <SectionTitle>Small on purpose.</SectionTitle>
        </div>
        <p className="text-[17px] leading-relaxed text-muted-foreground">
          CashNear is starting small. We are checking shops in one part of Johannesburg first. This
          helps us keep it safe and reliable.
        </p>
      </Container>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

function Faq() {
  const faqs: [string, string][] = [
    [
      "Can I get cash through CashNear now?",
      "Not yet. We are checking and approving shops in Johannesburg. We will let you know when cash requests open.",
    ],
    [
      "How will I get cash?",
      "Tell us how much you need. A checked shop near you can accept your request. You will see the fee before you go.",
    ],
    [
      "Will I see the fee first?",
      "Yes. When cash requests open, you will see the fee before you agree.",
    ],
    ["Why does CashNear check shops?", "We check every shop before it can help customers."],
    [
      "Where will CashNear start?",
      "CashNear will start in Johannesburg. More places can be added later.",
    ],
    ["Can any shop join?", "No. We check the business and its documents before approval."],
  ];
  return (
    <section id="faq" className="border-b border-border">
      <Container className="py-20 lg:py-28">
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
            Find cash nearby. See the fee before you go. Cash requests are not open yet.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            ["Sign in", "/auth"],
            ["Register my business", "/auth"],
            ["Trust", "#safety"],
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
          <span>CashNear · Johannesburg, South Africa</span>
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
