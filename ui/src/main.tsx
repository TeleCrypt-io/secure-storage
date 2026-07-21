// Buffer polyfill: matrix-js-sdk / matrix-encrypt-attachment call Buffer.from()
// directly (Node-ism), which does not exist in a browser. Must be wired up
// before anything from matrix-js-sdk runs.
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Deliberately no <StrictMode>: it double-invokes effects in dev, which would
// build two MatrixClients (two crypto stores, two sync loops) for one mount.
createRoot(document.getElementById("root")!).render(<App />);
