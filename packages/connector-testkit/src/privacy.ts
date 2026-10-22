// Fixture privacy check (ADR 48, extended by ADR 72). Pure: callers read the files.

export interface PrivacyViolation {
  file: string;
  rule: string;
  line: number;
}

/** ADR 74 point 10: the only fictional values fixtures may carry. Anything else of the same shape is rejected. */
export const FICTIONAL_STEAM_ID = "76561190000000000";
export const FICTIONAL_API_KEY = "0123456789abcdef0123456789abcdef";
/** ADR 77 point 10: the fictional GOG session values fixtures may carry. */
export const FICTIONAL_GOG_VALUES = [
  "gog-test-auth-code-0001",
  "gog-test-access-token",
  "gog-test-refresh-token",
  "gog-test-refresh-token-2",
] as const;
const ALLOWED = [
  new RegExp(`(?<!\\d)${FICTIONAL_STEAM_ID}(?!\\d)`, "g"),
  new RegExp(`(?<![0-9A-Za-z])${FICTIONAL_API_KEY}(?![0-9A-Za-z])`, "g"),
  ...FICTIONAL_GOG_VALUES.map((v) => new RegExp(`(?<![0-9A-Za-z-])${v}(?![0-9A-Za-z-])`, "g")),
];

const RULES: readonly { rule: string; re: RegExp }[] = [
  { rule: "SteamID64", re: /7656119\d{10}/ },
  { rule: "32-hex key", re: /(?<![0-9A-Za-z])[0-9A-Fa-f]{32}(?![0-9A-Za-z])/ },
  { rule: "LastOwner", re: /LastOwner/i },
  { rule: "user profile path", re: /[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)/i },
  { rule: "email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/ },
  { rule: "credential field", re: /["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|authorization)["']?\s*[:=]\s*["']?[^\s"',}{]{6,}/i },
  { rule: "bearer/JWT token", re: /(?:Bearer\s+[A-Za-z0-9._-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/ },
];

export function findPrivacyViolations(files: readonly { path: string; content: string }[]): PrivacyViolation[] {
  const out: PrivacyViolation[] = [];
  for (const f of files) {
    const lines = f.content.split(/\r?\n/);
    lines.forEach((raw, i) => {
      const text = ALLOWED.reduce((t, re) => t.replace(re, ""), raw);
      for (const { rule, re } of RULES) if (re.test(text)) out.push({ file: f.path, rule, line: i + 1 });
    });
  }
  return out;
}
