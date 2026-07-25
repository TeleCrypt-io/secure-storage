function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatWasmDownloadProgress(loaded: number, total: number | null): string {
  if (total != null && total > 0) {
    const pct = Math.min(100, Math.round((loaded / total) * 100));
    return `Downloading encryption engine… ${formatBytes(loaded)} / ${formatBytes(total)} (${pct}%)`;
  }
  return `Downloading encryption engine… ${formatBytes(loaded)}`;
}

let resolvedWasmUrl: string | null | undefined;

function findWasmUrlFromPerformance(): string | null {
  if (typeof performance === "undefined") return null;
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  for (let i = entries.length - 1; i >= 0; i--) {
    const name = entries[i]?.name ?? "";
    if (name.includes("matrix_sdk_crypto") && name.endsWith(".wasm")) return name;
  }
  return null;
}

/** Best-effort WASM URL before matrix-js-sdk starts loading (dev / same-origin assets). */
export function resolveCryptoWasmUrl(): string | null {
  if (resolvedWasmUrl !== undefined) return resolvedWasmUrl;

  const fromPerf = findWasmUrlFromPerformance();
  if (fromPerf) {
    resolvedWasmUrl = fromPerf;
    return fromPerf;
  }

  if (typeof document !== "undefined") {
    for (const link of document.querySelectorAll('link[rel="preload"][href*=".wasm"]')) {
      const href = link.getAttribute("href");
      if (href?.includes("matrix_sdk_crypto")) {
        resolvedWasmUrl = new URL(href, document.baseURI).href;
        return resolvedWasmUrl;
      }
    }
  }

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV && typeof window !== "undefined") {
    resolvedWasmUrl = new URL(
      "/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm",
      window.location.origin,
    ).href;
    return resolvedWasmUrl;
  }

  resolvedWasmUrl = null;
  return null;
}

/** Prefetch WASM with streaming byte progress when Content-Length is available. */
export async function prefetchCryptoWasm(onProgress: (message: string) => void): Promise<void> {
  const url = resolveCryptoWasmUrl();
  if (!url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const totalHeader = res.headers.get("content-length");
    const total = totalHeader ? Number(totalHeader) : null;
    if (!res.body) {
      await res.arrayBuffer();
      onProgress(formatWasmDownloadProgress(total ?? 0, total));
      return;
    }
    const reader = res.body.getReader();
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      onProgress(formatWasmDownloadProgress(loaded, total));
    }
  } catch {
    // Non-fatal — initRustCrypto will load WASM itself.
  }
}

/** Poll Performance Resource Timing while initRustCrypto runs. */
export function watchWasmResourceProgress(onProgress: (message: string) => void): () => void {
  const id = setInterval(() => {
    if (typeof performance === "undefined") return;
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!entry?.name.includes("matrix_sdk_crypto") || !entry.name.endsWith(".wasm")) continue;
      if (!resolvedWasmUrl) resolvedWasmUrl = entry.name;
      const total = entry.transferSize > 0 ? entry.transferSize : entry.encodedBodySize;
      const loaded =
        entry.responseEnd > 0 ? total : Math.max(entry.encodedBodySize, entry.decodedBodySize);
      if (loaded > 0 || total > 0) {
        onProgress(formatWasmDownloadProgress(loaded || total, total || null));
      }
      return;
    }
  }, 200);
  return () => clearInterval(id);
}
