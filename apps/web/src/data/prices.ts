// Helpers to show prices (ADR 86 point 9). Formatting only: the amounts are never rounded or converted.

/** `amountMinor` in the currency's own decimals, formatted for the locale. */
export function formatMoney(amountMinor: number, currency: string, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: "currency", currency });
  return format.format(amountMinor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
}

export const formatWhen = (epoch: number, locale: string): string => new Date(epoch).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

/** Region of the browser language (`es-ES` -> ES), or null. Never a default country (ADR 86 point 15, B5). */
export function browserCountry(language: string | undefined): string | null {
  try {
    const region = language ? new Intl.Locale(language).region : undefined;
    return region && /^[A-Z]{2}$/.test(region) ? region : null;
  } catch {
    return null;
  }
}
