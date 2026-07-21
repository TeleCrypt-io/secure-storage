/**
 * Session construction: login/register against Synapse directly. This is
 * session-bound and platform-specific the same way the CLI's own `login`/
 * `register` commands are (see docs/DECISIONS.md D3) — outside `core/`'s
 * contract by construction, so it lives here rather than in lib/core.ts.
 * Mirrors src/cli/index.ts's `storage login`/`storage register` exactly:
 * same endpoints, same `m.login.password` / `m.login.dummy` shapes.
 */
import { createClient } from "matrix-js-sdk";
import type { Session } from "./session";

export async function loginWithPassword(
  homeserver: string,
  username: string,
  password: string,
): Promise<Session> {
  const client = createClient({ baseUrl: homeserver });
  let res;
  try {
    res = await client.loginWithPassword(username, password);
  } catch (err) {
    throw new Error(`login failed: ${(err as Error).message}`);
  }
  return {
    homeserver,
    userId: res.user_id,
    deviceId: res.device_id,
    accessToken: res.access_token,
  };
}

/** Dev/test convenience only — mirrors `telecrypt-io storage register`. */
export async function registerAccount(
  homeserver: string,
  username: string,
  password: string,
): Promise<Session> {
  const res = await fetch(`${homeserver}/_matrix/client/v3/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password,
      auth: { type: "m.login.dummy" },
      inhibit_login: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`registration failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    user_id: string;
    access_token: string;
    device_id: string;
  };
  return {
    homeserver,
    userId: data.user_id,
    deviceId: data.device_id,
    accessToken: data.access_token,
  };
}
