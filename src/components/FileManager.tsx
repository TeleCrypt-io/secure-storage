import { useCallback, useEffect, useState } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { FolderInfo } from "../lib/core";
import { DetailsPanel, type Selection } from "./DetailsPanel";
import { FolderContents } from "./FolderContents";

const POLL_MS = 2500;
const UNTITLED = "Untitled vault";

function uniqueUntitledName(existing: FolderInfo[]): string {
  const names = new Set(existing.map((f) => f.name.toLowerCase()));
  if (!names.has(UNTITLED.toLowerCase())) return UNTITLED;
  let i = 2;
  while (names.has(`${UNTITLED} ${i}`.toLowerCase())) i++;
  return `${UNTITLED} ${i}`;
}

export function FileManager({ onOpenRecovery }: { onOpenRecovery?: () => void }) {
  const { storage } = useStorage();
  const [folders, setFolders] = useState<FolderInfo[] | null>(null);
  const [invites, setInvites] = useState<FolderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rootFolder, setRootFolder] = useState<FolderInfo | null>(null);
  const [ownedFolderIds, setOwnedFolderIds] = useState<Set<string>>(new Set());
  const [subPath, setSubPath] = useState<FolderInfo[]>([]);
  const [sidebarRenaming, setSidebarRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [selection, setSelection] = useState<Selection>(null);
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);

  const refreshFolders = useCallback(async () => {
    if (!storage) return;
    try {
      const [result, pending] = await Promise.all([
        core.listFolders(storage),
        core.listPendingInvites(storage),
      ]);
      setFolders(result);
      setInvites(pending);
      setOwnedFolderIds(
        new Set(
          result
            .filter((folder) => core.getMyFolderRole(storage, folder.id) === "owner")
            .map((folder) => folder.id),
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage]);

  useEffect(() => {
    void refreshFolders();
    const timer = setInterval(() => void refreshFolders(), POLL_MS);
    return () => clearInterval(timer);
  }, [refreshFolders]);

  useEffect(() => {
    if (!storage) return;
    void storage.keys.isRecoverySetup().then((ok) => setRecoveryNeeded(!ok));
  }, [storage]);

  const currentFolder =
    subPath.length > 0 ? subPath[subPath.length - 1]! : rootFolder;

  const breadcrumb: FolderInfo[] = rootFolder
    ? [rootFolder, ...subPath.slice(0, -1)]
    : [];

  function selectRoot(folder: FolderInfo) {
    setRootFolder(folder);
    setSubPath([]);
    setSelection(null);
  }

  function openSubfolder(sub: FolderInfo) {
    setSubPath((prev) => [...prev, sub]);
    setSelection(null);
  }

  function navigateBreadcrumb(index: number) {
    if (index === 0) {
      setSubPath([]);
    } else {
      setSubPath((prev) => prev.slice(0, index));
    }
    setSelection(null);
  }

  function handleNavUp() {
    if (subPath.length > 0) {
      setSubPath((prev) => prev.slice(0, -1));
    } else {
      setRootFolder(null);
    }
    setSelection(null);
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
    setSelection(null);
    void refreshFolders();
  }

  async function handleNewVault() {
    setBusy(true);
    setError(null);
    try {
      const name = uniqueUntitledName(folders ?? []);
      const created = await core.createFolder(storage!, name);
      setFolders((prev) => [...(prev ?? []), created]);
      setOwnedFolderIds((prev) => new Set(prev).add(created.id));
      selectRoot(created);
      setSidebarRenaming({ id: created.id, name: created.name });
      void refreshFolders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commitSidebarRename() {
    if (!sidebarRenaming) return;
    const trimmed = sidebarRenaming.name.trim();
    if (!trimmed) {
      setSidebarRenaming(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await core.renameFolder(storage!, sidebarRenaming.id, trimmed);
      handleFolderRenamed(sidebarRenaming.id, trimmed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setSidebarRenaming(null);
    }
  }

  async function handleDeleteVault(folder: FolderInfo) {
    if (!confirm(`Delete vault "${folder.name}" and everything inside it?`)) return;
    setBusy(true);
    setError(null);
    try {
      await core.deleteFolder(storage!, folder.id);
      if (rootFolder?.id === folder.id) {
        setRootFolder(null);
        setSubPath([]);
        setSelection(null);
      }
      await refreshFolders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptInvite(folderId: string) {
    setBusy(true);
    setError(null);
    try {
      await core.joinFolder(storage!, folderId);
      await refreshFolders();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeclineInvite(folderId: string) {
    setBusy(true);
    setError(null);
    try {
      await core.declineInvite(storage!, folderId);
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
        <h2 className="sidebar-title">Vaults</h2>

        <button
          type="button"
          className="btn btn-primary sidebar-new-folder"
          onClick={() => void handleNewVault()}
          disabled={busy}
          data-testid="create-vault"
        >
          New vault
        </button>

        {invites != null && invites.length > 0 && (
          <section className="invite-section" data-testid="invite-list">
            <h3 className="sidebar-subtitle">Invitations</h3>
            <ul className="invite-list">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="invite-item"
                  data-testid="invite-item"
                  data-folder-id={inv.id}
                >
                  <span className="invite-name">{inv.name}</span>
                  <div className="invite-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => void handleAcceptInvite(inv.id)}
                      data-testid="accept-invite"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => void handleDeclineInvite(inv.id)}
                      data-testid="decline-invite"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <p className="error" data-testid="folder-list-error">
            {error}
          </p>
        )}

        {folders === null ? (
          <p className="muted">Loading…</p>
        ) : folders.length === 0 ? (
          <p className="muted" data-testid="no-vaults">
            No vaults yet.
          </p>
        ) : (
          <ul className="folder-list" data-testid="vault-list">
            {folders.map((f) => (
              <li key={f.id} data-testid="vault-item" data-folder-id={f.id}>
                {sidebarRenaming?.id === f.id ? (
                  <input
                    className="rename-input sidebar-rename"
                    value={sidebarRenaming.name}
                    autoFocus
                    onChange={(e) =>
                      setSidebarRenaming({ ...sidebarRenaming, name: e.target.value })
                    }
                    onBlur={() => void commitSidebarRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitSidebarRename();
                      if (e.key === "Escape") setSidebarRenaming(null);
                    }}
                    data-testid="rename-vault-input"
                  />
                ) : (
                  <button
                    type="button"
                    className={`folder-list-btn${rootFolder?.id === f.id ? " active" : ""}`}
                    onClick={() => selectRoot(f)}
                  >
                    {f.name}
                  </button>
                )}
                {ownedFolderIds.has(f.id) && sidebarRenaming?.id !== f.id && (
                  <div className="vault-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSidebarRenaming({ id: f.id, name: f.name });
                      }}
                      data-testid="rename-vault"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteVault(f);
                      }}
                      data-testid="delete-vault"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="folder-main">
        {recoveryNeeded && onOpenRecovery && (
          <div className="recovery-banner" data-testid="recovery-banner">
            <span>Protect this account — set up recovery</span>
            <button type="button" className="btn btn-sm" onClick={onOpenRecovery}>
              Set up recovery
            </button>
          </div>
        )}

        {!currentFolder ? (
          <div className="empty-panel muted" data-testid="select-vault-prompt">
            Select or create a vault to browse files.
          </div>
        ) : (
          <FolderContents
            folderId={currentFolder.id}
            folderName={currentFolder.name}
            breadcrumb={[...breadcrumb, ...(subPath.length ? [currentFolder] : [])]}
            isVaultRoot={subPath.length === 0}
            onNavigate={navigateBreadcrumb}
            onNavUp={handleNavUp}
            onOpenSubfolder={openSubfolder}
            onFolderRenamed={handleFolderRenamed}
            onFolderDeleted={handleFolderDeleted}
            selection={selection}
            onSelect={setSelection}
          />
        )}
      </section>

      {currentFolder && (
        <DetailsPanel folderId={currentFolder.id} selection={selection} />
      )}
    </div>
  );
}
