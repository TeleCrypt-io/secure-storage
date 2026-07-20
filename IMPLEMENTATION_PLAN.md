# Implementation Plan — TeleCrypt Secure Storage

**Read this whole file before writing any code.**

You are implementing a TypeScript client library for end-to-end-encrypted file storage on
Matrix. This document is self-contained: it assumes you have no prior context about this
project. Follow it step by step, in order. Do not skip ahead.

---

## 0. Ground rules

1. **Tests come first.** Every phase defines tests before implementation. Write the test,
   watch it fail, then write code until it passes. Do not write implementation code for a
   phase before that phase's tests exist.
2. **Never invent API calls.** If you are unsure whether a method exists, check the installed
   package under `node_modules/matrix-js-sdk/`. Do not guess method names.
3. **Do not modify files under `node_modules/`.**
4. **Never test against a production server.** Only the local Docker Synapse from Phase 0.
5. **If a step fails twice, stop and write the error into `BLOCKERS.md` with the exact command
   and output.** Do not improvise a workaround. Do not disable or skip a failing test to make
   the suite green.
6. **Commit after each phase passes**, with the message `Phase N: <short description>`.

### Definition of done for any phase
- All tests for that phase pass.
- No test is skipped, commented out, or marked `.todo`.
- `npm run lint` and `npm run build` both succeed.

---

## 1. What you are building

A library that lets a user store files in encrypted folders on a Matrix server, and share
those folders with other users.

The concepts map like this:

| File-system concept | Matrix concept |
|---|---|
| Folder / directory | A Matrix **Space** (a room marked as a file tree) |
| Subfolder | A child Space |
| File | A Matrix **event** in the space, pointing at uploaded encrypted content |
| File version | A newer event superseding the old one |
| Sharing | Inviting a Matrix user to the room |
| Permissions | Matrix power levels |

This design is called **MSC3089**. It is already implemented in the `matrix-js-sdk` package —
you are writing a friendlier wrapper around it, not implementing it from scratch.

**Encryption model:** file bytes are encrypted *before* upload. The server only ever stores an
opaque encrypted blob and never has the decryption key. This is non-negotiable — never send
unencrypted file bytes to the server in Phase 2 or later.

---

## 2. The API you will use

These are verified to exist in `matrix-js-sdk` v41. Use exactly these names.

### Getting a file tree

```ts
// Create a new top-level folder. Returns MSC3089TreeSpace.
const tree = await client.unstableCreateFileTree("My Folder");

// Get an existing one by room ID. Returns MSC3089TreeSpace | null.
const tree = client.unstableGetFileTreeSpace(roomId);
```

### `MSC3089TreeSpace` — a folder

```ts
tree.id                                   // string: the room ID
tree.isTopLevel                           // boolean
await tree.setName(name: string)
await tree.invite(userId: string, andSubspaces = true)
await tree.setPermissions(userId: string, role: TreePermissions)
tree.getPermissions(userId: string)       // returns TreePermissions
await tree.createDirectory(name: string)  // returns MSC3089TreeSpace (a subfolder)
tree.getDirectories()                     // returns MSC3089TreeSpace[]
tree.getDirectory(roomId: string)         // returns MSC3089TreeSpace | undefined
await tree.delete()
tree.getOrder()                           // number
await tree.setOrder(index: number)
tree.getFile(fileEventId: string)         // returns MSC3089Branch | null
tree.listFiles()                          // returns MSC3089Branch[]  (active files only)
tree.listAllFiles()                       // returns MSC3089Branch[]  (includes old versions)

await tree.createFile(
  name: string,
  encryptedContents: FileType,   // the ENCRYPTED bytes
  info: EncryptedFile,           // encryption metadata (key, iv, hashes)
  additionalContent?: IContent,
)                                // returns { event_id: string }
```

### `MSC3089Branch` — a file

```ts
branch.id                                 // string: the event ID
branch.isActive                           // boolean: false if deleted/superseded
branch.version                            // number
await branch.delete()
branch.getName()                          // string
await branch.setName(name: string)
branch.isLocked()                         // boolean
await branch.setLocked(locked: boolean)
await branch.getFileInfo()                // { info: EncryptedFile, httpUrl: string }  ⚠️ SEE §3
await branch.getFileEvent()               // returns MatrixEvent
await branch.getVersionHistory()          // returns MSC3089Branch[]
await branch.createNewVersion(name, encryptedContents, info, additionalContent?)
```

### `TreePermissions` (import from `matrix-js-sdk`)

```ts
enum TreePermissions {
  Viewer = "viewer",   // default
  Editor = "editor",   // ~power level 50
  Owner  = "owner",    // power level 100
}
```

