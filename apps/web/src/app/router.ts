import { useSyncExternalStore } from "react";

// Own router (ADR 68): History API, `:param` patterns, no nesting, no data loading.

export type Params = Record<string, string>;

const segments = (path: string): string[] => path.split("/").filter(Boolean);

/** Returns the params when `path` matches `pattern` (`/game/:id`), else null. Trailing slashes are ignored. */
export function matchRoute(pattern: string, path: string): Params | null {
  const want = segments(pattern);
  const have = segments(path);
  if (want.length !== have.length) return null;
  const params: Params = {};
  for (const [i, part] of want.entries()) {
    const value = have[i] as string;
    if (part.startsWith(":")) {
      try {
        params[part.slice(1)] = decodeURIComponent(value);
      } catch {
        return null; // malformed % escape
      }
    } else if (part !== value) return null;
  }
  return params;
}

export interface Location {
  path: string;
  search: string;
}

const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());
if (typeof window !== "undefined") window.addEventListener("popstate", notify); // guarded: unit tests run in Node

// useSyncExternalStore needs a stable snapshot: the pair is compared by its string form.
let snapshot: Location = { path: "", search: "" };
function read(): Location {
  if (snapshot.path !== location.pathname || snapshot.search !== location.search) {
    snapshot = { path: location.pathname, search: location.search };
  }
  return snapshot;
}

export function useLocation(): Location {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
  );
}

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState(null, "", to);
  else history.pushState(null, "", to);
  notify();
  window.scrollTo(0, 0);
  // ADR 37: focus the page heading after a navigation so keyboard and screen reader users land on the new page.
  requestAnimationFrame(() => document.querySelector<HTMLElement>("h1")?.focus());
}
