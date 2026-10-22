import { useEffect, useState, useSyncExternalStore } from "react";

// Tiny query layer: every mutation bumps a version and active queries re-run. No cache library needed for the simulator.
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

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
export function useQueryState<T>(load: () => Promise<T>, deps: readonly unknown[] = []): { data: T | undefined; stale: boolean } {
  const v = useSyncExternalStore(subscribe, () => version);
  const [state, setState] = useState<{ data?: T; version: number }>({ version: -1 });
  useEffect(() => {
    let live = true;
    // A failed load keeps the previous data; the failure itself is shown elsewhere (e.g. the 401 notice).
    void load().then((d) => live && setState({ data: d, version: v }), () => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is recreated each render on purpose
  }, [v, ...deps]);
  return { data: state.data, stale: state.version !== v };
}

export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  return useQueryState(load, deps).data;
}
