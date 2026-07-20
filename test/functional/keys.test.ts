import { describe, it, expect } from "vitest";
import { createClient } from "matrix-js-sdk";
import { registerTestUser } from "../harness/users";
import { createTestClient, stopTestClient } from "../harness/clients";
import { waitFor } from "../harness/waitFor";
import { SecureStorage } from "../../src/SecureStorage";
import { decodeRecoveryKey } from "matrix-js-sdk/src/crypto-api/recovery-key";

describe("key management", () => {
  it("5.1 bootstrapCrossSigning completes for a fresh user", async () => {
    const user = await registerTestUser("key");
    const client = await createTestClient(user);
    try {
      const crypto = client.getCrypto()!;
      await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: async () => true,
      });

      const status = await crypto.getCrossSigningStatus();
      expect(status.privateKeysInSecretStorage).toBe(false);
    } finally {
      stopTestClient(client);
    }
  });

  it("5.2 bootstrapSecretStorage produces a recovery key", async () => {
    const user = await registerTestUser("key");

    let cachedPrivateKey: Uint8Array;

    const client = createClient({
      baseUrl: "http://localhost:8008",
      userId: user.userId,
      accessToken: user.accessToken,
      deviceId: user.deviceId,
      cryptoCallbacks: {
        getSecretStorageKey: async ({ keys }) => {
          const keyId = Object.keys(keys)[0];
          return [keyId, cachedPrivateKey];
        },
        cacheSecretStorageKey: async () => {},
      },
    });
    await client.initRustCrypto({ useIndexedDB: false });
    await client.startClient({ initialSyncLimit: 10 });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("sync timeout")), 15000);
      client.once("sync", (state: string) => {
        clearTimeout(timeout);
        if (state === "PREPARED" || state === "SYNCING") resolve();
        else reject(new Error(`unexpected sync state: ${state}`));
      });
    });

    try {
      const crypto = client.getCrypto()!;
      await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: async () => true,
      });

      const generatedKey = await crypto.createRecoveryKeyFromPassphrase();
      expect(generatedKey.encodedPrivateKey).toBeTruthy();
      expect(typeof generatedKey.encodedPrivateKey).toBe("string");

      cachedPrivateKey = generatedKey.privateKey;

      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => generatedKey,
        setupNewSecretStorage: true,
      });

      const status = await crypto.getSecretStorageStatus();
      expect(status.ready).toBe(true);
    } finally {
      stopTestClient(client);
    }
  });

  it("5.3 recovery key can be decoded", async () => {
    const user = await registerTestUser("key");
    const client = await createTestClient(user);
    try {
      const crypto = client.getCrypto()!;
      await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: async () => true,
      });

      const generatedKey = await crypto.createRecoveryKeyFromPassphrase();
      expect(generatedKey.encodedPrivateKey).toBeTruthy();

      // Decode the recovery key and verify it produces 32 bytes
      const privateKey = decodeRecoveryKey(generatedKey.encodedPrivateKey!);
      expect(privateKey.byteLength).toBe(32);
    } finally {
      stopTestClient(client);
    }
  });

  it("5.4 cross-signing + secret storage bootstrap succeeds end-to-end", async () => {
    const user = await registerTestUser("key");

    let cachedPrivateKey: Uint8Array;

    const client = createClient({
      baseUrl: "http://localhost:8008",
      userId: user.userId,
      accessToken: user.accessToken,
      deviceId: user.deviceId,
      cryptoCallbacks: {
        getSecretStorageKey: async ({ keys }) => {
          const keyId = Object.keys(keys)[0];
          return [keyId, cachedPrivateKey];
        },
        cacheSecretStorageKey: async () => {},
      },
    });
    await client.initRustCrypto({ useIndexedDB: false });
    await client.startClient({ initialSyncLimit: 10 });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("sync timeout")), 15000);
      client.once("sync", (state: string) => {
        clearTimeout(timeout);
        if (state === "PREPARED" || state === "SYNCING") resolve();
        else reject(new Error(`unexpected sync state: ${state}`));
      });
    });

    try {
      const crypto = client.getCrypto()!;
      await crypto.bootstrapCrossSigning({
        authUploadDeviceSigningKeys: async () => true,
      });

      const generatedKey = await crypto.createRecoveryKeyFromPassphrase();
      cachedPrivateKey = generatedKey.privateKey;

      await crypto.bootstrapSecretStorage({
        createSecretStorageKey: async () => generatedKey,
        setupNewSecretStorage: true,
      });

      const status = await crypto.getSecretStorageStatus();
      expect(status.ready).toBe(true);

      // After bootstrap, cross-signing private keys should be in secret storage
      const csStatus = await crypto.getCrossSigningStatus();
      expect(csStatus.privateKeysInSecretStorage).toBe(true);
    } finally {
      stopTestClient(client);
    }
  });
});
