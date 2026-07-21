/**
 * Registers real Synapse accounts for E2E tests the exact same way
 * test/harness/users.ts does for the library's own functional tests (same
 * endpoint, same m.login.dummy shape) — kept as a thin, UI-suite-local copy
 * rather than a cross-package import so ui/ has no reach-through dependency
 * on the root test/ tree's module resolution.
 */
export interface E2eUser {
  userId: string;
  localpart: string;
  password: string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function registerE2eUser(prefix: string): Promise<E2eUser> {
  const suffix = randomSuffix();
  const localpart = `${prefix}_${suffix}`;
  const password = `pwd_${suffix}`;

  const res = await fetch("http://localhost:8008/_matrix/client/v3/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: localpart,
      password,
      auth: { type: "m.login.dummy" },
      inhibit_login: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`registration failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { user_id: string };
  return { userId: data.user_id, localpart, password };
}

/** Polls the raw server-side key backup endpoint until it reports at least
 * `minCount` stored keys — the authoritative proof the background backup
 * engine actually finished uploading (mirrors test/functional/keys.test.ts's
 * waitForServerBackupCount). Needs a device access token, which the UI
 * doesn't expose in the DOM, so the caller passes one obtained via a raw
 * login call. */
export async function waitForServerBackupCount(
  accessToken: string,
  minCount: number,
  timeoutMs = 20000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch("http://localhost:8008/_matrix/client/v3/room_keys/version", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      const info = (await res.json()) as { count?: number };
      if ((info.count ?? 0) >= minCount) return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`timed out waiting for server backup count >= ${minCount}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** A plain password-login call (not through the UI) — used only to obtain a
 * throwaway access token for server-side assertions like
 * waitForServerBackupCount, never to drive the app itself. */
export async function passwordLogin(
  user: Pick<E2eUser, "localpart" | "password">,
): Promise<{ accessToken: string }> {
  const res = await fetch("http://localhost:8008/_matrix/client/v3/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: user.localpart },
      password: user.password,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`login failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { access_token: string };
  return { accessToken: data.access_token };
}
