import { defineConfig, devices } from "@playwright/test";

// E2E: real disposable Synapse (podman), real crypto, real browser — no
// mocks. See docs/UI_SPEC.md. Starts both the Vite dev server and Synapse
// itself so `npm run e2e` is a single self-contained command.
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npx vite --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "bash ../throwaway_synapse/up.sh",
      url: "http://localhost:8008/_matrix/client/versions",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
