import { useState, type FormEvent } from "react";
import { useStorage } from "../context/StorageContext";

const DEFAULT_HOMESERVER = "http://localhost:8008";

export function LoginScreen() {
  const { login, register, loginWithOidc, error, status } = useStorage();
  const [mode, setMode] = useState<"login" | "register">("login");

  // Lock homeserver to production value if configured, otherwise use default
  const lockedHomeserver =
    import.meta.env.VITE_HOMESERVER ?? (import.meta.env.PROD ? "https://telecrypt.io" : undefined);
  const [homeserver, setHomeserver] = useState(lockedHomeserver || DEFAULT_HOMESERVER);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const busy = status === "connecting";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "login") {
      await login(homeserver, username, password);
    } else {
      await register(homeserver, username, password);
    }
  }

  async function handleOidc() {
    await loginWithOidc(homeserver);
  }

  // When the homeserver is locked (production build), the server delegates auth
  // to MAS and OIDC is the only correct path — the app must never see the user's
  // password. So show ONLY the "Log in with <host>" button and hide the
  // password form + the dev-only register link. Password login stays for local
  // dev, where the disposable test Synapse has no MAS.
  const oidcLabel = lockedHomeserver
    ? `Log in with ${new URL(lockedHomeserver).host}`
    : "Log in with MAS/OIDC";

  return (
    <div className="centered">
      <form className="panel" onSubmit={handleSubmit}>
        <h1>TeleCrypt.io Storage</h1>
        {!lockedHomeserver && (
          <>
            <label>
              Homeserver
              <input
                value={homeserver}
                onChange={(e) => setHomeserver(e.target.value)}
                data-testid="homeserver"
              />
            </label>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="username"
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>
          </>
        )}
        {error && (
          <p className="error" data-testid="auth-error">
            {error}
          </p>
        )}
        {!lockedHomeserver && (
          <>
            <button type="submit" disabled={busy} data-testid="submit">
              {busy ? "Working…" : mode === "login" ? "Log in" : "Register"}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Need an account? Register (dev)" : "Have an account? Log in"}
            </button>
          </>
        )}
        <button type="button" disabled={busy} onClick={handleOidc} data-testid="oidc-login">
          {busy ? "Working…" : oidcLabel}
        </button>
      </form>
    </div>
  );
}
