/**
 * The UI's ONLY doorway into the library: re-exports the browser-safe
 * public operation layer and the `TeleCryptIOStorage` class from the exact
 * published library release. Everything the UI
 * does — login excluded, which needs its own MatrixClient the way the CLI's
 * `login`/`register` commands do — goes through these same tested functions
 * the CLI uses. No E2EE/sharing/recovery logic is re-implemented here.
 */
export * from "@telecrypt-io/storage/core";
export { TeleCryptIOStorage } from "@telecrypt-io/storage";
export type { CreateTeleCryptIOStorageOptions } from "@telecrypt-io/storage";