### Encryption helpers (package: `matrix-encrypt-attachment`)

```ts
import { encryptAttachment, decryptAttachment } from "matrix-encrypt-attachment";

const encrypted = await encryptAttachment(data);   // data: ArrayBuffer
// encrypted.data -> ArrayBuffer (ciphertext)
// encrypted.info -> EncryptedFile (key material + hashes)

const plaintext = await decryptAttachment(ciphertext, info);  // returns ArrayBuffer
```

**Upload pattern** (encrypt, then hand ciphertext to `createFile`):

```ts
const encrypted = await encryptAttachment(data);
const { event_id } = await tree.createFile(
  name,
  Buffer.from(encrypted.data),
  encrypted.info,
  { info: { mimetype, size } },
);
```

---

## 3. ⚠️ Known traps — read before Phase 2

These will cost you hours if you hit them without warning.

### TRAP 1: `getFileInfo().httpUrl` returns a URL that 404s

`MSC3089Branch.getFileInfo()` builds its URL with `client.mxcUrlToHttp(file["url"])` and
**omits the authentication flag**. That produces a legacy `/_matrix/media/v3/download/...`
URL. Modern Synapse (v1.139+) requires *authenticated* media and returns **404 Not Found**
for those URLs. This is a real gap in the upstream library, not a mistake on your part.

**Do not use `httpUrl` from `getFileInfo()`.** Download like this instead:

```ts
const { info } = await branch.getFileInfo();   // use `info` — it is correct
const mxcUrl = info.url;                       // e.g. "mxc://server/mediaid"

// 7th positional arg = useAuthentication
const url = client.mxcUrlToHttp(mxcUrl, undefined, undefined, undefined, false, true, true);

const res = await fetch(url!, {
  headers: { Authorization: `Bearer ${client.getAccessToken()}` },
});
if (!res.ok) throw new Error(`media download failed: ${res.status}`);
const ciphertext = await res.arrayBuffer();
const plaintext = await decryptAttachment(ciphertext, info);
```

If you see a **404 on media download**, this is almost certainly the cause.

### TRAP 2: Rate limiting will break the test suite
Synapse rate-limits registration and messaging by default. A test suite creating users and
sending many events *will* start failing with `M_LIMIT_EXCEEDED`. The Phase 0 config disables
rate limiting. If you see `M_LIMIT_EXCEEDED`, the config was not applied — fix the config, do
not add sleeps to the tests.

### TRAP 3: Two users are mandatory
Sharing, permissions, and revocation cannot be verified from one account. A test that checks
"user A shared with user B" by asking A is not a real test. Always verify from **B's own
client session**.

### TRAP 4: State propagation is not instant
After an action (invite, permission change, new file), the other client may not see it
immediately — it arrives via sync. Use the `waitFor` helper from Phase 0. Never use a bare
`sleep` with a fixed duration.

### TRAP 5: Encryption is not optional after Phase 2
From Phase 2 onward, file bytes must be encrypted before upload. If a test writes plaintext
to the server it is wrong, even if it passes.

---

## 4. Phase 0 — Test harness

**Goal:** a working test harness against a real, disposable Synapse. No library code yet.

### Step 0.1 — Project setup

Create `package.json`:

```json
{
  "name": "@telecrypt/secure-storage",
  "version": "0.1.0",
  "license": "BUSL-1.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src test --ext .ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "synapse:up": "docker compose -f docker/docker-compose.test.yml up -d --wait",
    "synapse:down": "docker compose -f docker/docker-compose.test.yml down -v"
  },
  "dependencies": {
    "matrix-js-sdk": "^41.9.0",
    "matrix-encrypt-attachment": "^1.0.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

Run `npm install`. **Verify:** it completes with no errors.

### Step 0.2 — Disposable Synapse

Create `docker/docker-compose.test.yml`:

```yaml
services:
  synapse:
    image: ghcr.io/element-hq/synapse:latest
    environment:
      SYNAPSE_SERVER_NAME: localhost
      SYNAPSE_REPORT_STATS: "no"
      SYNAPSE_ENABLE_REGISTRATION: "yes"
    volumes:
      - ./synapse-data:/data
    ports:
      - "8008:8008"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8008/health"]
      interval: 2s
      timeout: 5s
      retries: 30
```

Generate the config once:

```bash
docker run --rm -v "$PWD/docker/synapse-data:/data" \
  -e SYNAPSE_SERVER_NAME=localhost -e SYNAPSE_REPORT_STATS=no \
  ghcr.io/element-hq/synapse:latest generate
```

Then append this to `docker/synapse-data/homeserver.yaml`:

```yaml
enable_registration: true
enable_registration_without_verification: true

rc_message:
  per_second: 1000
  burst_count: 1000
