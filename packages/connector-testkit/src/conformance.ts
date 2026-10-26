// Reusable conformance check (ADR 72). Framework-free: returns problems, or throws with all of them.
import {
  ConnectorError,
  checkConnectorManifest,
  type DiscoveryContext,
  type EntryMedia,
  type GameAction,
  type LaunchContext,
  type LaunchSpec,
  type ScanContext,
  type SyncContext,
  type StoreConnector,
  type StoredProperty,
} from "@ludiary/contracts";
import { winKey } from "./memory-files";

export interface ConformanceOptions {
  /** Fresh contexts per call. */
  scan?: () => ScanContext;
  /** ADR 83: checks the DLC entries of listLibrary against the declared capability. */
  library?: () => SyncContext;
  discovery?: () => DiscoveryContext;
  launch?: {
    ctx: () => LaunchContext;
    /** Properties to resolve with every declared action. */
    properties: readonly StoredProperty[];
  };
  /** If given, nameKey and every messageKey seen must exist in both languages. */
  catalogs?: { es: Readonly<Record<string, string>>; en: Readonly<Record<string, string>> };
}

export const HOSTILE_IDS: readonly string[] = [
  "",
  " ",
  "12 34",
  "1; calc.exe",
  "1&&calc",
  "../../x",
  "steam://run/1",
  "-applaunch 1",
  "1\n2",
  "%41",
  "9".repeat(5000),
  '"quoted"',
  "０１２３", // full-width digits
];

const MAX_ID = 256;
const MAX_TITLE = 1000;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const ALL_ACTIONS: readonly GameAction[] = ["play", "open-store-page", "install"];

function inside(path: string, root: string): boolean {
  const p = winKey(path);
  const r = winKey(root);
  return p === r || p.startsWith(r.endsWith("\\") ? r : r + "\\");
}

function checkMedia(c: StoreConnector, m: EntryMedia | undefined, where: string, out: string[]): void {
  if (!m) return;
  for (const [k, v] of Object.entries(m)) {
    if (typeof v !== "string") continue;
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      out.push(`${where}: media.${k} is not a URL`);
      continue;
    }
    if (u.protocol !== "https:") out.push(`${where}: media.${k} is not https`);
    if (!c.mediaHosts.includes(u.hostname)) out.push(`${where}: media.${k} host '${u.hostname}' is not in mediaHosts`);
  }
}

function checkSpec(c: StoreConnector, spec: LaunchSpec | null, where: string, out: string[]): void {
  if (spec === null) return;
  const cap = c.capabilities;
  if (!cap.launchKinds.includes(spec.kind)) out.push(`${where}: launch kind '${spec.kind}' is not in launchKinds`);
  if (spec.kind === "uri") {
    const m = /^([a-z][a-z0-9+.-]*):/.exec(spec.uri);
    if (!m || !cap.uriSchemes.includes(m[1] as string)) out.push(`${where}: URI scheme is not in uriSchemes`);
    if (spec.uri.length > 2048 || !/^[\x21-\x7E]+$/.test(spec.uri) || spec.uri.includes('"') || /%(?![0-9A-Fa-f]{2})/.test(spec.uri)) {
      out.push(`${where}: URI has forbidden characters or is too long`);
    }
  } else {
    if (!/^([A-Za-z]:[\\/]|\\\\)/.test(spec.executable)) out.push(`${where}: executable is not absolute`);
    if (CONTROL.test(spec.executable) || spec.args.some((a) => CONTROL.test(a))) {
      out.push(`${where}: control characters in executable or args`);
    }
  }
}

