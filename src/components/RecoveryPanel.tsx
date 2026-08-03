import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useStorage } from "../context/StorageContext";
import * as core from "../lib/core";

export function RecoveryPanel() {
  const { storage } = useStorage();
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreKeyInput, setRestoreKeyInput] = useState("");
  const [restoreResult, setRestoreResult] = useState<{ imported: number; total: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [restoreExpanded, setRestoreExpanded] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!storage) return;
    try {
      setIsSetup(await storage.keys.isRecoverySetup());
    } catch {
      // Non-fatal: leave isSetup as-is, the setup/restore forms remain usable.
    }
  }, [storage]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function handleSetup() {
    setBusy(true);
    setError(null);
    setConfirmedSaved(false);
    setCopied(false);
    try {
      const result = await core.setupRecovery(storage!);
      setRecoveryKey(result.recoveryKey);
      setIsSetup(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setRestoreResult(null);
    try {
      const result = await core.restoreRecovery(storage!, restoreKeyInput.trim());
      setRestoreResult(result);
      setRestoreKeyInput("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyKey() {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
    } catch {
      // Clipboard API can be unavailable/denied — the key is still shown
      // and selectable, so this is a soft failure, not an error state.
    }
  }

  function dismissKeyDisplay() {
    setRecoveryKey(null);
    setConfirmedSaved(false);
    setCopied(false);
  }

  const showRestoreSection = !recoveryKey && isSetup !== null;

  return (
    <div className="panel">
      <h2>Recovery</h2>

      {isSetup === null && !recoveryKey && (
        <p className="muted" data-testid="recovery-loading">
          Checking recovery status…
        </p>
      )}

      {isSetup === false && !recoveryKey && (
        <div data-testid="recovery-not-setup">
          <p>Recovery is not set up on this device yet.</p>
          <button onClick={handleSetup} disabled={busy} data-testid="setup-recovery">
            {busy ? "Setting up…" : "Set up recovery"}
          </button>
        </div>
      )}

      {recoveryKey && (
        <div className="warning" data-testid="recovery-key-display">
          <p>
            <strong>Save this Recovery Key now.</strong> It is the only way to recover your files
            on a new device — it will not be shown again.
          </p>
          <code data-testid="recovery-key-value">{recoveryKey}</code>
          <div className="recovery-key-actions">
            <button type="button" onClick={copyKey} data-testid="copy-recovery-key">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <label className="recovery-confirm-label">
            <input
              type="checkbox"
              checked={confirmedSaved}
              onChange={(e) => setConfirmedSaved(e.target.checked)}
              data-testid="confirm-saved-recovery-key"
            />
            I've saved my recovery key
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!confirmedSaved}
            onClick={dismissKeyDisplay}
            data-testid="recovery-setup-done"
          >
            Done
          </button>
        </div>
      )}

      {showRestoreSection && (
        <section className="restore-section">
          {isSetup === true && (
            <p data-testid="recovery-active">Recovery is set up on this account.</p>
          )}

          <button
            type="button"
            className="link restore-toggle"
            onClick={() => setRestoreExpanded((v) => !v)}
            aria-expanded={restoreExpanded}
            data-testid="restore-expand"
          >
            {restoreExpanded ? "Hide restore" : "Restore on this device"}
          </button>

          {restoreExpanded && (
            <form onSubmit={handleRestore} className="restore-form">
              <label htmlFor="restore-key-textarea">Recovery Key</label>
              <textarea
                id="restore-key-textarea"
                rows={4}
                value={restoreKeyInput}
                onChange={(e) => setRestoreKeyInput(e.target.value)}
                data-testid="restore-key-input"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !restoreKeyInput.trim()}
                data-testid="restore-submit"
              >
                {busy ? "Restoring…" : "Restore"}
              </button>
            </form>
          )}

          {restoreResult && (
            <p data-testid="restore-result">
              Imported {restoreResult.imported} of {restoreResult.total} keys.
            </p>
          )}
        </section>
      )}

      {error && (
        <p className="error" data-testid="recovery-error">
          {error}
        </p>
      )}
    </div>
  );
}
