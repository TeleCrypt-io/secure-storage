/** Map server/library errors to user-facing upload/create messages. */
export function formatOperationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    /\b413\b/.test(msg) ||
    /M_TOO_LARGE/i.test(msg) ||
    /Upload request body is too large/i.test(msg)
  ) {
    return "Server refused to create file";
  }
  return msg;
}
