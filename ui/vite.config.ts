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
});
