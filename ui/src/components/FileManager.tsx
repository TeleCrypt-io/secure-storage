import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { FolderInfo } from "../lib/core";
import { FolderContents } from "./FolderContents";
import { MembersPanel } from "./MembersPanel";

const POLL_MS = 2500;

export function FileManager() {
  const { storage } = useStorage();
  const [folders, setFolders] = useState<FolderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [rootFolder, setRootFolder] = useState<FolderInfo | null>(null);
  const [subPath, setSubPath] = useState<FolderInfo[]>([]);

  const refreshFolders = useCallback(async () => {
    if (!storage) return;
    try {
      const result = await core.listFolders(storage);
      setFolders(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage]);

  useEffect(() => {
    void refreshFolders();
    const timer = setInterval(() => void refreshFolders(), POLL_MS);
    return () => clearInterval(timer);
  }, [refreshFolders]);

  const currentFolder =
    subPath.length > 0 ? subPath[subPath.length - 1]! : rootFolder;

  const breadcrumb: FolderInfo[] = rootFolder
    ? [rootFolder, ...subPath.slice(0, -1)]
    : [];

  function selectRoot(folder: FolderInfo) {
    setRootFolder(folder);
    setSubPath([]);
  }

  function openSubfolder(sub: FolderInfo) {
    setSubPath((prev) => [...prev, sub]);
  }

  function navigateBreadcrumb(index: number) {
    if (index === 0) {
      setSubPath([]);
    } else {
      setSubPath((prev) => prev.slice(0, index));
    }
  }

  function handleFolderRenamed(folderId: string, name: string) {
    if (rootFolder?.id === folderId) {
      setRootFolder({ ...rootFolder, name });
    }
    setSubPath((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)));
    void refreshFolders();
  }

  function handleFolderDeleted(folderId: string) {
    if (currentFolder?.id === folderId) {
      if (subPath.length > 0) {
        setSubPath((prev) => prev.slice(0, -1));
      } else {
        setRootFolder(null);
      }
    }
    if (rootFolder?.id === folderId) {
      setRootFolder(null);
      setSubPath([]);
    }
    void refreshFolders();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await core.createFolder(storage!, newName.trim());
      setNewName("");
      await refreshFolders();
      selectRoot(created);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await core.joinFolder(storage!, joinId.trim());
      setJoinId("");
      await refreshFolders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="file-manager" data-testid="file-manager">
      <aside className="folder-sidebar">
        <h2 className="sidebar-title">Folders</h2>

        <form onSubmit={handleCreate} className="sidebar-form">
          <input
            placeholder="New folder"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            data-testid="new-folder-name"
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !newName.trim()} data-testid="create-folder">
            Create
          </button>
        </form>

        <form onSubmit={handleJoin} className="sidebar-form">
          <input
            placeholder="Folder ID to join"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            data-testid="join-folder-id"
          />
          <button type="submit" className="btn" disabled={busy || !joinId.trim()} data-testid="join-folder">
            Join
          </button>
        </form>

        {error && (
          <p className="error" data-testid="folder-list-error">
            {error}
          </p>
        )}

        {folders === null ? (
          <p className="muted">Loading…</p>
        ) : folders.length === 0 ? (
          <p className="muted" data-testid="no-folders">
            No folders yet.
          </p>
        ) : (
          <ul className="folder-list" data-testid="folder-list">
            {folders.map((f) => (
              <li key={f.id} data-testid="folder-item" data-folder-id={f.id}>
                <button
                  type="button"
                  className={`folder-list-btn${rootFolder?.id === f.id ? " active" : ""}`}
                  onClick={() => selectRoot(f)}
                >
                  {f.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="folder-main">
        {!currentFolder ? (
          <div className="empty-panel muted" data-testid="select-folder-prompt">
            Select or create a folder to browse files.
          </div>
        ) : (
          <FolderContents
            folderId={currentFolder.id}
            folderName={currentFolder.name}
            breadcrumb={[...breadcrumb, ...(subPath.length ? [currentFolder] : [])]}
            onNavigate={navigateBreadcrumb}
            onOpenSubfolder={openSubfolder}
            onFolderRenamed={handleFolderRenamed}
            onFolderDeleted={handleFolderDeleted}
          />
        )}
      </section>

      {currentFolder && <MembersPanel folderId={currentFolder.id} />}
    </div>
  );
}
