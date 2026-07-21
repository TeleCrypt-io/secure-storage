import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TeleCryptIOStorage } from "../lib/core";
import { loginWithPassword, registerAccount } from "../lib/auth";
import { clearSession, loadSession, saveSession, type Session } from "../lib/session";

export type ConnectionStatus = "signed-out" | "connecting" | "ready" | "error";

interface StorageContextValue {
  status: ConnectionStatus;
  session: Session | null;
  storage: TeleCryptIOStorage | null;
  error: string | null;
  login: (homeserver: string, username: string, password: string) => Promise<void>;
  register: (homeserver: string, username: string, password: string) => Promise<void>;
  logout: () => void;
}

const StorageContext = createContext<StorageContextValue | null>(null);

export function StorageProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("signed-out");
  const [session, setSession] = useState<Session | null>(null);
  const [storage, setStorage] = useState<TeleCryptIOStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards against building a second TeleCryptIOStorage (second MatrixClient,
  // second sync loop) for the same session, e.g. from a re-render racing the
  // initial-mount auto-connect.
  const connectingRef = useRef<string | null>(null);

  const connect = useCallback(async (s: Session) => {
    if (connectingRef.current === s.accessToken) return;
    connectingRef.current = s.accessToken;
    setStatus("connecting");
    setError(null);
    try {
      const client = await TeleCryptIOStorage.create({
        baseUrl: s.homeserver,
        userId: s.userId,
        accessToken: s.accessToken,
        deviceId: s.deviceId,
      });
      setStorage(client);
      setSession(s);
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
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
      setStatus("connecting");
      setError(null);
      try {
        const s = await loginWithPassword(homeserver, username, password);
        saveSession(s);
        await connect(s);
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }
    },
    [connect],
  );

  const register = useCallback(
    async (homeserver: string, username: string, password: string) => {
      setStatus("connecting");
      setError(null);
      try {
        const s = await registerAccount(homeserver, username, password);
        saveSession(s);
        await connect(s);
      } catch (err) {
        setError((err as Error).message);
        setStatus("error");
      }
    },
    [connect],
  );

  const logout = useCallback(() => {
    storage?.getClient().stopClient();
    clearSession();
    connectingRef.current = null;
    setStorage(null);
    setSession(null);
    setStatus("signed-out");
    setError(null);
  }, [storage]);

  return (
    <StorageContext.Provider value={{ status, session, storage, error, login, register, logout }}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error("useStorage() must be used within a StorageProvider");
  return ctx;
}
