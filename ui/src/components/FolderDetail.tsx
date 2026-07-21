import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { FileInfo, FolderInfo, Member } from "../lib/core";

const FILES_POLL_MS = 2500;
const MEMBERS_POLL_MS = 4000;

export function FolderDetail({
  folder,
  onBack,
}: {
  folder: FolderInfo;
  onBack: () => void;
}) {
  const { storage, session } = useStorage();
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareUserId, setShareUserId] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("editor");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshFiles = useCallback(async () => {
    if (!storage) return;
    try {
      setFiles(await core.listFiles(storage, folder.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage, folder.id]);

  const refreshMembers = useCallback(async () => {
    if (!storage) return;
    try {
      setMembers(await core.listMembers(storage, folder.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage, folder.id]);

  useEffect(() => {
    void refreshFiles();
    void refreshMembers();
    const filesTimer = setInterval(() => void refreshFiles(), FILES_POLL_MS);
    const membersTimer = setInterval(() => void refreshMembers(), MEMBERS_POLL_MS);
    return () => {
      clearInterval(filesTimer);
      clearInterval(membersTimer);
    };
  }, [refreshFiles, refreshMembers]);

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimetype = file.type || "application/octet-stream";
      await core.uploadFile(storage!, folder.id, file.name, bytes, mimetype);
      await refreshFiles();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload(f: FileInfo) {
    setBusy(true);
    setError(null);
    try {
      const result = await core.downloadFile(storage!, folder.id, f.id);
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

  async function handleShare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await core.shareFolder(storage!, folder.id, shareUserId.trim(), shareRole);
      setShareUserId("");
      await refreshMembers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUnshare(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await core.unshareFolder(storage!, folder.id, userId);
      await refreshMembers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="folder-detail" data-folder-id={folder.id}>
      <button className="link" onClick={onBack} data-testid="back-to-folders">
        ← Folders
      </button>
      <h2>{folder.name}</h2>
      <p className="muted" data-testid="folder-detail-id">
        {folder.id}
      </p>

      {error && (
        <p className="error" data-testid="folder-detail-error">
          {error}
        </p>
      )}

      <section>
        <h3>Files</h3>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          disabled={busy}
          data-testid="file-input"
        />
        {files === null ? (
          <p>Loading…</p>
        ) : files.length === 0 ? (
          <p data-testid="no-files">No files yet.</p>
        ) : (
          <ul data-testid="file-list">
            {files.map((f) => (
              <li key={f.id} data-testid="file-item" data-file-id={f.id}>
                <span>{f.name}</span>
                <button onClick={() => handleDownload(f)} disabled={busy} data-testid="download-file">
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Share</h3>
        <form onSubmit={handleShare} className="inline-form">
          <input
            placeholder="@user:homeserver"
            value={shareUserId}
            onChange={(e) => setShareUserId(e.target.value)}
            data-testid="share-user-id"
          />
          <select
            value={shareRole}
            onChange={(e) => setShareRole(e.target.value as "viewer" | "editor")}
            data-testid="share-role"
          >
            <option value="viewer">Viewer</option>
            <option value="editor">Editor</option>
          </select>
          <button type="submit" disabled={busy || !shareUserId.trim()} data-testid="share-submit">
            Invite
          </button>
        </form>

        <h4>Members</h4>
        {members === null ? (
          <p>Loading…</p>
        ) : (
          <ul data-testid="member-list">
            {members.map((m) => (
              <li key={m.userId} data-testid="member-item" data-user-id={m.userId}>
                <span>
                  {m.userId} — {m.role} ({m.membership})
                </span>
                {m.userId !== session?.userId && (
                  <button
                    onClick={() => handleUnshare(m.userId)}
                    disabled={busy}
                    data-testid="unshare-member"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
