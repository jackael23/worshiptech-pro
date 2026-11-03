/**
 * 2026-11-03 (Jarvis): CouchDB sync settings for My Songs (shown in the Songs tab).
 * Login uses CouchDB's session cookie; the password is never stored by the app.
 */
import React, { useEffect, useState } from "react";
import { Database, LogIn, LogOut, X } from "lucide-react";
import {
  CouchSettings,
  SyncStatus,
  loadCouchSettings,
  saveCouchSettings,
  validateCouchSettings,
  couchLogin,
  couchLogout,
  couchSessionUser,
  startSync,
  stopSync,
  subscribeSync,
  isSyncRunning,
} from "../lib/songsDb";

const STATE_LABEL: Record<SyncStatus["state"], string> = {
  off: "CouchDB: off",
  connecting: "CouchDB: kumokonekta…",
  active: "CouchDB: nagsi-sync…",
  synced: "CouchDB: synced",
  login: "CouchDB: kailangang mag-login",
  error: "CouchDB: error",
};

const STATE_DOT: Record<SyncStatus["state"], string> = {
  off: "bg-fg-subtle",
  connecting: "bg-warn",
  active: "bg-accent",
  synced: "bg-ok",
  login: "bg-warn",
  error: "bg-live",
};

/** Starts sync on app load when it was left on (called once by SongLibrary). */
export async function autoStartCouchSync(): Promise<void> {
  const s = loadCouchSettings();
  if (!s.enabled || isSyncRunning() || validateCouchSettings(s)) return;
  const who = await couchSessionUser(s);
  // Cookie expired: don't start (it would only retry with 401s). The panel then shows "kailangang mag-login".
  if (who.reachable && !who.name) return;
  startSync(s);
}

export const CouchSyncPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ state: "off" });
  const [settings, setSettings] = useState<CouchSettings>(() => loadCouchSettings());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);

  useEffect(() => subscribeSync(setStatus), []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    couchSessionUser(settings).then((w) => alive && setUser(w.name));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shownState = settings.enabled && status.state === "off" ? "login" : status.state;

  const connect = async () => {
    const err = validateCouchSettings(settings);
    if (err) return setMsg(err);
    if (!settings.username.trim()) return setMsg("Ilagay ang CouchDB username.");
    setBusy(true);
    setMsg(null);
    const r = await couchLogin(settings, password);
    setPassword("");
    setBusy(false);
    if (!r.ok) return setMsg(r.error || "Hindi naka-login.");
    const next = { ...settings, username: settings.username.trim(), enabled: true };
    setSettings(next);
    saveCouchSettings(next);
    setUser(next.username);
    startSync(next);
    setMsg("Naka-login. Nagsisimula ang sync.");
  };

  const disconnect = async () => {
    stopSync();
    await couchLogout(settings);
    const next = { ...settings, enabled: false };
    setSettings(next);
    saveCouchSettings(next);
    setUser(null);
    setMsg("Naka-off ang sync. Naka-save pa rin ang mga kanta sa browser na ito.");
  };

  const lastSync = status.lastSync ? new Date(status.lastSync).toLocaleTimeString() : null;
  const inputCls = "input w-full text-xs";

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="tap-target inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 text-fg-muted"
        title={status.message || (lastSync ? `Huling sync: ${lastSync}` : "CouchDB sync settings")}
        data-testid="couch-status"
        aria-expanded={open}
      >
        <Database className="w-3.5 h-3.5" />
        <span className={`w-2 h-2 rounded-full ${STATE_DOT[shownState]}`} />
        {STATE_LABEL[shownState]}
        {shownState === "synced" && lastSync ? <span className="text-fg-subtle"> · {lastSync}</span> : null}
      </button>

      {open && (
        <div className="mt-1.5 p-2.5 rounded-lg border border-line bg-surface-2 space-y-2" data-testid="couch-panel">
          <div className="flex items-center justify-between">
            <strong className="text-fg">CouchDB sync (My Songs)</strong>
            <button type="button" onClick={() => setOpen(false)} className="tap-target p-1 text-fg-subtle hover:text-fg" aria-label="Isara">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-fg-subtle">
            Laging naka-save muna ang kanta sa browser na ito; kapag naka-login, sumasabay sa CouchDB mo (dalawang direksyon).
          </p>
          <label className="block">
            <span className="text-fg-muted">CouchDB URL</span>
            <input className={inputCls} value={settings.url} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, url: e.target.value.trim() })} placeholder="http://localhost:5984" />
          </label>
          <label className="block">
            <span className="text-fg-muted">Database</span>
            <input className={inputCls} value={settings.dbName} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, dbName: e.target.value.trim() })} placeholder="wtp_songs" />
          </label>
          {!settings.enabled || shownState === "login" ? (
            <>
              <label className="block">
                <span className="text-fg-muted">Username</span>
                <input className={inputCls} value={settings.username} onChange={(e) => setSettings({ ...settings, username: e.target.value })} autoComplete="username" />
              </label>
              <label className="block">
                <span className="text-fg-muted">Password (hindi sine-save)</span>
                <input
                  className={inputCls}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && connect()}
                  autoComplete="current-password"
                />
              </label>
              <div className="flex gap-1.5">
                <button type="button" onClick={connect} disabled={busy} className="btn btn-primary btn-sm">
                  <LogIn className="w-3.5 h-3.5" /> {busy ? "Kumokonekta…" : "Login + Sync"}
                </button>
                {settings.enabled && (
                  <button type="button" onClick={disconnect} className="btn btn-secondary btn-sm">
                    I-off
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-fg-muted">Naka-login: <strong className="text-fg">{user || settings.username}</strong></span>
              <button type="button" onClick={disconnect} className="btn btn-secondary btn-sm">
                <LogOut className="w-3.5 h-3.5" /> Logout + i-off
              </button>
            </div>
          )}
          {status.message && <p className="text-warn-text">{status.message}</p>}
          {msg && <p role="status" className="text-fg">{msg}</p>}
        </div>
      )}
    </div>
  );
};
