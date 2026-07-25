import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TeleCryptIOStorage, discoverOidcIssuer, buildTokenRefreshFunction } from "../lib/core";
import { loginWithPassword, registerAccount } from "../lib/auth";
import { beginOidcLogin, completeOidcLoginFromCallback, isOidcCallback } from "../lib/oidcAuth";
import { clearSession, loadSession, saveSession, type Session } from "../lib/session";

export type ConnectionStatus = "signed-out" | "connecting" | "ready" | "error";

export interface ConnectLogEntry {
  at: number;
  message: string;
}

/** First-time WASM + IndexedDB init on GitHub Pages can take 30–60s. */
const UI_INIT_TIMEOUT_MS = 90_000;
const UI_SYNC_TIMEOUT_MS = 45_000;
/** Hard ceiling for the whole connect() call — never leave users on infinite Connecting. */
const UI_CONNECT_TIMEOUT_MS = 120_000;

interface StorageContextValue {
  status: ConnectionStatus;
  session: Session | null;
  storage: TeleCryptIOStorage | null;
  error: string | null;
  /** Live status lines while connecting (empty when not connecting). */
  connectLog: ConnectLogEntry[];
  login: (homeserver: string, username: string, password: string) => Promise<void>;
  register: (homeserver: string, username: string, password: string) => Promise<void>;
  /** Starts the OIDC/MAS login redirect — does not return on success
   * (navigates away). Sets `status`/`error` if discovery/DCR fail before
   * the redirect. */
  loginWithOidc: (homeserver: string) => Promise<void>;
  logout: () => void;
}

