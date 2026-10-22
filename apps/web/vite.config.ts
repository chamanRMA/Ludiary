import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ADR 68: same policy the server will send later, so `vite preview` surfaces violations.
const csp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  // ADR 71: covers load straight from the stores' CDNs (union of connector mediaHosts).
  "img-src 'self' data: https://cdn1.epicgames.com https://cdn2.unrealengine.com https://images.gog.com https://shared.akamai.steamstatic.com https://shared.cloudflare.steamstatic.com https://shared.steamstatic.com",
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
