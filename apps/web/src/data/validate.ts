import type { WizardFieldDto } from "@ludiary/api-contract";

/** Format-only checks (ADR 68). The real check (a test call) belongs to the server. */
export type FieldCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too-long" | "format" };

/** Pulls the useful part out of a pasted JSON or URL (ADR 43). Falls back to the raw text. */
export function extractValue(raw: string, extract: WizardFieldDto["extract"]): string {
  if (!extract) return raw;
  const sep = extract.indexOf(":");
  const kind = extract.slice(0, sep);
  const name = extract.slice(sep + 1);
  try {
    if (kind === "json-field") {
      const field = (JSON.parse(raw) as Record<string, unknown>)[name];
      return typeof field === "string" ? field : raw;
    }
    if (kind === "url-query") return new URL(raw).searchParams.get(name) ?? raw;
  } catch {
    /* not JSON / not a URL: the user may have pasted the bare value */
  }
  return raw;
}

/** Trim, length, extract, then pattern. Never logs the value. */
export function validateField(
  raw: string,
  field: Pick<WizardFieldDto, "pattern" | "maxLength" | "extract">,
): FieldCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > field.maxLength) return { ok: false, reason: "too-long" };
  const value = extractValue(trimmed, field.extract).trim();
  if (field.pattern !== undefined) {
    let matches = false;
    try {
      matches = new RegExp(field.pattern).test(value);
    } catch {
      matches = false;
    }
    if (!matches) return { ok: false, reason: "format" };
  }
  return { ok: true, value };
}

/** Only https links are opened, even if the server sends another scheme (ADR 68). */
export function safeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
