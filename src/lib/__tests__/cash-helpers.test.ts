import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AMOUNT_CHOICES_CENTS,
  describeCashError,
  describeClosedReason,
  distanceLabel,
  fitWithin,
  formatClock,
  formatRand,
  isLiveStatus,
  remainingFraction,
  secondsLeft,
  walkLabel,
} from "@/lib/cash";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(repoRoot, p), "utf8");

describe("money and time formatting", () => {
  test("formats whole rand without decimals and fractions with two", () => {
    expect(formatRand(30000)).toBe("R300");
    expect(formatRand(700)).toBe("R7");
    expect(formatRand(750)).toBe("R7.50");
    expect(formatRand(0)).toBe("R0");
  });

  test("groups thousands with a non-breaking space", () => {
    expect(formatRand(300000)).toBe("R3 000");
  });

  test("clock text is minutes and zero-padded seconds, never negative", () => {
    expect(formatClock(872)).toBe("14:32");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(-3)).toBe("0:00");
  });

  test("secondsLeft rounds up and bottoms out at zero", () => {
    const now = Date.parse("2026-11-04T10:00:00Z");
    expect(secondsLeft("2026-11-04T10:01:30Z", now)).toBe(90);
    expect(secondsLeft("2026-11-04T09:59:00Z", now)).toBe(0);
    expect(secondsLeft(null, now)).toBe(0);
  });

  test("the ring fraction is clamped to 0..1", () => {
    expect(remainingFraction(450, 900)).toBe(0.5);
    expect(remainingFraction(2000, 900)).toBe(1);
    expect(remainingFraction(-1, 900)).toBe(0);
    expect(remainingFraction(10, 0)).toBe(0);
  });
});

describe("what customers and shops are shown", () => {
  test("walking time is plain language", () => {
    expect(walkLabel(1)).toBe("1 min walk");
    expect(walkLabel(6)).toBe("6 min walk");
  });

  test("a shop only ever sees a distance bucket, never an exact distance", () => {
    expect(distanceLabel(320)).toBe("Under 500 m away");
    expect(distanceLabel(870)).toBe("Under 1 km away");
    expect(distanceLabel(2400)).toBe("About 2 km away");
    expect(distanceLabel(null)).toBe("Nearby");
    for (const m of [10, 499, 999, 1500, 5000]) expect(distanceLabel(m)).not.toContain(String(m));
  });

  test("the pilot offers amounts from R100 to the R500 cap in R100 steps", () => {
    expect([...AMOUNT_CHOICES_CENTS]).toEqual([10000, 20000, 30000, 40000, 50000]);
  });

  test("only in-progress states keep the screen refreshing", () => {
    expect(isLiveStatus("awaiting_shop")).toBe(true);
    expect(isLiveStatus("held")).toBe(true);
    expect(isLiveStatus("awaiting_confirmation")).toBe(true);
    expect(isLiveStatus("completed")).toBe(false);
    expect(isLiveStatus("disputed")).toBe(false);
  });
});

describe("errors are plain language and never leak internals", () => {
  test("known engine errors map to readable sentences", () => {
    expect(describeCashError("shop_cannot_serve")).toMatch(/Pick another shop/);
    expect(describeCashError("already_active")).toMatch(/already have a request/);
    expect(describeCashError("paused_for_review")).toMatch(/report/);
  });

  test("the rate-limit message passes through unchanged", () => {
    const m = "Too many attempts. Please wait a few minutes and try again.";
    expect(describeCashError(m)).toBe(m);
  });

  test("unknown or raw database text is replaced, not shown", () => {
    for (const raw of [
      'duplicate key value violates unique constraint "x"',
      "permission denied for table cash_requests",
      "",
      null,
      undefined,
    ]) {
      const out = describeCashError(raw as string);
      expect(out).toBe("Something went wrong. Please try again.");
    }
  });

  test("closed requests explain that nothing was charged where that is true", () => {
    expect(describeClosedReason("shop_no_response")).toContain("Nothing was charged");
    expect(describeClosedReason("shop_declined_no_cash")).toContain("Nothing was charged");
    expect(describeClosedReason("hold_window_passed")).toMatch(/ran out/);
    expect(describeClosedReason(null)).toBe("This request has ended.");
  });
});

