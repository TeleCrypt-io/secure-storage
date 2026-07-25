import { useState } from "react";
import "./App.css";
import { StorageProvider, useStorage } from "./context/StorageContext";
import { LoginScreen } from "./components/LoginScreen";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { FileManager } from "./components/FileManager";

type View = "folders" | "recovery";

function Shell() {
  const { status, session, error, logout, retryConnect } = useStorage();
  const [view, setView] = useState<View>("folders");

  if (status === "signed-out" || status === "error") {
    return <LoginScreen />;
  }

  if (status === "connecting") {
    return (
      <div className="centered">
        <p data-testid="connecting">Connecting…</p>
        <p className="muted connecting-hint">
          First login may take up to a minute while encryption initializes.
        </p>
        {error && (
          <p className="error" data-testid="connect-error">
            {error}
          </p>
        )}
        <div className="connecting-actions">
          <button type="button" className="btn" onClick={retryConnect} data-testid="connect-retry">
            Retry
          </button>
          <button type="button" className="link" onClick={logout} data-testid="connect-cancel">
            Log out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">TeleCrypt Storage</span>
        <span className="user muted" data-testid="current-user">
          {session?.userId}
        </span>
        <nav>
          <button
            type="button"
            className={view === "folders" ? "active" : ""}
            onClick={() => setView("folders")}
            data-testid="nav-folders"
          >
            Files
          </button>
          <button
            type="button"
            className={view === "recovery" ? "active" : ""}
            onClick={() => setView("recovery")}
            data-testid="nav-recovery"
          >
            Recovery
          </button>
        </nav>
        <button type="button" className="link" onClick={logout} data-testid="logout">
          Log out
        </button>
      </header>
      <main className="app-main">
        {view === "recovery" && (
          <div className="recovery-wrap">
            <RecoveryPanel />
          </div>
        )}
        {view === "folders" && <FileManager />}
      </main>
    </div>
  );
}

function App() {
  return (
    <StorageProvider>
      <Shell />
    </StorageProvider>
  );
}

export default App;
