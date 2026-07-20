import { createClient, MatrixClient } from "matrix-js-sdk";
import { TestUser } from "./users";

export async function createTestClient(user: TestUser): Promise<MatrixClient> {
  const client = createClient({
    baseUrl: "http://localhost:8008",
    userId: user.userId,
    accessToken: user.accessToken,
    deviceId: user.deviceId,
  });

  await client.initRustCrypto({ useIndexedDB: false });
  await client.startClient({ initialSyncLimit: 10 });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("sync timeout")),
      15000,
    );

    client.once("sync", (state: string) => {
      clearTimeout(timeout);
      if (state === "PREPARED" || state === "SYNCING") {
        resolve();
      } else {
        reject(new Error(`unexpected sync state: ${state}`));
      }
    });
  });

  return client;
}

export async function stopTestClient(client: MatrixClient): Promise<void> {
  client.stopClient();
}
