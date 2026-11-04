import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

/* ---------- WCAG contrast ---------- */

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function daylightTokens(): Record<string, string> {
  const css = read("src/styles.css");
  const block = css.match(/\.theme-daylight\s*\{([\s\S]*?)\n\}/);
  if (!block) throw new Error("daylight block missing");
  const tokens: Record<string, string> = {};
  for (const m of block[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g))
    tokens[m[1]] = m[2];
  return tokens;
}

describe("daylight theme (the shop's default) is readable in sunlight", () => {
  const t = daylightTokens();

  test("body text is at least AAA contrast on the page and on cards", () => {
    expect(contrast(t.foreground, t.background)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.foreground, t.surface)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.foreground, t["surface-2"])).toBeGreaterThanOrEqual(7);
  });

  test("supporting text meets AA on the page and on raised cards", () => {
    expect(contrast(t["muted-foreground"], t.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["muted-foreground"], t["surface-2"])).toBeGreaterThanOrEqual(4.5);
  });

  test("gold text and status colours stay legible as text", () => {
    for (const bg of [t.background, t["surface-2"], t.surface]) {
      expect(contrast(t.gold, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.success, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.destructive, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("buttons have AAA contrast between label and fill", () => {
    expect(contrast(t["primary-foreground"], t.primary)).toBeGreaterThanOrEqual(7);
    expect(contrast(t["success-foreground"], t.success)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["destructive-foreground"], t.destructive)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("shop dashboard uses the daylight theme", () => {
  test("the theme is applied from a hook and removed when the shop leaves", () => {
    const hook = read("src/hooks/use-shop-theme.ts");
    expect(hook).toContain('"theme-daylight"');
    expect(hook).toMatch(/classList\.remove\(DAYLIGHT_CLASS\)/);
    expect(read("src/routes/_authenticated/operator.dashboard.tsx")).toContain("useShopTheme()");
  });

  test("a shop can switch to night mode, and the choice survives a missing storage", () => {
    const hook = read("src/hooks/use-shop-theme.ts");
    expect(hook).toContain('"night"');
    expect(hook).toMatch(/catch/);
  });
});

/* ---------- Landing page honesty ---------- */

describe("the public page makes no claim the product can't back", () => {
  const files = ["src/routes/index.tsx", "src/components/landing/ExampleScreens.tsx"];
  const page = read("src/routes/index.tsx");

  test("it invites people to join early access without saying cash is available today", () => {
    expect(page).toMatch(/Early access/);
    expect(page).toMatch(/as soon as a shop near you is ready/);
    expect(page).not.toMatch(/available now|live now|live today|open now|open today|try it today/i);
  });

  test("it never reads as a product that is switched off", () => {
    expect(page).not.toMatch(
      /not open|not yet|coming soon|launching soon|cannot ask for cash|waitlist|under construction/i,
    );
  });

  test("every join button carries the person's choice (customer or shop) into sign-up", () => {
    expect(page).toMatch(/join="customer"/);
    expect(page).toMatch(/join="shop"/);
    expect(page).toMatch(/search=\{joinSearch\(/);
  });

  test("it names no payment partner or bank", () => {
    for (const f of files)
      expect(read(f)).not.toMatch(/gotyme|flash|capitec|fnb|kazang|standard bank|absa|nedbank/i);
  });

  test("it promises no income, volume or guaranteed outcomes", () => {
    expect(page).not.toMatch(
      /\bearn\b|income|more customers|guarantee|always|best rates?|cheapest/i,
    );
  });

  test("every example screen is labelled as an example", () => {
    const captions = [...page.matchAll(/caption(?:=|:\s*)"([^"]+)"/g)].map((m) => m[1]);
    expect(captions.length).toBeGreaterThanOrEqual(6);
    for (const c of captions) expect(c).toMatch(/not real|how it looks/i);
  });

  test("example screens are hidden from assistive tech so made-up data isn't read as real", () => {
    expect(read("src/components/landing/ExampleScreens.tsx")).toMatch(/aria-hidden="true"/);
  });

  test("the product is visible on a phone: the hero shows a real screen, not a desktop-only graphic", () => {
    const hero = page.slice(page.indexOf("function Hero"), page.indexOf("function Flow"));
    expect(hero).toContain("<PhoneFrame");
    expect(hero).not.toMatch(/hidden\s+lg:block/);
  });

  test("no stock icon library on the public page", () => {
    for (const f of files)
      expect(read(f)).not.toMatch(/lucide-react|react-icons|@tabler|heroicons/);
  });

  test("the animated example respects reduced-motion preferences", () => {
    expect(read("src/components/landing/ExampleScreens.tsx")).toContain("prefers-reduced-motion");
  });

  test("the privacy and cost claims match what the engine does", () => {
    expect(page).toMatch(/charges you nothing/);
    expect(page).toMatch(/never keeps your money/i);
    expect(page).toMatch(/90 seconds/);
    expect(page).toMatch(/15 minutes/);
  });
});

describe("the pages are plain, unmarked and say nothing about where we launch", () => {
  const publicCopy = ["src/routes/index.tsx", "src/components/landing/ExampleScreens.tsx"];
  const everyScreen = [
    ...publicCopy,
    "src/routes/_authenticated/cash.tsx",
    "src/components/cash/ShopCashDesk.tsx",
    "src/routes/_authenticated/customer.tsx",
    "src/routes/_authenticated/operator.dashboard.tsx",
    "src/lib/cash.ts",
  ];

  test("no place name appears anywhere a customer or shop can read it", () => {
    for (const f of everyScreen)
      expect(read(f)).not.toMatch(/Soweto|Orlando|Johannesburg|Alexandra|Tembisa/);
  });

  test("the app never quietly searches a default area when location is off", () => {
    const page = read("src/routes/_authenticated/cash.tsx");
    expect(page).not.toMatch(/PILOT_CENTER|usedFallback/);
    expect(page).toMatch(/Turn on your phone's location/);
  });

  test("no step numbers, bullet dots, plus signs or decorative pills on the public page", () => {
    const page = read("src/routes/index.tsx");
    expect(page).not.toMatch(/padStart\(2/);
    expect(page).not.toMatch(/>\s*0[1-9]\s*</);
    expect(page).not.toMatch(/h-1\.5 w-1\.5 rounded-full/);
    expect(page).not.toMatch(/>\s*\+\s*</);
  });

  test("the public copy avoids words an everyday reader would not use", () => {
    // Only what a person reads: text between tags, and quoted sentences. Code
    // names (imports, components, class names) are not copy.
    const visibleText = (src: string) =>
      [
        ...[...src.matchAll(/>([^<>{}]{3,})</g)].map((m) => m[1]),
        ...[...src.matchAll(/"([^"\n]{3,})"/g)]
          .map((m) => m[1])
          .filter((t) => /\s/.test(t) && !t.startsWith("@/")),
      ].join(" ");
    const jargon = /\bprovider\b|\bhandshake\b|\brail\b|\bheld\b|\bmechanism|\bpilot\b|\bonboard/i;
    for (const f of publicCopy) {
      expect(visibleText(read(f))).not.toMatch(jargon);
    }
  });
});
