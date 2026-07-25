/** Human-readable elapsed time for connect log and timers. */
export function formatElapsed(ms: number): string {
  if (ms < 2000) return `${Math.round(ms)}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m = Math.floor(totalSec / 60);
  const rem = Math.floor(totalSec % 60);
  return `${m}:${String(rem).padStart(2, "0")}`;
}
