import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ADR 68: same policy the server will send later, so `vite preview` surfaces violations.
const csp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  // ADR 71, 86 point 17: images load straight from the stores' CDNs and the price service's (union of the mediaHosts of connectors and services).
  "img-src 'self' data: https://app-images.ea.com https://assets.isthereanydeal.com https://cdn1.epicgames.com https://cdn2.unrealengine.com https://dbxce1spal1df.cloudfront.net https://drop-assets.ea.com https://images.gog.com https://shared.akamai.steamstatic.com https://shared.cloudflare.steamstatic.com https://shared.steamstatic.com https://static3.cdn.ubi.com",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

// ADR 72: `--mode simulator` (scripts `dev` and `preview`) turns the whole app into the simulator; the
// normal `vite build` (mode production) never does. The value is folded at build time, so a production
// bundle has `isSimulated === false`. A .env file is not used: `.env.*` is git-ignored.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: { "import.meta.env.VITE_LUDIARY_SIMULATOR": JSON.stringify(mode === "simulator" ? "1" : "") },
  server: { host: "127.0.0.1", strictPort: true },
  preview: { host: "127.0.0.1", headers: { "Content-Security-Policy": csp, "Referrer-Policy": "no-referrer" } },
}));
