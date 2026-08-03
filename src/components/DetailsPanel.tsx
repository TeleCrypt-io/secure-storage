import { useCallback, useEffect, useState } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { FileDetails, FolderDetails } from "../lib/core";
import { MembersPanel } from "./MembersPanel";

function formatSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export type Selection =
  | { kind: "file"; id: string; folderId: string }
  | { kind: "folder"; id: string; folderId: string }
  | null;

export function DetailsPanel({
  folderId,
  selection,
}: {
  folderId: string;
  selection: Selection;
}) {
  const { storage } = useStorage();
  const [fileDetails, setFileDetails] = useState<FileDetails | null>(null);
  const [folderDetails, setFolderDetails] = useState<FolderDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const targetFolderId = selection?.folderId ?? folderId;
  const showingFile = selection?.kind === "file";
  const showingSubfolder = selection?.kind === "folder" && selection.id !== folderId;

  const refresh = useCallback(async () => {
    if (!storage) return;
    setLoading(true);
    try {
      if (showingFile && selection?.kind === "file") {
        setFileDetails(await core.getFileDetails(storage, targetFolderId, selection.id));
        setFolderDetails(null);
      } else {
        const detailId = showingSubfolder && selection?.kind === "folder" ? selection.id : folderId;
        setFolderDetails(await core.getFolderDetails(storage, detailId));
        setFileDetails(null);
      }
    } catch {
      setFileDetails(null);
      setFolderDetails(null);
    } finally {
      setLoading(false);
    }
  }, [storage, folderId, targetFolderId, selection, showingFile, showingSubfolder]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <aside className="right-panel" data-testid="details-panel">
      <section className="details-section">
        <h3 className="panel-section-title">Details</h3>
        {loading && !fileDetails && !folderDetails ? (
          <p className="muted">Loading…</p>
        ) : showingFile && fileDetails ? (
          <dl className="details-list">
            <div>
              <dt>Name</dt>
              <dd>{fileDetails.name}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{fileDetails.mimetype ?? "—"}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{formatSize(fileDetails.size)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(fileDetails.createdAt)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDate(fileDetails.updatedAt)}</dd>
            </div>
          </dl>
        ) : folderDetails ? (
          <dl className="details-list">
            <div>
              <dt>Name</dt>
              <dd>{folderDetails.name}</dd>
            </div>
            <div>
              <dt>ID</dt>
              <dd className="muted details-id">{folderDetails.id}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatDate(folderDetails.createdAt)}</dd>
            </div>
            <div>
              <dt>Members</dt>
              <dd>{folderDetails.memberCount ?? "—"}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">—</p>
        )}
      </section>

      <section className="access-section">
        <MembersPanel folderId={folderId} embedded />
      </section>
    </aside>
  );
}
