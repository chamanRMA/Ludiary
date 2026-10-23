import type { WizardFieldDto } from "@ludiary/api-contract";

/** Format-only checks (ADR 68). The real check (a test call) belongs to the server. */
export type FieldCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "too-long" | "format" };

/** Pulls the useful part out of a pasted JSON or URL (ADR 43). Falls back to the raw text. */
export function extractValue(raw: string, extract: WizardFieldDto["extract"]): string | null {
  if (!extract) return raw;
  const sep = extract.indexOf(":");
  const kind = extract.slice(0, sep);
  const name = extract.slice(sep + 1);
  try {
    if (kind === "json-field") {
      return pickJsonField(raw, name);
    }
    // ADR 77 audit M1: a pasted address must be an address with the parameter; never echo the text back.
    if (kind === "url-query") return new URL(raw).searchParams.get(name);
  } catch {
    return null;
  }
  return raw;
}

/** ADR 78 point 7 (same rule as the core): JSON, else the part between "{" and "}", else the bare value. */
function pickJsonField(text: string, name: string): string | null {
  const field = (o: unknown): string | null => {
    const v = o !== null && typeof o === "object" ? (o as Record<string, unknown>)[name] : undefined;
    return typeof v === "string" ? v : null;
  };
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string") return parsed; // a quoted value is a bare value
    if (parsed !== null && typeof parsed === "object") return field(parsed); // any other JSON (a number) falls through
  } catch {
    /* not JSON: try the braces, then the bare value */
  }
  const open = text.indexOf("{");
  if (open === -1) return text.replace(/^["']|["']$/g, "");
  try {
    return field(JSON.parse(text.slice(open, text.lastIndexOf("}") + 1)));
  } catch {
    return null;
  }
}

/** Values to send: for fields with `extract`, only the extracted and validated value, never the pasted text. */
export function valuesToSend(
  fields: readonly (Pick<WizardFieldDto, "name" | "pattern" | "maxLength" | "extract">)[],
  values: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const raw = values[f.name] ?? "";
    const r = f.extract ? validateField(raw, f) : null;
    out[f.name] = r ? (r.ok ? r.value : "") : raw; // never the pasted text when extract fails
  }
  return out;
}

/** Trim, length, extract, then pattern. Never logs the value. */
export function validateField(
  raw: string,
  field: Pick<WizardFieldDto, "pattern" | "maxLength" | "extract">,
): FieldCheck {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (trimmed.length > field.maxLength) return { ok: false, reason: "too-long" };
  const extracted = extractValue(trimmed, field.extract);
  if (extracted === null) return { ok: false, reason: "format" };
  const value = extracted.trim();
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
