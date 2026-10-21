// Fixture privacy check (ADR 48, extended by ADR 72). Pure: callers read the files.

export interface PrivacyViolation {
  file: string;
  rule: string;
  line: number;
}

const RULES: readonly { rule: string; re: RegExp }[] = [
  { rule: "SteamID64", re: /7656119\d{10}/ },
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
    lines.forEach((text, i) => {
      for (const { rule, re } of RULES) if (re.test(text)) out.push({ file: f.path, rule, line: i + 1 });
    });
  }
  return out;
}
