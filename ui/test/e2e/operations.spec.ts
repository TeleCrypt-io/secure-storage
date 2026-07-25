import { test, expect } from "@playwright/test";
import { registerE2eUser } from "./testUsers";
import { createFolder, loginViaUI, openFolderByName, uploadFile } from "./uiHelpers";

test("rename and delete a file", async ({ page }) => {
  const user = await registerE2eUser("e2e_rename_file");
  await loginViaUI(page, user);
  await createFolder(page, "RenameTest");
  await openFolderByName(page, "RenameTest");

  const original = Buffer.from("rename me");
  await uploadFile(page, "old.txt", "text/plain", original);

  const row = page.locator('[data-testid="file-item"]', { hasText: "old.txt" });
  await row.getByTestId("rename-file").click();
  const input = page.getByTestId("rename-input");
  await input.fill("new.txt");
  await input.press("Enter");
  await expect(page.locator('[data-testid="file-item"]', { hasText: "new.txt" })).toBeVisible({
    timeout: 20000,
  });

  page.once("dialog", (d) => d.accept());
  await page.locator('[data-testid="file-item"]', { hasText: "new.txt" }).getByTestId("delete-file").click();
  await expect(page.getByTestId("no-files")).toBeVisible({ timeout: 20000 });
});

test("create subfolder, upload inside, rename and delete subfolder", async ({ page }) => {
  const user = await registerE2eUser("e2e_subfolder");
  await loginViaUI(page, user);
  await createFolder(page, "Parent");
  await openFolderByName(page, "Parent");

  await page.getByTestId("new-subfolder-name").fill("Child");
  await page.getByTestId("create-subfolder").click();
  await expect(page.locator('[data-testid="subfolder-item"]', { hasText: "Child" })).toBeVisible({
    timeout: 20000,
  });

  await page.locator('[data-testid="subfolder-item"]', { hasText: "Child" }).locator(".row-name-btn").click();
  await expect(page.getByTestId("folder-detail").getByRole("button", { name: "Child" })).toBeVisible();

  const bytes = Buffer.from("inside subfolder");
  await uploadFile(page, "inside.txt", "text/plain", bytes);

  await page.locator('[data-testid="breadcrumb-item"]', { hasText: "Parent" }).click();
  const subRow = page.locator('[data-testid="subfolder-item"]', { hasText: "Child" });
  await subRow.getByTestId("rename-subfolder").click();
  await page.getByTestId("rename-input").fill("Renamed");
  await page.getByTestId("rename-input").press("Enter");
  await expect(page.locator('[data-testid="subfolder-item"]', { hasText: "Renamed" })).toBeVisible({
    timeout: 20000,
  });

  page.once("dialog", (d) => d.accept());
  await page.locator('[data-testid="subfolder-item"]', { hasText: "Renamed" }).getByTestId("delete-subfolder").click();
  await expect(page.getByTestId("no-files")).toBeVisible({ timeout: 20000 });
});