rc_registration:
  per_second: 1000
  burst_count: 1000
rc_login:
  address:
    per_second: 1000
    burst_count: 1000
  account:
    per_second: 1000
    burst_count: 1000
rc_joins:
  local:
    per_second: 1000
    burst_count: 1000
rc_invites:
  per_room:
    per_second: 1000
    burst_count: 1000
  per_user:
    per_second: 1000
    burst_count: 1000
```

**Verify:** `npm run synapse:up` then
`curl http://localhost:8008/_matrix/client/versions` returns JSON containing `"versions"`.

### Step 0.3 — User provisioning helper

Create `test/harness/users.ts`. It must export:

```ts
export interface TestUser {
  userId: string;      // "@alice_abc123:localhost"
  accessToken: string;
  deviceId: string;
  password: string;
}

/** Registers a brand-new user with a random username. */
export async function registerTestUser(prefix: string): Promise<TestUser>;
```

Implement using the register endpoint directly:
`POST http://localhost:8008/_matrix/client/v3/register` with body
`{ username, password, auth: { type: "m.login.dummy" }, inhibit_login: false }`.
Use a random suffix so repeated runs never collide.

**Verify:** a scratch test registers two users and prints two distinct user IDs.

### Step 0.4 — Client session helper

Create `test/harness/clients.ts`, exporting:

```ts
/** Creates a started, encryption-ready client for a test user. */
export async function createTestClient(user: TestUser): Promise<MatrixClient>;

/** Stops the client and releases resources. */
export async function stopTestClient(client: MatrixClient): Promise<void>;
```

`createTestClient` must:
1. `createClient({ baseUrl: "http://localhost:8008", userId, accessToken, deviceId })`
2. `await client.initRustCrypto()` — **this exact method**, not `initCrypto`
3. `await client.startClient({ initialSyncLimit: 10 })`
4. Wait until the client has completed its first sync before returning

**Verify:** a scratch test creates clients for two users, then stops them, with no errors and
no hanging process.

### Step 0.5 — `waitFor` helper

Create `test/harness/waitFor.ts`:

```ts
/**
 * Polls `check` until it returns a truthy value, or throws after `timeoutMs`.
 * Use this instead of fixed sleeps when waiting for state to sync.
 */
export async function waitFor<T>(
  check: () => T | Promise<T>,
  opts?: { timeoutMs?: number; intervalMs?: number; label?: string },
): Promise<T>;
```

Defaults: `timeoutMs: 10000`, `intervalMs: 200`. On timeout, throw an error including `label`.

### Step 0.6 — Smoke test

Create `test/functional/smoke.test.ts` proving the harness works end to end:

1. Register two users, Alice and Bob.
2. Create clients for both.
3. Alice creates a file tree: `await alice.unstableCreateFileTree("smoke")`.
4. Assert the returned tree has a non-empty `.id`.
5. Alice invites Bob: `await tree.invite(bobUserId)`.
6. Bob joins: `await bob.joinRoom(tree.id)`.
7. Using `waitFor`, assert Bob can see the room: `bob.getRoom(tree.id) !== null`.
8. Stop both clients.

**Phase 0 is done when this test passes reliably three runs in a row.**

---

## 5. Phase 1 — Core tree operations (no encryption yet)

Encryption is deliberately excluded here so tree semantics are isolated from crypto.

Create `src/SecureStorage.ts` wrapping the raw API with a friendlier interface. Design it
yourself, but it must cover everything the tests below need.

Write `test/functional/tree.test.ts` covering:

| # | Test |
|---|---|
| 1.1 | Create a top-level folder; name matches; `isTopLevel` is true |
| 1.2 | Create a subfolder; it appears in `getDirectories()` |
| 1.3 | Create nested subfolders three deep; the full hierarchy is walkable |
| 1.4 | Rename a folder; the new name is visible after sync |
| 1.5 | Delete a subfolder; it disappears from `getDirectories()` |
| 1.6 | `getDirectory(roomId)` returns the right folder; unknown ID returns `undefined` |
| 1.7 | `getOrder()` / `setOrder()` reorders folders as expected |
| 1.8 | Creating a folder with an empty name either throws or is handled — assert whichever it does, and document it |

**Do not proceed to Phase 2 until all Phase 1 tests pass.**

---

## 6. Phase 2 — Encrypted files

Re-read **TRAP 1** in §3 before starting. You will hit it otherwise.

Add upload/download to `src/SecureStorage.ts`:
- `uploadFile(tree, name, data: ArrayBuffer, mimetype: string): Promise<string>`
- `downloadFile(branch): Promise<{ data: ArrayBuffer; mimetype: string }>`

Write `test/functional/files.test.ts` covering:

