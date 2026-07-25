import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { FileInfo, FolderInfo } from "../lib/core";

const POLL_MS = 2500;

function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 4.5A1 1 0 0 1 2.5 3.5h3.17l1.33 1.33h6.5a1 1 0 0 1 1 1v7.17a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1V4.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4.5 1.5h4.59L12.5 4.91v9.59a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M9 1.5v3.5h3.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function FolderContents({
  folderId,
  folderName,
  breadcrumb,
  onNavigate,
  onOpenSubfolder,
  onFolderRenamed,
  onFolderDeleted,
}: {
  folderId: string;
  folderName: string;
  breadcrumb: FolderInfo[];
  onNavigate: (index: number) => void;
  onOpenSubfolder: (sub: FolderInfo) => void;
  onFolderRenamed: (folderId: string, name: string) => void;
  onFolderDeleted: (folderId: string) => void;
}) {
  const { storage } = useStorage();
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [subfolders, setSubfolders] = useState<FolderInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(
    null,
  );
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!storage) return;
    try {
      const [fileList, subList] = await Promise.all([
        core.listFiles(storage, folderId),
        core.listSubfolders(storage, folderId),
      ]);
      setFiles(fileList);
      setSubfolders(subList);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage, folderId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function uploadBytes(name: string, bytes: Uint8Array, mimetype: string) {
    setBusy(true);
    setError(null);
    try {
      await core.uploadFile(storage!, folderId, name, bytes, mimetype);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimetype = file.type || "application/octet-stream";
      await uploadBytes(file.name, bytes, mimetype);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const list = e.dataTransfer.files;
    if (!list.length) return;
    for (const file of Array.from(list)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await uploadBytes(file.name, bytes, file.type || "application/octet-stream");
    }
  }

  async function handleDownload(f: FileInfo) {
    setBusy(true);
    setError(null);
    try {
      const result = await core.downloadFile(storage!, folderId, f.id);
      const blob = new Blob([result.bytes as BlobPart], { type: result.mimetype });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.name;
      a.setAttribute("data-testid", "download-anchor");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm("Delete this file?")) return;
    setBusy(true);
    setError(null);
    try {
      await core.deleteFile(storage!, folderId, fileId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSubfolder(subId: string) {
    if (!confirm("Delete this folder and everything inside it?")) return;
    setBusy(true);
    setError(null);
    try {
      await core.deleteFolder(storage!, subId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCurrentFolder() {
    if (!confirm(`Delete "${folderName}" and everything inside it?`)) return;
    setBusy(true);
    setError(null);
    try {
      await core.deleteFolder(storage!, folderId);
      onFolderDeleted(folderId);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function commitRename() {
    if (!renaming || !renaming.name.trim()) {
      setRenaming(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (renaming.kind === "file") {
        await core.renameFile(storage!, folderId, renaming.id, renaming.name.trim());
      } else {
        await core.renameFolder(storage!, renaming.id, renaming.name.trim());
        if (renaming.id === folderId) {
          onFolderRenamed(folderId, renaming.name.trim());
        }
      }
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setRenaming(null);
    }
  }

  async function handleCreateSubfolder(e: FormEvent) {
    e.preventDefault();
    if (!newSubfolderName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await core.createSubfolder(storage!, folderId, newSubfolderName.trim());
      setNewSubfolderName("");
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const loading = files === null || subfolders === null;
  const empty = !loading && files!.length === 0 && subfolders!.length === 0;

  return (
    <div
      className={`folder-contents${dragOver ? " drag-over" : ""}`}
      data-testid="folder-detail"
      data-folder-id={folderId}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <nav className="breadcrumb" aria-label="Folder path">
        {breadcrumb.map((crumb, i) => (
          <span key={crumb.id}>
            {i > 0 && <span className="breadcrumb-sep">/</span>}
            <button
              type="button"
              className="link breadcrumb-item"
              onClick={() => onNavigate(i)}
              data-testid="breadcrumb-item"
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          data-testid="upload-button"
        >
          Upload
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          disabled={busy}
          multiple
          hidden
          data-testid="file-input"
        />
        <form onSubmit={handleCreateSubfolder} className="inline-form subfolder-form">
          <input
            placeholder="New subfolder"
            value={newSubfolderName}
            onChange={(e) => setNewSubfolderName(e.target.value)}
            data-testid="new-subfolder-name"
          />
          <button
            type="submit"
            className="btn"
            disabled={busy || !newSubfolderName.trim()}
            data-testid="create-subfolder"
          >
            Create
          </button>
        </form>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void handleDeleteCurrentFolder()}
          disabled={busy}
          data-testid="delete-folder"
        >
          Delete folder
        </button>
      </div>

      {error && (
        <p className="error" data-testid="folder-detail-error">
          {error}
        </p>
      )}

      <div className="file-table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={2} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              subfolders!.map((sub) => (
                <tr key={sub.id} data-testid="subfolder-item" data-folder-id={sub.id}>
                  <td>
                    {renaming?.kind === "folder" && renaming.id === sub.id ? (
                      <input
                        className="rename-input"
                        value={renaming.name}
                        autoFocus
                        onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        data-testid="rename-input"
                      />
                    ) : (
                      <button type="button" className="row-name-btn" onClick={() => onOpenSubfolder(sub)}>
                        <FolderIcon />
                        <span>{sub.name}</span>
                      </button>
                    )}
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Rename"
                      disabled={busy}
                      onClick={() => setRenaming({ kind: "folder", id: sub.id, name: sub.name })}
                      data-testid="rename-subfolder"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete"
                      disabled={busy}
                      onClick={() => void handleDeleteSubfolder(sub.id)}
                      data-testid="delete-subfolder"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            {!loading &&
              files!.map((f) => (
                <tr key={f.id} data-testid="file-item" data-file-id={f.id}>
                  <td>
                    {renaming?.kind === "file" && renaming.id === f.id ? (
                      <input
                        className="rename-input"
                        value={renaming.name}
                        autoFocus
                        onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                        onBlur={() => void commitRename()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitRename();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        data-testid="rename-input"
                      />
                    ) : (
                      <span className="row-name">
                        <FileIcon />
                        <span>{f.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="col-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Download"
                      disabled={busy}
                      onClick={() => void handleDownload(f)}
                      data-testid="download-file"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Rename"
                      disabled={busy}
                      onClick={() => setRenaming({ kind: "file", id: f.id, name: f.name })}
                      data-testid="rename-file"
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete"
                      disabled={busy}
                      onClick={() => void handleDeleteFile(f.id)}
                      data-testid="delete-file"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {empty && (
          <p className="empty-state muted" data-testid="no-files">
            No files yet — upload or drop files here.
          </p>
        )}
      </div>
    </div>
  );
}
