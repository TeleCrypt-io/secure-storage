import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";
import type { Member } from "../lib/core";

const POLL_MS = 4000;

function displayName(userId: string): string {
  const local = userId.split(":")[0]?.replace(/^@/, "") ?? userId;
  return local;
}

function initials(userId: string): string {
  const name = displayName(userId);
  return name.slice(0, 2).toUpperCase();
}

export function MembersPanel({ folderId, embedded }: { folderId: string; embedded?: boolean }) {
  const { storage, session } = useStorage();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareUserId, setShareUserId] = useState("");
  const [shareRole, setShareRole] = useState<"viewer" | "editor">("editor");
  const [expanded, setExpanded] = useState(true);

  const refresh = useCallback(async () => {
    if (!storage) return;
    try {
      setMembers(await core.listMembers(storage, folderId));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [storage, folderId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleShare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await core.shareFolder(storage!, folderId, shareUserId.trim(), shareRole);
      setShareUserId("");
      await refresh();
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
      await core.unshareFolder(storage!, folderId, userId);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className={`members-panel${embedded ? " embedded" : ""}`} data-testid="members-panel">
      {embedded ? (
        <h3 className="panel-section-title">Access</h3>
      ) : (
        <button
          type="button"
          className="members-panel-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <span>Access</span>
          <span className="muted">{members?.length ?? "…"}</span>
        </button>
      )}

      {(embedded || expanded) && (
        <>
          {!embedded && (
            <p className="members-panel-hint muted">Everyone with access to this folder</p>
          )}

          {error && (
            <p className="error" data-testid="members-error">
              {error}
            </p>
          )}

          <ul className="member-list" data-testid="member-list">
            {members === null ? (
              <li className="muted">Loading…</li>
            ) : members.length === 0 ? (
              <li className="muted">No members</li>
            ) : (
              members.map((m) => (
                <li key={m.userId} className="member-item" data-testid="member-item" data-user-id={m.userId}>
                  <span className="member-avatar" aria-hidden="true">
                    {initials(m.userId)}
                  </span>
                  <span className="member-info">
                    <span className="member-name">{displayName(m.userId)}</span>
                    <span className={`role-pill ${m.role} ${m.membership === "invite" ? "invited" : ""}`}>
                      {m.membership === "invite" ? `${m.role} · invited` : m.role}
                    </span>
                  </span>
                  {m.userId !== session?.userId && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="Remove"
                      onClick={() => handleUnshare(m.userId)}
                      disabled={busy}
                      data-testid="unshare-member"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>

          <form onSubmit={handleShare} className="invite-form">
            <input
              placeholder="@user:homeserver"
              value={shareUserId}
              onChange={(e) => setShareUserId(e.target.value)}
              data-testid="share-user-id"
            />
            <div className="invite-form-row">
              <select
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value as "viewer" | "editor")}
                data-testid="share-role"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !shareUserId.trim()}
                data-testid="share-submit"
              >
                Invite
              </button>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
