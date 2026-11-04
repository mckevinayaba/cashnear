import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(join(repoRoot, path));
  // PNG: 8-byte signature, then the IHDR chunk with width and height.
  expect(b.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe("CashNear can be put on a phone's home screen", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));

  test("it opens like an app: full screen, portrait, from the front door", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.orientation).toBe("portrait");
    expect(manifest.start_url).toBe("/");
    expect(manifest.name).toBe("CashNear");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  test("it has the icons Android needs, and each file is really the size it claims", () => {
    const wanted = [
      ["/icon-192.png", 192, "any"],
      ["/icon-512.png", 512, "any"],
      ["/icon-maskable-512.png", 512, "maskable"],
    ] as const;
    for (const [src, size, purpose] of wanted) {
      const icon = manifest.icons.find((i: { src: string }) => i.src === src);
      expect(icon).toBeTruthy();
      expect(icon.purpose).toBe(purpose);
      expect(existsSync(join(repoRoot, "public", src))).toBe(true);
      expect(pngSize(`public${src}`)).toEqual({ width: size, height: size });
    }
  });

  test("iPhones get a real PNG touch icon, because they ignore an SVG one", () => {
    expect(pngSize("public/apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('href: "/apple-touch-icon.png"');
    expect(root).not.toMatch(/apple-touch-icon", href: "\/favicon\.svg/);
  });

  test("the page head tells phones it is an app", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain('rel: "manifest"');
    expect(root).toContain("viewport-fit=cover");
    expect(root).toContain('name: "theme-color"');
    expect(root).toContain('name: "apple-mobile-web-app-capable"');
  });

  test("the icons are small, so installing is quick on a weak signal", () => {
    for (const f of [
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-512.png",
      "apple-touch-icon.png",
    ])
      expect(statSync(join(repoRoot, "public", f)).size).toBeLessThan(40_000);
  });

  test("the status bar follows the screen's colour when the look changes", () => {
    const hook = read("src/hooks/use-shop-theme.ts");
    expect(hook).toContain('meta[name="theme-color"]');
    expect(hook).toContain("DAYLIGHT_BAR");
  });
});

describe("a phone opens on an app welcome, not a web page", () => {
  const page = read("src/routes/index.tsx");
  const welcome = read("src/components/landing/MobileWelcome.tsx");

  test("the welcome is for phones only, and the website stays for computers", () => {
    expect(welcome).toMatch(/lg:hidden/);
    expect(page).toContain("<MobileWelcome");
    expect(page).toMatch(/hidden lg:contents/);
  });

  test("it puts the two things a person can do right on the screen: join, or register a shop", () => {
    expect(welcome).toContain("Join free");
    expect(welcome).toContain("I own a shop");
    expect(welcome).toContain('search={{ mode: "signup" }}');
    expect(welcome).toContain('search={{ mode: "signup", as: "shop" }}');
    expect(welcome).toContain("Sign in");
  });

  test("it fills the screen and respects the notch and gesture bar", () => {
    expect(welcome).toContain("min-h-dvh");
    expect(welcome).toContain("env(safe-area-inset-bottom)");
    expect(welcome).toContain("env(safe-area-inset-top)");
  });

  test("the example screens say they are not real", () => {
    expect(welcome).toContain("Example screens. The numbers on them are not real.");
    expect(welcome).toContain('aria-hidden="true"');
  });

  test("the slides can be used by touch, buttons and assistive technology", () => {
    expect(welcome).toContain("snap-x");
    expect(welcome).toContain('aria-roledescription="carousel"');
    expect(welcome).toContain('role="tab"');
  });

  test("it makes no promise the product cannot keep, names no place, and uses no icon library", () => {
    expect(welcome).not.toMatch(
      /Soweto|Orlando|Johannesburg|Hillbrow|gotyme|capitec|guarantee|earn\b|not open|coming soon/i,
    );
    expect(welcome).not.toMatch(/lucide-react|react-icons|@tabler|heroicons/);
  });

  test("inside the installed app, the website below is hidden and a signed-in person goes straight in", () => {
    expect(read("src/styles.css")).toMatch(/display-mode: standalone[\s\S]*\.site-extra/);
    expect(page).toContain("isStandaloneNow()");
    expect(page).toMatch(/navigate\(\{ to: "\/home"/);
  });
});

describe("asking people to install is polite", () => {
  const card = read("src/components/InstallCard.tsx");
  const hook = read("src/hooks/use-install-prompt.ts");

  test("it shows on phones only, never inside the installed app, and stays quiet for two weeks after 'not now'", () => {
    expect(card).toContain("lg:hidden");
    expect(card).toMatch(/standalone \|\| \(dismissed && !alwaysShow\)/);
    expect(hook).toContain("QUIET_DAYS = 14");
  });

  test("iPhone users are told the two taps, since their browser has no install button", () => {
    expect(card).toContain("Add to Home Screen");
    expect(hook).toMatch(/iPhone\|iPad\|iPod/);
  });

  test("it is offered on Home and in Account", () => {
    expect(read("src/routes/_authenticated/customer.tsx")).toContain("<InstallCard />");
    expect(read("src/routes/_authenticated/account.tsx")).toContain("<InstallCard alwaysShow />");
  });
});