describe("principles the build must keep", () => {
  const cashFiles = [
    "src/routes/_authenticated/cash.tsx",
    "src/components/cash/ShopCashDesk.tsx",
    "src/components/cash/HoldRing.tsx",
    "src/components/cash/Handshake.tsx",
  ];

  test("fonts are self-hosted: no third-party font requests anywhere in the app shell", () => {
    expect(read("src/routes/__root.tsx")).not.toMatch(/fonts\.(googleapis|gstatic)\.com|fontshare/);
    expect(read("src/styles.css")).not.toMatch(/fonts\.(googleapis|gstatic)\.com|fontshare/);
    expect(read("src/styles.css")).toContain("@fontsource");
  });

  test("the cash screens use no stock icon library", () => {
    for (const f of cashFiles)
      expect(read(f)).not.toMatch(/lucide-react|react-icons|@tabler|heroicons/);
  });

  test("clients reach the engine only through its functions, never the request tables", () => {
    const api = read("src/lib/cash-api.ts");
    expect(api).not.toMatch(/\.from\(\s*["']cash_(requests|request_secrets|incidents)["']/);
    expect(api).toContain('supabase.rpc("cash_transition"');
    for (const f of [
      "src/routes/_authenticated/cash.tsx",
      "src/components/cash/ShopCashDesk.tsx",
    ]) {
      expect(read(f)).not.toMatch(/\.from\(\s*["']cash_requests["']/);
    }
  });

  test("asking for cash does not depend on identity documents or selfies", () => {
    const page = read("src/routes/_authenticated/cash.tsx");
    expect(page).not.toMatch(/customer_profiles|verification_status|id_document|selfie/i);
    expect(read("src/lib/cash-api.ts")).not.toMatch(/customer_profiles|id_document|selfie/i);
  });

  test("the shop screen never shows the customer's code or contact details", () => {
    const desk = read("src/components/cash/ShopCashDesk.tsx");
    expect(desk).not.toMatch(/req\.code\b|\.customer\?\.phone|\.customer\?\.email|mobile/);
  });

  test("the customer's location is never sent anywhere but as a rounded distance", () => {
    const page = read("src/routes/_authenticated/cash.tsx");
    expect(page).toContain("distanceM: s.distance_m");
    expect(read("src/lib/cash-api.ts")).not.toMatch(
      /p_(lat|lng)[^\n]*createCashRequest|create_cash_request[^)]*lat/,
    );
  });
});

describe("shop photos", () => {
  test("a large phone photo is shrunk to fit, keeping its shape", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
  });

  test("a small photo is never made bigger, and nonsense sizes are safe", () => {
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 600, 1280)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(5000, 1, 1280).height).toBe(1);
  });

  test("uploads are re-drawn as plain JPEGs, which drops hidden details such as where it was taken", () => {
    const src = read("src/lib/shopfront.ts");
    expect(src).toContain("drawImage");
    expect(src).toContain('"image/jpeg"');
    expect(src).toMatch(/\$\{businessId\}\/\$\{crypto\.randomUUID\(\)\}\.jpg/);
  });

  test("a missing or broken photo shows nothing, never a broken-image icon", () => {
    const c = read("src/components/cash/ShopfrontPhoto.tsx");
    expect(c).toMatch(/if \(!url \|\| failed\) return null/);
    expect(c).toContain("onError");
  });

  test("customers see the photo and landmark when choosing a shop and while they walk to it", () => {
    const page = read("src/routes/_authenticated/cash.tsx");
    expect(page).toMatch(/<ShopfrontPhoto path=\{s\.photo_path\}/);
    expect(page).toMatch(/<ShopfrontPhoto path=\{req\.shop\?\.photo_path\}/);
    expect(page).toContain("s.landmark");
    expect(page).toContain("req.shop.landmark");
  });

  test("only the admin panel can change them, and shops and customers have no way to", () => {
    expect(read("src/components/admin/CashPointPanel.tsx")).toContain("cash_set_shopfront");
    for (const f of [
      "src/routes/_authenticated/cash.tsx",
      "src/routes/_authenticated/customer.tsx",
      "src/routes/_authenticated/operator.dashboard.tsx",
      "src/components/cash/ShopCashDesk.tsx",
    ]) {
      const src = read(f);
      expect(src).not.toContain("cash_set_shopfront");
      expect(src).not.toContain("uploadShopfront");
    }
  });
});

describe("customers are never made to feel an ID is needed", () => {
  const home = read("src/routes/_authenticated/customer.tsx");

  test("the home screen has no ID, selfie or verification step at all", () => {
    expect(home).not.toMatch(
      /selfie|id_document|VerificationForm|verification_status|customer_profiles/i,
    );
    expect(home).not.toMatch(/ProgressBar|Under review|Not started/);
  });

  test("getting cash comes first on the home screen, before recent activity", () => {
    const cash = home.indexOf("Find cash near me");
    const recent = home.indexOf('id="recent-heading"');
    expect(cash).toBeGreaterThan(-1);
    expect(cash).toBeLessThan(recent);
  });

  test("the customer's screens open in daylight through the shared app shell", () => {
    const shell = read("src/components/ds/AppShell.tsx");
    expect(shell).toContain("useApplyTheme()");
    expect(read("src/routes/_authenticated/cash.tsx")).toMatch(/<AppShell>/);
  });
});
