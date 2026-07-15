/**
 * CashNear currency & localisation.
 * Default market: South Africa (ZAR / R).
 * Add new countries here — never hardcode inside components.
 */

export type CurrencyCode = "ZAR" | "NGN" | "KES" | "GHS";

export interface LocaleConfig {
  country: string;
  countryCode: string;
  currency: CurrencyCode;
  symbol: string;
  locale: string;
}

export const LOCALES: Record<string, LocaleConfig> = {
  ZA: {
    country: "South Africa",
    countryCode: "ZA",
    currency: "ZAR",
    symbol: "R",
    locale: "en-ZA",
  },
  NG: {
    country: "Nigeria",
    countryCode: "NG",
    currency: "NGN",
    symbol: "₦",
    locale: "en-NG",
  },
  KE: {
    country: "Kenya",
    countryCode: "KE",
    currency: "KES",
    symbol: "KSh",
    locale: "en-KE",
  },
  GH: {
    country: "Ghana",
    countryCode: "GH",
    currency: "GHS",
    symbol: "GH₵",
    locale: "en-GH",
  },
};

export const DEFAULT_LOCALE = LOCALES.ZA;

export function formatAmount(
  value: number,
  locale: LocaleConfig = DEFAULT_LOCALE,
  opts: { withSymbol?: boolean; decimals?: number } = {},
): string {
  const { withSymbol = true, decimals = 0 } = opts;
  const formatted = new Intl.NumberFormat(locale.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return withSymbol ? `${locale.symbol} ${formatted}` : formatted;
}
