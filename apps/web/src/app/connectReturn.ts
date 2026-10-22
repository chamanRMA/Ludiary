// OpenID return of the Steam wizard (ADR 74 point 3). Pure helpers, so they can be tested without a browser.

export const RETURN_PATH = "/connect/return";
/** sessionStorage key: where to go back to after the wizard. Holds only one of the two words below, no Steam data. */
export const WIZARD_RETURN_KEY = "ludiary.wizardReturn";

/** Only `openid.*` parameters leave the page (at most 32, the server limit); `w` and anything else stay behind. */
export function openIdQuery(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(search)) {
    if (k.startsWith("openid.") && Object.keys(out).length < 32) out[k] = v;
  }
  return out;
}

export type ReturnTo = "welcome" | "settings";

/** Closed list; anything else (missing, tampered) means Settings. */
export const parseReturnTo = (raw: string | null): ReturnTo => (raw === "welcome" ? "welcome" : "settings");

export const returnPath = (to: ReturnTo): string => (to === "welcome" ? "/welcome?step=stores" : "/settings/stores");

/**
 * Second barrier (the core is the first): the stored wizard id must equal the page's `w` and, when Steam echoes it,
 * the `w` inside `openid.return_to`. Nothing is sent otherwise.
 */
export function matchesWizard(search: string, stored: string | null): boolean {
  if (!stored) return false;
  const params = new URLSearchParams(search);
  if (params.get("w") !== stored) return false;
  const returnTo = params.get("openid.return_to");
  if (returnTo === null) return true; // a cancelled login carries no return_to
  try {
    return new URL(returnTo).searchParams.get("w") === stored;
  } catch {
    return false;
  }
}

/** Reads the query and wipes it from the address bar before anything else happens. `null`: the wizard id does not match. */
export function takeReturnQuery(stored: string | null): Record<string, string> | null {
  const query = matchesWizard(location.search, stored) ? openIdQuery(location.search) : null;
  history.replaceState(null, "", RETURN_PATH);
  return query;
}
