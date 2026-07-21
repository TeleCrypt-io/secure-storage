import { useState } from "react";
import "./App.css";
import { StorageProvider, useStorage } from "./context/StorageContext";
import { LoginScreen } from "./components/LoginScreen";
import { RecoveryPanel } from "./components/RecoveryPanel";
import { FolderList } from "./components/FolderList";
import { FolderDetail } from "./components/FolderDetail";
import type { FolderInfo } from "./lib/core";

type View = "folders" | "recovery";

function Shell() {
  const { status, session, error, logout } = useStorage();
  const [view, setView] = useState<View>("folders");
  const [openFolder, setOpenFolder] = useState<FolderInfo | null>(null);

  if (status === "signed-out" || status === "error") {
    return <LoginScreen />;
  }

  if (status === "connecting") {
    return (
      <div className="centered">
        <p data-testid="connecting">Connecting…</p>
        {error && (
          <p className="error" data-testid="connect-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="user" data-testid="current-user">
          {session?.userId}
        </span>
        <nav>
          <button
            className={view === "folders" ? "active" : ""}
            onClick={() => {
              setOpenFolder(null);
              setView("folders");
            }}
            data-testid="nav-folders"
          >
            Folders
          </button>
          <button
            className={view === "recovery" ? "active" : ""}
            onClick={() => setView("recovery")}
            data-testid="nav-recovery"
          >
            Recovery
          </button>
        </nav>
        <button className="link" onClick={logout} data-testid="logout">
          Log out
        </button>
      </header>
      <main>
        {view === "recovery" && <RecoveryPanel />}
        {view === "folders" && !openFolder && <FolderList onOpen={setOpenFolder} />}
        {view === "folders" && openFolder && (
          <FolderDetail folder={openFolder} onBack={() => setOpenFolder(null)} />
        )}
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
