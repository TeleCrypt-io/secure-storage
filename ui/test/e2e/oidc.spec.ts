import { test, expect } from "@playwright/test";
import { registerE2eUser } from "./testUsers";
import { createFolder } from "./uiHelpers";

// Real authorization-code + PKCE flow against the local disposable MAS (see
// throwaway_synapse/up.sh, docs/DECISIONS.md D6): the UI redirects to MAS's
// actual login + consent pages (driven here for real, no mocks), MAS
// redirects back with ?code&state, the UI exchanges it and lands logged in.
// Mirrors the CLI's device-code flow tested in test/functional/oidc.test.ts,
// but this is the one PKCE test that actually exercises the browser
// redirect round-trip, which the CLI's flow never does.
test("OIDC/MAS login: authorization-code + PKCE round trip through the real MAS login UI", async ({
  page,
}) => {
  const user = await registerE2eUser("e2e_oidc");

  await page.goto("/");
  await page.getByTestId("oidc-login").click();

  // Redirected to MAS's real login page.
  await page.waitForURL(/localhost:8082/, { timeout: 20000 });
  await page.getByLabel("Username").fill(user.localpart);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Continue" }).click();

  // First-time login for a brand-new dynamically-registered client shows a
  // consent screen ("Give access to your account?") — approve it.
  const consentCheckbox = page.locator('input[type="checkbox"]');
  if (await consentCheckbox.isVisible({ timeout: 5000 }).catch(() => false)) {
    await consentCheckbox.check();
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // Redirected back to the app, logged in.
  await expect(page.getByTestId("current-user")).toHaveText(user.userId, { timeout: 20000 });

  // Prove the OIDC-sourced token is a genuinely usable, fully-functional
  // storage session, not just "whoami succeeded".
  await createFolder(page, "OIDC Folder");
});
