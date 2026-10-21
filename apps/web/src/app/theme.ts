import { useSyncExternalStore } from "react";

// Presentation preferences (ADR 68): permanent localStorage, not user data.
export type ThemePref = "system" | "light" | "dark";
const THEME_KEY = "ludiary.theme";
const SIDEBAR_KEY = "ludiary.sidebar";

const store = (): Storage | null => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((l) => l());
const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function getThemePref(): ThemePref {
  const v = store()?.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply(): void {
  const pref = getThemePref();
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function setThemePref(pref: ThemePref): void {
  store()?.setItem(THEME_KEY, pref);
  apply();
  notify();
}

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);

export const useThemePref = (): ThemePref => useSyncExternalStore(subscribe, getThemePref);

export const getSidebarCompact = (): boolean => store()?.getItem(SIDEBAR_KEY) === "compact";
export function setSidebarCompact(compact: boolean): void {
  store()?.setItem(SIDEBAR_KEY, compact ? "compact" : "expanded");
  notify();
}
export const useSidebarCompact = (): boolean => useSyncExternalStore(subscribe, getSidebarCompact);
