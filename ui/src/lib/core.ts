/**
 * The UI's ONLY doorway into the library: re-exports the browser-safe
 * `src/core/*` operation layer and the `TeleCryptIOStorage` class directly
 * from the library source (not `dist/`, not `src/cli/*`). Everything the UI
 * does — login excluded, which needs its own MatrixClient the way the CLI's
 * `login`/`register` commands do — goes through these same tested functions
 * the CLI uses. No E2EE/sharing/recovery logic is re-implemented here.
 */
export * from "../../../src/core/index.js";
export { TeleCryptIOStorage } from "../../../src/TeleCryptIOStorage.js";
export type { CreateTeleCryptIOStorageOptions } from "../../../src/TeleCryptIOStorage.js";