export async function checkConnectorConformance(c: StoreConnector, opts: ConformanceOptions = {}): Promise<string[]> {
  const out: string[] = [...checkConnectorManifest(c)];
  const keys = new Set<string>([c.nameKey]);
  const note = (e: unknown, where: string): void => {
    if (!(e instanceof ConnectorError)) {
      out.push(`${where}: threw a non-ConnectorError (${e instanceof Error ? e.name : typeof e})`);
      return;
    }
    const k = e.details.messageKey;
    if (k !== undefined) {
      keys.add(k);
      if (!k.startsWith(`connectors.${c.id}.`) && !k.startsWith("connectors.common.")) {
        out.push(`${where}: messageKey '${k}' is outside connectors.${c.id}.* and connectors.common.*`);
      }
    }
  };

  for (const h of c.apiHosts) if (h.includes("/") || h.includes(":") || h !== h.toLowerCase()) out.push(`apiHosts: '${h}' has scheme, slash, port or upper case`);
  for (const h of c.mediaHosts) if (h.includes("/") || h.includes(":") || h !== h.toLowerCase()) out.push(`mediaHosts: '${h}' has scheme, slash, port or upper case`);
  for (const s of c.capabilities.uriSchemes) if (s !== s.toLowerCase() || s.includes(":")) out.push(`uriSchemes: '${s}' must be a lower-case scheme without ':'`);
  for (const a of c.capabilities.actions) if (!ALL_ACTIONS.includes(a)) out.push(`unknown action '${a}'`);

  if (opts.scan && c.scanInstalled) {
    const ctx = opts.scan();
    try {
      const r = await c.scanInstalled(ctx);
      r.entries.forEach((e, i) => {
        const w = `scan entry ${i}`;
        if (e.storeGameId !== undefined && (e.storeGameId === "" || e.storeGameId.length > MAX_ID)) out.push(`${w}: bad storeGameId`);
        if (e.title.trim() === "" || e.title.length > MAX_TITLE) out.push(`${w}: bad title`);
        if (!ctx.roots.some((root) => inside(e.installPath, root.path))) out.push(`${w}: installPath is outside every scan root`);
        if (e.kind === "dlc" && c.capabilities.dlc !== "scan" && c.capabilities.dlc !== "library-and-scan") out.push(`${w}: dlc entry but dlc capability is '${c.capabilities.dlc}'`);
        if (e.baseStoreGameId !== undefined && e.baseStoreGameId.length > MAX_ID) out.push(`${w}: bad baseStoreGameId`);
        for (const x of e.executables ?? []) if (/^([A-Za-z]:|[\\/])/.test(x) || x.split(/[\\/]/).includes("..")) out.push(`${w}: executable hint is not relative`);
        checkMedia(c, e.media, w, out);
      });
      for (const u of r.unreadableRoots) if (!ctx.roots.some((root) => root.path === u.root.path)) out.push("scan: unreadableRoots has a root not in the context");
    } catch (e) {
      note(e, "scanInstalled");
    }
  }

  if (opts.library && c.listLibrary) {
    try {
      const r = await c.listLibrary(opts.library());
      r.entries.forEach((e, i) => {
        if (e.kind === "dlc" && c.capabilities.dlc !== "library" && c.capabilities.dlc !== "library-and-scan") out.push(`library entry ${i}: dlc entry but dlc capability is '${c.capabilities.dlc}'`);
        if (e.baseStoreGameId !== undefined && e.baseStoreGameId.length > MAX_ID) out.push(`library entry ${i}: bad baseStoreGameId`);
      });
    } catch (e) {
      note(e, "listLibrary");
    }
  }

  if (opts.discovery && c.discoverRoots) {
    const ctx = opts.discovery();
    try {
      const roots = await c.discoverRoots(ctx);
      if (roots.length > 64) out.push("discoverRoots: more than 64 roots");
      for (const r of roots) {
        if (!/^([A-Za-z]:[\\/]|\\\\)/.test(r.path) || CONTROL.test(r.path)) out.push("discoverRoots: a root is not an absolute clean path");
        if (!c.locations.some((l) => l.id === r.declarationId)) out.push(`discoverRoots: unknown declarationId '${r.declarationId}'`);
      }
    } catch (e) {
      note(e, "discoverRoots");
    }
  }

  if (opts.launch) {
    const attempt = async (property: StoredProperty, action: GameAction, where: string, hostile: boolean): Promise<void> => {
      try {
        const spec = await c.resolveAction(property, action, opts.launch!.ctx());
        if (!c.capabilities.actions.includes(action) && spec !== null) out.push(`${where}: returned a spec for undeclared action '${action}'`);
        checkSpec(c, spec, where, out);
        if (hostile && spec !== null && JSON.stringify(spec).includes(property.storeGameId ?? "\u0000never")) {
          // A hostile id may only appear in a spec if the connector validated it; checkSpec already ran,
          // but a non-trivial id echoed into a spec is reported for review.
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(property.storeGameId ?? "")) out.push(`${where}: hostile id was echoed into the launch spec`);
        }
      } catch (e) {
        note(e, where);
      }
    };
    for (const p of opts.launch.properties) for (const a of ALL_ACTIONS) await attempt(p, a, `resolveAction(${a})`, false);
    for (const id of HOSTILE_IDS) {
      await attempt({ storeGameId: id, installed: true, installPath: null, launchData: null }, "play", `resolveAction(play, hostile id)`, true);
    }
  }

  if (opts.catalogs) {
    for (const k of keys) {
      if (!(k in opts.catalogs.es)) out.push(`catalog es is missing '${k}'`);
      if (!(k in opts.catalogs.en)) out.push(`catalog en is missing '${k}'`);
    }
  }
  return out;
}

export async function assertConnectorConformance(c: StoreConnector, opts: ConformanceOptions = {}): Promise<void> {
  const problems = await checkConnectorConformance(c, opts);
  if (problems.length > 0) throw new Error(`Connector '${c.id}' is not conformant:\n- ${problems.join("\n- ")}`);
}
