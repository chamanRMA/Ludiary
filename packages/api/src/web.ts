/** A file of the SPA, loaded once into memory by the runtime (ADR 72, point 6). */
export interface WebAsset {
  body: string | Uint8Array;
  /** Content-Type. */
  type: string;
  /** Defaults to true under /assets/ and false elsewhere. */
  immutable?: boolean;
}

export type WebAssets = ReadonlyMap<string, WebAsset>;

const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

/** ADR 68, 71. Throws on a host that is not a bare host name: it would end up inside a header. */
export function spaCsp(mediaHosts: readonly string[]): string {
  const hosts = [...new Set(mediaHosts)];
  for (const h of hosts) if (!HOST_RE.test(h)) throw new Error(`invalid media host: ${JSON.stringify(h)}`);
  const img = ["'self'", "data:", ...hosts.map((h) => `https://${h}`)].join(" ");
  return (
    "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; " +
    `img-src ${img}; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  );
}

/** ADR 67, 72. Page served by /open and /open.js. */
export const OPEN_CSP = "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Script that stores the origin key and leaves /open (so the URL is not kept in the history). */
export function openScript(appId: string): string {
  const id = appId.toLowerCase();
  const selector = `meta[name="${id}-origin-key"]`;
  return (
    `(function(){var m=document.querySelector(${JSON.stringify(selector)});` +
    `var k=m&&m.getAttribute("content");if(!k)return;` +
    `try{localStorage.setItem(${JSON.stringify(`${id}.originKey`)},k);}catch(e){return;}` +
    `location.replace("/");})();
`
  );
}
