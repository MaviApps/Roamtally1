export interface CurrencyOption {
  code: string;
  label: string;
  shortLabel: string;
}

export const CURRENCY_OPTIONS: readonly CurrencyOption[] = [
  { code: 'USD', label: 'USD — US Dollar ($)', shortLabel: 'USD ($)' },
  { code: 'INR', label: 'INR — Indian Rupee (₹)', shortLabel: 'INR (₹)' },
  { code: 'AED', label: 'AED — UAE Dirham (د.إ)', shortLabel: 'AED (UAE)' },
  { code: 'EUR', label: 'EUR — Euro (€)', shortLabel: 'EUR (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)', shortLabel: 'GBP (£)' },
  { code: 'JPY', label: 'JPY — Japanese Yen (¥)', shortLabel: 'JPY (¥)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar ($)', shortLabel: 'CAD ($)' },
  { code: 'AUD', label: 'AUD — Australian Dollar ($)', shortLabel: 'AUD ($)' },
  { code: 'CHF', label: 'CHF — Swiss Franc', shortLabel: 'CHF' },
  { code: 'SGD', label: 'SGD — Singapore Dollar ($)', shortLabel: 'SGD ($)' },
  { code: 'THB', label: 'THB — Thai Baht (฿)', shortLabel: 'THB (฿)' },
  { code: 'MXN', label: 'MXN — Mexican Peso ($)', shortLabel: 'MXN ($)' },
  { code: 'SAR', label: 'SAR — Saudi Riyal', shortLabel: 'SAR' },
  { code: 'MYR', label: 'MYR — Malaysian Ringgit', shortLabel: 'MYR' },
] as const;

export const SUPPORTED_CURRENCIES = CURRENCY_OPTIONS.map((c) => c.code);

export const TRAVEL_DESTINATION_COUNTRIES: readonly string[] = [
  'Argentina',
  'Australia',
  'Austria',
  'Bahrain',
  'Belgium',
  'Bhutan',
  'Brazil',
  'Cambodia',
  'Canada',
  'Chile',
  'China',
  'Colombia',
  'Costa Rica',
  'Croatia',
  'Czech Republic',
  'Denmark',
  'Egypt',
  'Finland',
  'France',
  'Georgia',
  'Germany',
  'Greece',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Ireland',
  'Israel',
  'Italy',
  'Japan',
  'Jordan',
  'Kenya',
  'Kuwait',
  'Malaysia',
  'Maldives',
  'Mauritius',
  'Mexico',
  'Morocco',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Norway',
  'Oman',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Qatar',
  'Saudi Arabia',
  'Scotland',
  'Seychelles',
  'Singapore',
  'South Africa',
  'South Korea',
  'Spain',
  'Sri Lanka',
  'Sweden',
  'Switzerland',
  'Taiwan',
  'Tanzania',
  'Thailand',
  'Turkey',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Vietnam',
] as const;

// Fallback USD-base rates when offline
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  INR: 84.2,
  AED: 3.6725,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154.5,
  CAD: 1.39,
  AUD: 1.53,
  CHF: 0.88,
  SGD: 1.34,
  THB: 34.6,
  MXN: 20.1,
  SAR: 3.75,
  MYR: 4.45,
};

const rateCache = new Map<string, { rates: Record<string, number>; fetchedAt: number }>();

export function formatCurrencyOptionLabel(code: string, compact = false): string {
  const match = CURRENCY_OPTIONS.find((c) => c.code === code.toUpperCase());
  if (!match) return code.toUpperCase();
  return compact ? match.shortLabel : match.label;
}

export async function fetchRatesForBase(baseCurrency: string): Promise<Record<string, number>> {
  const base = baseCurrency.toUpperCase();
  const cached = rateCache.get(base);
  if (cached && Date.now() - cached.fetchedAt < 1000 * 60 * 30) {
    return cached.rates;
  }

  try {
    const res = await fetch(`/api/travel/fx?base=${encodeURIComponent(base)}`);
    if (res.ok) {
      const data = (await res.json()) as { rates?: Record<string, number> };
      if (data.rates && typeof data.rates[base] === 'number') {
        rateCache.set(base, { rates: data.rates, fetchedAt: Date.now() });
        return data.rates;
      }
    }
  } catch {
    // Fall back to cached/offline rates
  }

  const baseInUsd = FALLBACK_USD_RATES[base] ?? 1;
  const computed: Record<string, number> = {};
  for (const [code, usdRate] of Object.entries(FALLBACK_USD_RATES)) {
    computed[code] = usdRate / baseInUsd;
  }
  return computed;
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  ratesForFromBase: Record<string, number>
): { convertedAmount: number; rate: number } {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) {
    return { convertedAmount: Math.round(amount * 100) / 100, rate: 1 };
  }
  const directRate = ratesForFromBase[to];
  if (typeof directRate === 'number' && directRate > 0) {
    return {
      convertedAmount: Math.round(amount * directRate * 100) / 100,
      rate: directRate,
    };
  }
  const fallbackFrom = FALLBACK_USD_RATES[from] ?? 1;
  const fallbackTo = FALLBACK_USD_RATES[to] ?? 1;
  const rate = fallbackTo / fallbackFrom;
  return {
    convertedAmount: Math.round(amount * rate * 100) / 100,
    rate,
  };
}