const StorageContext = createContext<StorageContextValue | null>(null);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    }),
  ]);
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("signed-out");
  const [session, setSession] = useState<Session | null>(null);
  const [storage, setStorage] = useState<TeleCryptIOStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectLog, setConnectLog] = useState<ConnectLogEntry[]>([]);
  // Dedupes concurrent connect() calls for the same access token and guards
  // against building a second MatrixClient from a re-render racing auto-connect.
  const connectInflightRef = useRef<{ token: string; promise: Promise<void> } | null>(null);
  const connectGenRef = useRef(0);
  const connectStartedAtRef = useRef<number | null>(null);

  const appendLog = useCallback((message: string) => {
    setConnectLog((prev) => [...prev, { at: Date.now(), message }]);
  }, []);

  const beginConnecting = useCallback((firstMessage: string) => {
    connectStartedAtRef.current = Date.now();
    setStatus("connecting");
    setError(null);
    setConnectLog([{ at: Date.now(), message: firstMessage }]);
  }, []);

  const connect = useCallback(
    async (s: Session) => {
      const inflight = connectInflightRef.current;
      if (inflight?.token === s.accessToken) {
        return inflight.promise;
      }

      const gen = ++connectGenRef.current;

      const run = (async () => {
        // Keep an existing log (e.g. OIDC callback / password login already
        // started connecting) instead of wiping it when connect() runs.
        if (connectStartedAtRef.current == null) {
          beginConnecting(`Restoring session for ${s.userId}…`);
        } else {
          appendLog(`Opening encrypted session for ${s.userId}…`);
        }
        try {
          const bootstrapOpts = {
            syncTimeoutMs: UI_SYNC_TIMEOUT_MS,
            initTimeoutMs: UI_INIT_TIMEOUT_MS,
            onProgress: (message: string) => {
              if (gen === connectGenRef.current) appendLog(message);
            },
          };
          let client: TeleCryptIOStorage;
          if (s.refreshToken && s.oidcIssuer && s.oidcClientId) {
            appendLog("Discovering authentication server…");
            const authMetadata = await discoverOidcIssuer(s.homeserver);
            appendLog(`Auth issuer: ${authMetadata.issuer}`);
            const tokenRefreshFunction = buildTokenRefreshFunction(
              authMetadata.token_endpoint,
              s.oidcClientId,
              async (tokens) => {
                saveSession({
                  ...s,
                  accessToken: tokens.accessToken,
                  refreshToken: tokens.refreshToken ?? s.refreshToken,
                });
              },
            );
            appendLog("Building encrypted client (OIDC session)…");
            client = await TeleCryptIOStorage.createFromOidc({
              baseUrl: s.homeserver,
              userId: s.userId,
              accessToken: s.accessToken,
              deviceId: s.deviceId,
              refreshToken: s.refreshToken,
              tokenRefreshFunction,
              ...bootstrapOpts,
            });
          } else {
            appendLog("Building encrypted client…");
            client = await TeleCryptIOStorage.create({
              baseUrl: s.homeserver,
              userId: s.userId,
              accessToken: s.accessToken,
              deviceId: s.deviceId,
              ...bootstrapOpts,
            });
          }
          if (gen !== connectGenRef.current) {
            client.getClient().stopClient();
            return;
          }
          appendLog("Connected.");
          setStorage(client);
          setSession(s);
          setStatus("ready");
        } catch (err) {
          if (gen !== connectGenRef.current) return;
          const msg = (err as Error).message;
          appendLog(`Failed: ${msg}`);
          setError(msg);
          setStatus("error");
        }
      })();

      const timed = withTimeout(run, UI_CONNECT_TIMEOUT_MS, "Connection").catch((err) => {
        if (gen !== connectGenRef.current) return;
        const msg = (err as Error).message;
        appendLog(`Failed: ${msg}`);
        setError(msg);
        setStatus("error");
      });

      connectInflightRef.current = { token: s.accessToken, promise: timed };
      try {
        await timed;
      } finally {
        if (connectInflightRef.current?.promise === timed) {
          connectInflightRef.current = null;
        }
      }
    },
    [appendLog, beginConnecting],
  );

  useEffect(() => {
    if (isOidcCallback()) {
      beginConnecting("Completing sign-in…");
      completeOidcLoginFromCallback()
        .then((s) => {
          appendLog(`Signed in as ${s.userId}`);
          saveSession(s);
          return connect(s);
        })
        .catch((err) => {
          const msg = (err as Error).message;
          appendLog(`Failed: ${msg}`);
          setError(msg);
          setStatus("error");
        });
      // Intentionally run once on mount only; login()/register()/
      // loginWithOidc() drive subsequent connections explicitly.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      return;
    }
    const existing = loadSession();
    if (existing) {
      void connect(existing);
    }
    // Intentionally run once on mount only; login()/register() drive
    // subsequent connections explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (homeserver: string, username: string, password: string) => {
      beginConnecting("Signing in…");
      try {
        const s = await loginWithPassword(homeserver, username, password);
        appendLog(`Signed in as ${s.userId}`);
        saveSession(s);
        await connect(s);
      } catch (err) {
        const msg = (err as Error).message;
        appendLog(`Failed: ${msg}`);
        setError(msg);
        setStatus("error");
      }
    },
    [appendLog, beginConnecting, connect],
  );

  const register = useCallback(
    async (homeserver: string, username: string, password: string) => {
      beginConnecting("Creating account…");
      try {
        const s = await registerAccount(homeserver, username, password);
        appendLog(`Account ready: ${s.userId}`);
        saveSession(s);
        await connect(s);
      } catch (err) {
        const msg = (err as Error).message;
        appendLog(`Failed: ${msg}`);
        setError(msg);
        setStatus("error");
      }
    },
    [appendLog, beginConnecting, connect],
  );

  const loginWithOidc = useCallback(
    async (homeserver: string) => {
      beginConnecting("Redirecting to sign-in…");
      try {
        await beginOidcLogin(homeserver); // navigates away on success
      } catch (err) {
        const msg = (err as Error).message;
        appendLog(`Failed: ${msg}`);
        setError(msg);
        setStatus("error");
      }
    },
    [appendLog, beginConnecting],
  );

  const logout = useCallback(() => {
    connectGenRef.current += 1;
    storage?.getClient().stopClient();
    clearSession();
    connectInflightRef.current = null;
    connectStartedAtRef.current = null;
    setStorage(null);
    setSession(null);
    setConnectLog([]);
    setStatus("signed-out");
    setError(null);
  }, [storage]);

  return (
    <StorageContext.Provider
      value={{
        status,
        session,
        storage,
        error,
        connectLog,
        login,
        register,
        loginWithOidc,
        logout,
      }}
    >
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error("useStorage() must be used within a StorageProvider");
  return ctx;
}
