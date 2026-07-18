import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CashNear — Neighbourhood cash access, safely." },
      {
        name: "description",
        content:
          "CashNear connects South Africans with verified neighbourhood businesses that can help you access cash safely, conveniently and transparently. Preparing for a controlled Johannesburg pilot.",
      },
      { property: "og:title", content: "CashNear — Neighbourhood cash access, safely." },
      {
        property: "og:description",
        content:
          "CashNear connects South Africans with verified neighbourhood businesses that can help you access cash safely, conveniently and transparently. Preparing for a controlled Johannesburg pilot.",
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
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
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
          <a href="#how" className="hover:text-foreground">How it works</a>
          <a href="#customers" className="hover:text-foreground">For customers</a>
          <a href="#operators" className="hover:text-foreground">For operators</a>
          <a href="#safety" className="hover:text-foreground">Safety</a>
          <a href="#about" className="hover:text-foreground">About</a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              <Link
                to="/home"
                className="hidden md:inline-flex h-10 items-center rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                Go to dashboard
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
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border-strong px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" /> Johannesburg pilot
          </span>
          <h1 className="mt-6 font-display text-[56px] leading-[0.98] tracking-tight text-foreground md:text-[76px]">
            Need cash?
            <br />
            Find it nearby.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[16px] leading-relaxed text-muted-foreground">
            CashNear connects you with verified neighbourhood businesses that can help you access
            cash safely, conveniently and transparently.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <PrimaryBtn to="/home" size="lg">Go to dashboard</PrimaryBtn>
            ) : (
              <PrimaryBtn to="/auth" size="lg">Get started</PrimaryBtn>
            )}
            <SecondaryBtn href="#how" size="lg">How it works</SecondaryBtn>
          </div>

          <p className="mt-8 text-[13px] text-muted-foreground">
            CashNear is preparing for a controlled pilot in Johannesburg. Not yet available
            nationwide.
          </p>
        </div>

        {/* Editorial visual — abstract midnight card */}
        <div className="relative hidden lg:block">
          <div className="absolute inset-0 rounded-[28px] border border-border-strong bg-surface" />
          <div className="relative flex h-full flex-col justify-between rounded-[28px] p-8">
            <div className="flex items-center justify-between">
              <SectionEyebrow>Live pilot corridor</SectionEyebrow>
              <span className="text-[11px] text-muted-foreground">ZAR</span>
            </div>
            <div>
              <div className="text-[13px] text-muted-foreground">Requested</div>
              <div className="mt-1 font-display text-[64px] leading-none text-foreground">R 500</div>
              <div className="mt-6 grid grid-cols-3 gap-4 text-[12px]">
                <Stat label="Fee" value="R 6" />
                <Stat label="ETA" value="9 min" />
                <Stat label="Distance" value="1.2 km" />
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-border pt-5 text-[12px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Verified operator · Rosebank
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
      title: "Request the cash amount you need.",
      body: "Tell CashNear how much cash you need and where you are.",
    },
    {
      n: "02",
      title: "Get matched with a verified nearby operator.",
      body: "We route your request to a verified neighbourhood business that can help.",
    },
    {
      n: "03",
      title: "Pay directly at the operator and collect your cash.",
      body: "You settle the payment on the operator's own card machine and walk away with cash.",
    },
  ];
  return (
    <section id="how" className="border-b border-border">
      <Container className="py-20 lg:py-28">
        <SectionEyebrow>How it works</SectionEyebrow>
        <SectionTitle>Three steps. Nothing hidden.</SectionTitle>
        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col gap-4">
              <span className="font-mono text-[12px] text-gold">{s.n}</span>
              <h3 className="font-display text-[26px] leading-tight text-foreground">{s.title}</h3>
              <p className="text-[14px] leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-border-strong bg-surface p-6 text-[14px] leading-relaxed text-muted-foreground">
          <span className="text-foreground">Payment disclosure. </span>
          CashNear does not hold or process your payment. Payment is completed directly with the
          verified operator.
        </div>
      </Container>
    </section>
  );
}

/* ---------------- For customers ---------------- */

