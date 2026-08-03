import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// matrix-js-sdk (and its dependency matrix-encrypt-attachment) expect a Node-ish
// `Buffer`/`global` to exist. The browser has neither natively, so we polyfill:
// `global` -> `globalThis` at build/dev time, and `Buffer` via the `buffer`
// package (wired up as an actual global in src/main.tsx). Everything else in
// matrix-js-sdk resolves via its own "browser" package.json field, which Vite
// picks up automatically — no further Node polyfills needed.
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  resolve: {
    // Both the web app and the exact @telecrypt-io/storage dependency import
    // matrix-js-sdk. Without dedupe, Vite can bundle BOTH copies
    // and matrix-js-sdk's "single entrypoint" guard throws at runtime
    // ("Multiple matrix-js-sdk entrypoints detected!"), rendering a blank page.
    // This only surfaces in the production build, not the dev server — so the
    // Playwright E2E (which runs against `vite` dev) never caught it. Force a
    // single copy of these packages.
    dedupe: ["matrix-js-sdk", "matrix-encrypt-attachment", "oidc-client-ts"],
  },
});
