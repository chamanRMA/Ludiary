// ADR 90 point 18, B2/B3: every version that comes from the network or from a file is validated before it builds a path or an argument.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
export const MAX_VERSION_LENGTH = 32;

export const isVersion = (v: unknown): v is string => typeof v === "string" && v.length <= MAX_VERSION_LENGTH && SEMVER.test(v);

/** Negative, zero or positive like a comparator; both arguments must already satisfy isVersion. */
export function compareVersions(a: string, b: string): number {
  const x = SEMVER.exec(a)!.slice(1).map(Number);
  const y = SEMVER.exec(b)!.slice(1).map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return 0;
}
