export type CurrencyPreference = { country: string | null; currency: string; language?: string; rate: number; base: "USD"; updatedAt: string; source: string };
let activeCurrency: CurrencyPreference | null = null;
export function activateCurrency(preference: CurrencyPreference | null) { activeCurrency = preference; }
export function formatMoney(cents: number) {
  const backOffice = typeof window !== "undefined" && (location.pathname.startsWith("/admin") || location.pathname.startsWith("/advertiser"));
  const currency = !backOffice && activeCurrency?.currency ? activeCurrency.currency : "USD";
  const rate = currency === "USD" ? 1 : activeCurrency?.rate || 1;
  try { return new Intl.NumberFormat(activeCurrency?.language || (typeof navigator === "undefined" ? "en-US" : navigator.language), { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 }).format(cents / 100 * rate); }
  catch { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
}
