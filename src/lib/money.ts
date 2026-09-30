/**
 * Money helpers. Amounts are integers in the currency's minor unit (e.g. centavos for PHP,
 * yen for JPY). Parsing and formatting are done with string/BigInt arithmetic, so no
 * floating-point value ever represents money.
 */

export const CURRENCIES = {
  PHP: { name: "Philippine peso", decimals: 2 },
  USD: { name: "US dollar", decimals: 2 },
  EUR: { name: "Euro", decimals: 2 },
  GBP: { name: "British pound", decimals: 2 },
  JPY: { name: "Japanese yen", decimals: 0 },
  SGD: { name: "Singapore dollar", decimals: 2 },
  AUD: { name: "Australian dollar", decimals: 2 },
  CAD: { name: "Canadian dollar", decimals: 2 },
  NZD: { name: "New Zealand dollar", decimals: 2 },
  HKD: { name: "Hong Kong dollar", decimals: 2 },
  CNY: { name: "Chinese yuan", decimals: 2 },
  KRW: { name: "South Korean won", decimals: 0 },
  INR: { name: "Indian rupee", decimals: 2 },
  IDR: { name: "Indonesian rupiah", decimals: 2 },
  MYR: { name: "Malaysian ringgit", decimals: 2 },
  THB: { name: "Thai baht", decimals: 2 },
  VND: { name: "Vietnamese dong", decimals: 0 },
  AED: { name: "UAE dirham", decimals: 2 },
  SAR: { name: "Saudi riyal", decimals: 2 },
  CHF: { name: "Swiss franc", decimals: 2 },
} as const satisfies Record<string, { name: string; decimals: number }>;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const DEFAULT_CURRENCY: CurrencyCode = "PHP";

/** Largest single amount accepted, in minor units (matches the database check constraint). */
export const MAX_AMOUNT_MINOR = 999_999_999_999;

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && Object.hasOwn(CURRENCIES, value);
}

export function currencyDecimals(currency: string): number {
  return isCurrencyCode(currency) ? CURRENCIES[currency].decimals : 2;
}

export type ParseMoneyResult =
  | { ok: true; minor: number }
  | { ok: false; error: string };

/**
 * Parses user input like "1,234.50" into minor units for the given currency.
 * Rejects negatives, scientific notation, and more decimals than the currency allows.
 */
export function parseMoneyToMinor(input: string, currency: string): ParseMoneyResult {
  const decimals = currencyDecimals(currency);
  const cleaned = input.trim().replace(/[\s,]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter an amount" };
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(cleaned)) {
    return { ok: false, error: "Enter a valid amount, e.g. 1,250.00" };
  }
  const [wholeRaw = "", fractionRaw = ""] = cleaned.split(".");
  if (fractionRaw.length > decimals) {
    return {
      ok: false,
      error:
        decimals === 0
          ? `${currency} amounts can't have decimals`
          : `Use at most ${decimals} decimal places`,
    };
  }
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (whole.replace(/^0+/, "").length > 13) {
    return { ok: false, error: "Amount is too large" };
  }
  const minor =
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt((fractionRaw + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (minor <= BigInt(0)) return { ok: false, error: "Amount must be greater than zero" };
  if (minor > BigInt(MAX_AMOUNT_MINOR)) return { ok: false, error: "Amount is too large" };
  return { ok: true, minor: Number(minor) };
}

/** Converts minor units to an exact decimal string, e.g. 123456 PHP → "1234.56". */
export function minorToDecimalString(minor: number | bigint, currency: string): string {
  const decimals = currencyDecimals(currency);
  const value = BigInt(minor);
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals);
  const fraction = decimals === 0 ? "" : `.${digits.slice(-decimals)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** Value for an amount input field (no grouping separators). */
export function minorToInputValue(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  return minorToDecimalString(minor, currency);
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let instance = moneyFormatters.get(key);
  if (!instance) {
    instance = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
    });
    moneyFormatters.set(key, instance);
  }
  return instance;
}

/**
 * Formats minor units as currency. The exact decimal string is passed to Intl, so large
 * values are never rounded through a float.
 */
export function formatMoney(
  minor: number | bigint,
  currency: string,
  options: { compact?: boolean; signDisplay?: "auto" | "always" } = {},
): string {
  const decimal = minorToDecimalString(minor, currency);
  const formatted = moneyFormatter(currency, options.compact ?? false).format(
    decimal as Intl.StringNumericLiteral,
  );
  if (options.signDisplay === "always" && !decimal.startsWith("-") && decimal !== "0") {
    return `+${formatted}`;
  }
  return formatted;
}

/** Converts minor units to a plain number of major units, for chart scales only. */
export function minorToChartValue(minor: number, currency: string): number {
  return Number(minorToDecimalString(minor, currency));
}

/** Exact integer sum; throws if the result leaves the safe-integer range. */
export function sumMinor(values: Iterable<number | bigint>): number {
  let total = BigInt(0);
  for (const value of values) total += BigInt(value);
  if (total > BigInt(Number.MAX_SAFE_INTEGER) || total < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError("Sum exceeds safe integer range");
  }
  return Number(total);
}

export function currencySymbol(currency: string): string {
  const part = moneyFormatter(currency, false)
    .formatToParts(0)
    .find((p) => p.type === "currency");
  return part?.value ?? currency;
}
