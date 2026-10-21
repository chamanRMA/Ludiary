import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// ADR 68: same policy the server will send later, so `vite preview` surfaces violations.
const csp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  // ADR 71: Steam covers load straight from Steam's CDN (union of connector mediaHosts).
  "img-src 'self' data: https://shared.akamai.steamstatic.com https://shared.cloudflare.steamstatic.com https://shared.steamstatic.com",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", strictPort: true },
  preview: { host: "127.0.0.1", headers: { "Content-Security-Policy": csp, "Referrer-Policy": "no-referrer" } },
});
