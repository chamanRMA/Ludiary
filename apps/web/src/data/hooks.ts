import { useEffect, useState, useSyncExternalStore } from "react";

// Tiny query layer: every mutation bumps a version and active queries re-run. No cache library needed for the simulator.
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// ADR 89 point 6.5: after a restoration the server is gone. From then on no query loads and the app shows the restart screen.
let restarting = false;
export function setRestarting(): void {
  restarting = true;
  version += 1;
  listeners.forEach((l) => l());
}
export const useRestarting = (): boolean => useSyncExternalStore(subscribe, () => restarting);

/** Re-runs every active query (used while a background sync is running). */
export function refresh(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Runs a mutation and refreshes every active query afterwards. */
export async function mutate<T>(action: Promise<T>): Promise<T> {
  const result = await action;
  refresh();
  return result;
}

/**
 * Loads data from the API; `data` keeps the previous value while reloading (no flicker).
 * `stale` is true until the load started after the latest mutation finishes: decisions such as redirects must wait for it.
 */
export function useQueryState<T>(load: () => Promise<T>, deps: readonly unknown[] = []): { data: T | undefined; stale: boolean; error: unknown } {
  const v = useSyncExternalStore(subscribe, () => version);
  const [state, setState] = useState<QueryState<T>>({ version: -1 });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is recreated each render on purpose
  useEffect(() => startLoad(load, v, setState), [v, ...deps]);
  return { data: state.data, stale: state.version !== v, error: state.error };
}

export interface QueryState<T> {
  data?: T;
  version: number;
  error?: unknown;
}

/** Runs one load. A failure keeps the previous data and exposes the error (the 401 case also shows its own notice). Returns the cancel function. */
export function startLoad<T>(load: () => Promise<T>, v: number, setState: (update: (prev: QueryState<T>) => QueryState<T>) => void): () => void {
  if (restarting) return () => {};
  let live = true;
  void load().then(
    (data) => live && setState(() => ({ data, version: v })),
    (error: unknown) => live && setState((prev) => ({ ...prev, error })),
  );
  return () => {
    live = false;
  };
}

export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  return useQueryState(load, deps).data;
}
