import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { FolderInfo } from "../lib/core";

// A shared folder another session just invited us into (or a folder we just
// created) can take a few /sync round trips to surface locally — this is
// real async settling (see docs/DECISIONS.md), not an instant lookup. Poll
// on an interval while this view is mounted instead of a one-shot fetch, so
// the DOM genuinely catches up without a fixed sleep anywhere.
const POLL_MS = 2500;

export function FolderList({ onOpen }: { onOpen: (folder: FolderInfo) => void }) {
  const { storage } = useStorage();
  const [folders, setFolders] = useState<FolderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!storage) return;
    try {
      const result = await core.listFolders(storage);
      setFolders(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await core.createFolder(storage!, newName.trim());
      setNewName("");
      await refresh();
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
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>Folders</h2>

      <form onSubmit={handleCreate} className="inline-form">
        <input
          placeholder="New folder name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          data-testid="new-folder-name"
        />
        <button type="submit" disabled={busy || !newName.trim()} data-testid="create-folder">
          Create
        </button>
      </form>

      <form onSubmit={handleJoin} className="inline-form">
        <input
          placeholder="Folder ID to join"
          value={joinId}
          onChange={(e) => setJoinId(e.target.value)}
          data-testid="join-folder-id"
        />
        <button type="submit" disabled={busy || !joinId.trim()} data-testid="join-folder">
          Join
        </button>
      </form>

      {error && (
        <p className="error" data-testid="folder-list-error">
          {error}
        </p>
      )}

      {folders === null ? (
        <p>Loading…</p>
      ) : folders.length === 0 ? (
        <p data-testid="no-folders">No folders yet.</p>
      ) : (
        <ul data-testid="folder-list">
          {folders.map((f) => (
            <li key={f.id} data-testid="folder-item" data-folder-id={f.id}>
              <button className="link" onClick={() => onOpen(f)}>
                {f.name}
              </button>
              <span className="muted"> {f.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
