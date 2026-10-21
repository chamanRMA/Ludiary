import { readRuntimeInfo } from "./files";

export interface HealthInfo {
  app: string;
  version: string;
  pid: number;
}

export interface RunningServer extends HealthInfo {
  port: number;
}

/** Asks 127.0.0.1:port who is there (ADR 28). Returns null for "nothing" or "another program". */
export async function probeHealth(port: number, appId: string, timeoutMs = 1500): Promise<HealthInfo | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<HealthInfo>;
    if (body.app !== appId.toLowerCase() || typeof body.pid !== "number") return null;
    return { app: body.app, version: String(body.version), pid: body.pid };
  } catch {
    return null;
  }
}

/** Single-instance check (ADR 26, 28): runtime.json says where to look, the health answer says who is there. */
export async function findRunningServer(dataDir: string, appId: string): Promise<RunningServer | null> {
  const info = readRuntimeInfo(dataDir);
  if (!info) return null;
  const health = await probeHealth(info.port, appId);
  if (!health) return null;
  if (info.pid !== null && info.pid !== health.pid) return null; // stale file, port reused by another instance
  return { ...health, port: info.port };
}
