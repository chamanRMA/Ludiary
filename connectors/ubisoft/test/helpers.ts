// Invented values and hand-made bytes (ADR 80, point 13). Nothing here comes from a real cache or answer.
import { memoryFiles } from "@ludiary/connector-testkit";
import { syncContext, fakeHttp } from "@ludiary/connector-testkit";
import type { ResolvedLocation } from "@ludiary/contracts";

export const REMEMBER = "ubisoft-test-remember-me-ticket-" + "a".repeat(40);
export const REMEMBER_2 = "ubisoft-test-remember-me-ticket-2-" + "b".repeat(40);
export const TICKET = "ubisoft-test-ticket-" + "c".repeat(48) + "+/=";
export const SESSION_ID = "00000000-0000-4000-8000-000000000001";
export const NAME = "TestUser";
export const space = (n: number): string => `00000000-0000-4000-8000-0000000000a${n}`;
export const CACHE_DIR = "C:\\Cache\\configuration";

export const varint = (n: number): number[] => {
  const out: number[] = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v % 0x80) | 0x80);
    v = Math.floor(v / 0x80);
  }
  out.push(v);
  return out;
};
export const lenField = (num: number, payload: Uint8Array | number[]): number[] => [...varint(num * 8 + 2), ...varint(payload.length), ...payload];
export const varField = (num: number, v: number): number[] => [...varint(num * 8), ...varint(v)];
const enc = (s: string): number[] => [...new TextEncoder().encode(s)];

export const yamlFor = (o: { space?: string; ulc?: boolean; start?: boolean; thumb?: string; localized?: Record<string, string> }): string =>
  [
    "version: 2.0",
    "root:",
    ...(o.space ? [`  space_id: ${o.space}`] : []),
    ...(o.ulc ? ["  is_ulc: true"] : []),
    ...(o.start === false ? [] : ["  start_game:", "    online:", "      executables:", "        - path: {relative: game.exe}"]),
    ...(o.thumb ? [`  thumb_image: ${o.thumb}`] : []),
    ...(o.localized ? ["localizations:", "  default:", ...Object.entries(o.localized).map(([k, v]) => `    ${k}: ${v}`)] : []),
  ].join("\n");

export const record = (id: number, yaml: string, id2 = id): number[] => lenField(1, [...varField(1, id), ...varField(2, id2), ...lenField(3, enc(yaml))]);
export const file = (...records: number[][]): Uint8Array => Uint8Array.from(records.flat());

export const LOCATION: ResolvedLocation = { declarationId: "ubisoft-cache", path: CACHE_DIR };

export function libraryContext(opts: {
  bytes?: Uint8Array | null;
  http?: ReturnType<typeof fakeHttp>;
  secrets?: Record<string, string>;
  noFs?: boolean;
  locations?: ResolvedLocation[];
}) {
  const base = syncContext({ http: opts.http ?? fakeHttp(() => ({ status: 500 })), secrets: opts.secrets ?? { rememberMeTicket: REMEMBER } });
  const cfg = CACHE_DIR + "\\configurations";
  const files = memoryFiles(opts.bytes ? { [cfg]: opts.bytes } : { [CACHE_DIR + "\\"]: "" }, { roots: [CACHE_DIR] });
  return { ...base, ...(opts.noFs ? {} : { fs: files }), libraryLocations: opts.locations ?? [LOCATION], files };
}
