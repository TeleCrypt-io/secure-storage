import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { E2eUser } from "./testUsers";

export async function loginViaUI(page: Page, user: E2eUser): Promise<void> {
  await page.goto("/");
  await page.getByTestId("username").fill(user.localpart);
  await page.getByTestId("password").fill(user.password);
  await page.getByTestId("submit").click();
  await expect(page.getByTestId("current-user")).toHaveText(user.userId, { timeout: 20000 });
}

export async function createFolder(page: Page, name: string): Promise<string> {
  await page.getByTestId("nav-folders").click();
  await page.getByTestId("new-folder-name").fill(name);
  await page.getByTestId("create-folder").click();
  const item = page.locator('[data-testid="folder-item"]', { hasText: name });
  await expect(item).toBeVisible({ timeout: 20000 });
  const folderId = await item.getAttribute("data-folder-id");
  if (!folderId) throw new Error(`folder item for "${name}" has no data-folder-id`);
  return folderId;
}

export async function openFolderByName(page: Page, name: string): Promise<void> {
  await page.getByText(name, { exact: true }).click();
  await expect(page.getByTestId("folder-detail")).toBeVisible();
}

/** userB's side: paste a folderId shared by userA and join it — mirrors
 * `telecrypt-io storage folder join`. The folder only becomes usable (files
 * visible) locally once the room is actually joined. */
export async function joinFolder(page: Page, folderId: string): Promise<void> {
  await page.getByTestId("nav-folders").click();
  await page.getByTestId("join-folder-id").fill(folderId);
  await page.getByTestId("join-folder").click();
  await expect(page.locator(`[data-folder-id="${folderId}"]`)).toBeVisible({ timeout: 20000 });
}

export async function uploadFile(
  page: Page,
  name: string,
  mimeType: string,
  buffer: Buffer,
): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({ name, mimeType, buffer });
  await expect(page.locator('[data-testid="file-item"]', { hasText: name })).toBeVisible({
    timeout: 20000,
  });
}

/** Downloads a file whose name is already visible in the file list and
 * returns its bytes, for a byte-identical comparison against what was
 * uploaded. Retries the click: right after a share/upload, the first
 * download attempt can race the recipient's megolm-session delivery and
 * fail to decrypt even though the file is listed — a real async-settling
 * window, not something to paper over with a fixed sleep. */
export async function downloadFileBytes(page: Page, name: string): Promise<Buffer> {
  const row = page.locator('[data-testid="file-item"]', { hasText: name });
  const button = row.getByTestId("download-file");

  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 3000 }),
        button.click(),
      ]);
      const stream = await download.createReadStream();
      if (!stream) throw new Error("download had no stream");
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      return Buffer.concat(chunks);
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await page.waitForTimeout(500);
    }
  }
}
