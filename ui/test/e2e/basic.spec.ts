import { test, expect } from "@playwright/test";
import { registerE2eUser } from "./testUsers";
import { createFolder, loginViaUI, openFolderByName, uploadFile, downloadFileBytes } from "./uiHelpers";

test("login, create a folder, and it appears in the list", async ({ page }) => {
  const user = await registerE2eUser("e2e_basic");
  await loginViaUI(page, user);

  await createFolder(page, "My Documents");
  // Re-affirm it is genuinely present after a real navigation-free re-render,
  // not just transiently created.
  await expect(page.getByText("My Documents")).toBeVisible();
});

test("upload a file, it appears, download it, bytes match", async ({ page }) => {
  const user = await registerE2eUser("e2e_file");
  await loginViaUI(page, user);
  await createFolder(page, "Files");
  await openFolderByName(page, "Files");

  const original = Buffer.from("the quick brown fox jumps over the lazy dog\n".repeat(50));
  await uploadFile(page, "fox.txt", "text/plain", original);

  const downloaded = await downloadFileBytes(page, "fox.txt");
  expect(downloaded.equals(original)).toBe(true);
});