| # | Test |
|---|---|
| 2.1 | Upload a small text file; download it; bytes are **byte-identical** to the original |
| 2.2 | Upload a binary file (random 100 KB); round-trips byte-identically |
| 2.3 | Uploaded file appears in `tree.listFiles()` with the correct name |
| 2.4 | `branch.getName()` returns the original filename |
| 2.5 | A file with a non-ASCII name (e.g. `тест-файл.txt`) round-trips correctly |
| 2.6 | mimetype survives the round trip |
| 2.7 | **The server never sees plaintext** — fetch the raw media URL and assert the bytes do *not* equal the plaintext |
| 2.8 | Delete a file; it no longer appears in `listFiles()` |

Test 2.7 is the most important test in the project. It is what proves the product's core
claim. Do not skip it.

---

## 7. Phase 3 — Sharing and access control

This is where the sharp edges are. Every test must verify from the **recipient's** client.

Write `test/functional/sharing.test.ts` covering:

| # | Test |
|---|---|
| 3.1 | Alice shares a folder with Bob as Viewer; Bob can list the files |
| 3.2 | Bob (Viewer) can **download and decrypt** a file Alice uploaded |
| 3.3 | Bob as Editor can upload a file; Alice can decrypt it |
| 3.4 | Bob as Viewer **cannot** upload (assert it fails) |
| 3.5 | A user who was never invited cannot read the folder at all |
| 3.6 | `getPermissions()` reports the role that was set |
| 3.7 | Sharing a parent folder with `andSubspaces = true` grants access to subfolders |
| 3.8 | After Alice removes Bob, Bob cannot read **files added afterwards** |

Test 3.8 is the critical E2EE test. Removing a user from a Matrix room does not retroactively
remove their ability to decrypt content they already had keys for — that is expected and
correct. What must hold is that **new** content after removal is unreadable to them. Assert
exactly that, and write a comment in the test explaining the distinction so it is not
"fixed" later by someone misreading it.

---

## 8. Phase 4 — Versioning

Write `test/functional/versions.test.ts`:

| # | Test |
|---|---|
| 4.1 | `createNewVersion` produces a new version; `branch.version` increments |
| 4.2 | `getVersionHistory()` returns all versions, newest first |
| 4.3 | An old version's content is still downloadable and decryptable |
| 4.4 | `listFiles()` shows only the current version; `listAllFiles()` shows all |
| 4.5 | Renaming a file does not create a new version |

---

## 9. Phase 5 — Key management / multi-device

Write `test/functional/keys.test.ts`:

| # | Test |
|---|---|
| 5.1 | `bootstrapCrossSigning()` completes for a fresh user |
| 5.2 | `bootstrapSecretStorage()` produces a recovery key |
| 5.3 | A **second device** for the same user, given the recovery key, decrypts a file uploaded by the first device |
| 5.4 | A second device given a **wrong** recovery key fails cleanly with a clear error |

Test 5.3 requires a second `MatrixClient` for the same user with a *different* device ID.
That is the whole point — do not shortcut it by reusing the first client.

---

## 10. Stop here

**Phase 6 (external share links) and Phase 7 (web UI) are out of scope for you.** Do not start
them. When Phases 0–5 pass, do the following and then stop:

1. Ensure all tests pass from a clean state:
   `npm run synapse:down && npm run synapse:up && npm test`
2. Ensure `npm run lint` and `npm run build` succeed.
3. Write `STATUS.md` in the repo root containing:
   - Which phases are complete
   - Total test count and pass/fail
   - Anything in `BLOCKERS.md`
   - Any place where actual behaviour differed from this plan
4. Commit everything.

Then report back that Phases 0–5 are complete.

---

## 11. Reference material

- `matrix-js-sdk` source: `node_modules/matrix-js-sdk/src/models/MSC3089TreeSpace.ts` and
  `MSC3089Branch.ts` — read these when unsure about behaviour.
- `matrix-files-sdk` (https://github.com/matrix-org/matrix-files-sdk) — Apache-2.0, an older
  wrapper around the same API. **You may read and copy from it**, keeping its copyright notice.
  Note it targets an older matrix-js-sdk, so its download path has TRAP 1.
- `files-sdk-demo` (https://github.com/vector-im/files-sdk-demo) — **AGPL-3.0. Do NOT copy any
  code from this repository.** You may read it to understand behaviour, nothing more.

## 12. Licensing rule

This project ships under **BUSL 1.1** (see `LICENSE`). Do not add any dependency licensed
under GPL, AGPL, or any other copyleft licence. Permissive licences (MIT, Apache-2.0, BSD,
ISC) are fine. If unsure about a dependency's licence, do not add it — note it in
`BLOCKERS.md` instead.