function ForCustomers() {
  const items = [
    "Find nearby cash access.",
    "See the fee before travelling.",
    "Use verified commercial locations.",
    "Receive a secure transaction code.",
    "Confirm only after receiving cash.",
  ];
  return (
    <section id="customers" className="border-b border-border">
      <Container className="grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <SectionEyebrow>For customers</SectionEyebrow>
          <SectionTitle>Cash, on your terms.</SectionTitle>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
            CashNear is built for people who need cash quickly, without queueing at unfamiliar
            machines or walking around unknown neighbourhoods with money in hand.
          </p>
          <div className="mt-8">
            <PrimaryBtn to="/auth" size="lg">Create a customer account</PrimaryBtn>
          </div>
        </div>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-4 py-5">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              <span className="text-[15px] text-foreground">{it}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/* ---------------- For operators ---------------- */

function ForOperators() {
  const items = [
    "Receive verified customer demand.",
    "Control when you are available.",
    "Choose the amounts you can serve.",
    "Build a trusted business profile.",
    "Track requests, earnings and platform fees.",
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
          <SectionEyebrow>For operators</SectionEyebrow>
          <SectionTitle>Put your card machine to work.</SectionTitle>
          <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
            Verified South African businesses with an existing card machine can join the CashNear
            operator network and earn on every successful cash request they serve.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryBtn to="/auth" size="lg">Apply to become an operator</PrimaryBtn>
            <SecondaryBtn to="/auth" size="lg">Become an operator</SecondaryBtn>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------------- Safety ---------------- */

function Safety() {
  const items = [
    ["No public map of operator cash holdings", "Locations are never listed publicly."],
    ["Exact location revealed only after acceptance", "Precise pickup is shared once both sides confirm."],
    ["Commercial locations only during the pilot", "No residential addresses accepted in Version 1."],
    ["Time-limited transaction codes", "Every request carries a short-lived confirmation code."],
    ["Incident reporting", "Report a problem in-app and pause the operator instantly."],
    ["Verified business onboarding", "Every operator is manually reviewed by our ops team."],
  ];
  return (
    <section id="safety" className="border-b border-border">
      <Container className="py-20 lg:py-28">
        <SectionEyebrow>Safety by design</SectionEyebrow>
        <SectionTitle>Trust is the product.</SectionTitle>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {items.map(([title, body]) => (
            <div
              key={title}
              className="rounded-2xl border border-border-strong bg-surface p-6"
            >
              <h3 className="font-display text-[20px] leading-tight text-foreground">{title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ---------------- Pilot / About ---------------- */

function Pilot() {
  return (
    <section id="about" className="border-b border-border">
      <Container className="grid gap-12 py-20 lg:grid-cols-[1fr_1.1fr] lg:py-28">
        <div>
          <SectionEyebrow>The pilot</SectionEyebrow>
          <SectionTitle>Small on purpose.</SectionTitle>
        </div>
        <p className="text-[17px] leading-relaxed text-muted-foreground">
          CashNear is launching carefully, beginning with a small network of verified businesses in
          one Johannesburg corridor. The goal is to prove safety, reliability and repeatable access
          before expanding.
        </p>
      </Container>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

function Faq() {
  const faqs: [string, string][] = [
    ["What is CashNear?", "CashNear is a South African platform that connects people who need cash with verified neighbourhood businesses that can serve them."],
    ["Does CashNear hold my money?", "No. CashNear does not hold or process your payment. Payment happens directly between you and the operator on their card machine."],
    ["How do I pay?", "You pay the operator directly using your card at their existing card machine, and they hand you the agreed cash."],
    ["Who can become an operator?", "Registered South African businesses with an active card machine and a commercial location can apply. Every operator is manually verified."],
    ["How are operators verified?", "Our operations team reviews business documents, ownership, premises and terminal details before an operator can accept requests."],
    ["What fees do customers pay?", "During the pilot, transparent fees typically fall in the R2–R8 band per request. The exact fee is shown before you travel."],
    ["Is CashNear available everywhere?", "No. CashNear is preparing for a controlled pilot in one Johannesburg corridor. Wider availability will follow."],
    ["How does CashNear protect users?", "Verified operators only, commercial locations only, exact pickup revealed after acceptance, time-limited transaction codes and in-app incident reporting."],
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
            CashNear is preparing a controlled cash-access pilot in Johannesburg, South Africa. Not
            a financial services provider. Payment is completed directly with the verified operator.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            ["Sign in", "/auth"],
            ["Operator application", "/auth"],
            ["Safety", "#safety"],
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
          <span>Controlled pilot · Johannesburg, South Africa.</span>
        </Container>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
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
