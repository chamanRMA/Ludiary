import { useEffect, useState, useSyncExternalStore } from "react";

// Tiny query layer: every mutation bumps a version and active queries re-run. No cache library needed for the simulator.
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Runs a mutation and refreshes every active query afterwards. */
export async function mutate<T>(action: Promise<T>): Promise<T> {
  const result = await action;
  version += 1;
  listeners.forEach((l) => l());
  return result;
}

/** Loads data from the API; `data` keeps the previous value while reloading (no flicker). */
export function useQuery<T>(load: () => Promise<T>, deps: readonly unknown[] = []): T | undefined {
  const v = useSyncExternalStore(subscribe, () => version);
  const [data, setData] = useState<T>();
  useEffect(() => {
    let live = true;
    void load().then((d) => live && setData(d));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load` is recreated each render on purpose
  }, [v, ...deps]);
  return data;
}
