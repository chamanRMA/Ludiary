/**
 * Splits an argument string with the rules of CommandLineToArgvW / the Microsoft CRT (ADR 76).
 * Whitespace (space, tab) separates outside quotes; 2n backslashes + `"` give n backslashes and toggle quoting;
 * 2n+1 backslashes + `"` give n backslashes and a literal quote; other backslashes are literal;
 * inside quotes, `""` is a literal quote.
 */
export function splitWindowsArgs(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let started = false;
  let inQuote = false;
  let slashes = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === "\\") {
      slashes++;
      started = true;
      continue;
    }
    if (ch === '"') {
      cur += "\\".repeat(slashes >> 1);
      started = true;
      if (slashes & 1) cur += '"';
      else if (inQuote && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuote = !inQuote;
      slashes = 0;
      continue;
    }
    cur += "\\".repeat(slashes);
    slashes = 0;
    if ((ch === " " || ch === "\t") && !inQuote) {
      if (started) out.push(cur);
      cur = "";
      started = false;
    } else {
      cur += ch;
      started = true;
    }
  }
  cur += "\\".repeat(slashes);
  if (started) out.push(cur);
  return out;
}
