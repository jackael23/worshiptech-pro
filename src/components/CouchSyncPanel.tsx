/**
 * 2026-11-03 (Jarvis): CouchDB sync settings for My Songs (shown in the Songs tab).
 * 2026-11-03b: one login syncs Songs, Bibles and PPT (3 databases); also shown in the Bible/PPT tabs.
 * 2026-11-05: + Media (background pictures/videos, 4th database); also shown in the Media tab.
 * Login uses CouchDB's session cookie; the password is never stored by the app.
 * 2026-11-16: same login as the account (lib/auth.ts). Already logged in on this CouchDB
 *   (e.g. from the Account button) → sync turns on without typing the password again.
 * 2026-11-16 (b): Cloud sync (Pro) on top — one button; the server creates the church's own
 *   databases (cloudServer.ts) and this panel points the sync at them. The own-CouchDB settings
 *   stay below it ("Sariling CouchDB").
 */
import React, { useEffect, useState } from "react";
import { Cloud, Database, Lock, LogIn, LogOut, X } from "lucide-react";
import {
  CouchSettings,
  SyncStatus,
  loadCouchSettings,
  saveCouchSettings,
  validateCouchSettings,
  couchBase,
  startSync,
  stopSync,
  subscribeSync,
  isSyncRunning,
} from "../lib/couchSync";
import { couchLogin, couchLogout, couchSession, getAuthConfig, openAccount, refreshAuth, useAuth } from "../lib/auth";
import { hasFeature, planFromRoles } from "../lib/entitlements";
import { DEFAULT_COUCH } from "../lib/couchSync";
import { useTeamSettings } from "../lib/teamSyncSettings";

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

/** Starts sync on app load when it was left on (called by the Songs/Bible/PPT/Media tabs; runs once). */
let autoStart: Promise<void> | null = null;
export function autoStartCouchSync(): Promise<void> {
  autoStart ??= doAutoStart();
  return autoStart;
}
async function doAutoStart(): Promise<void> {
  const s = loadCouchSettings();
  if (!s.enabled || isSyncRunning() || validateCouchSettings(s)) return;
  const who = await couchSession(couchBase(s));
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
  // 2026-11-17: while Team sync (Firebase) is on, songs are left out of the CouchDB sync.
  const teamOn = useTeamSettings().enabled;

  // Re-checked when the account logs in / out (it may be the same CouchDB, so the same cookie).
  const account = useAuth();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    couchSession(couchBase(settings)).then((w) => alive && setUser(w.name));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, account.name]);

  const shownState = settings.enabled && status.state === "off" ? "login" : status.state;

  const connect = async () => {
    const err = validateCouchSettings(settings);
    if (err) return setMsg(err);
    if (!settings.username.trim()) return setMsg("Ilagay ang CouchDB username.");
    setBusy(true);
    setMsg(null);
    const r = await couchLogin(couchBase(settings), settings.username.trim(), password);
    setPassword("");
    setBusy(false);
    if (!r.ok) return setMsg(r.error || "Hindi naka-login.");
    void refreshAuth(); // the Account button follows (same cookie when this is the account server)
    turnOn(settings.username.trim());
    setMsg("Naka-login. Nagsisimula ang sync.");
  };

  const turnOn = (username: string) => {
    const next = { ...settings, username, enabled: true };
    setSettings(next);
    saveCouchSettings(next);
    setUser(username);
    startSync(next);
  };

  /** Already logged in on this CouchDB: no password needed. */
  const connectAsCurrent = () => {
    const err = validateCouchSettings(settings);
    if (err) return setMsg(err);
    if (!user) return;
    turnOn(user);
    setMsg("Nagsisimula ang sync.");
  };

  const disconnect = async () => {
    stopSync();
    await couchLogout(couchBase(settings));
    void refreshAuth();
    const next = { ...settings, enabled: false };
    setSettings(next);
    saveCouchSettings(next);
    setUser(null);
    setMsg("Naka-off ang sync. Naka-save pa rin sa browser na ito ang mga kanta, Bible, PPT at media.");
  };

  // ---------- cloud sync (Pro) ----------
  const cloudOn = settings.cloud && settings.enabled;
  const ownOn = settings.enabled && !settings.cloud;
  const [ownOpen, setOwnOpen] = useState(ownOn);
  const canCloud = account.status === "user" && hasFeature(planFromRoles(account.roles), "cloudSync");

  const enableCloud = async () => {
    if (busy || !account.name) return;
    if (!window.confirm(`Isasabay sa cloud ng ${account.name} ang lahat ng kanta, Bible, PPT, media at lineups na nasa browser na ito, at ida-download dito ang nasa cloud. Ituloy?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/cloud/provision", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      const j = (await res.json().catch(() => null)) as { dbs?: Record<string, unknown>; error?: unknown } | null;
      const d = j?.dbs;
      const names = d && ["songs", "bibles", "presentations", "media", "lineups"].map((k) => d[k]);
      if (!res.ok || !names || !names.every((n): n is string => typeof n === "string")) {
        setMsg(typeof j?.error === "string" ? j.error : "Hindi na-setup ang cloud sync.");
        return;
      }
      const { couchUrl } = await getAuthConfig();
      const next: CouchSettings = { url: couchUrl, dbName: names[0], bibleDbName: names[1], pptDbName: names[2], mediaDbName: names[3], lineupDbName: names[4], username: account.name, enabled: true, cloud: true };
      const err = validateCouchSettings(next);
      if (err) return setMsg(err);
      setSettings(next);
      saveCouchSettings(next);
      startSync(next);
      setMsg("Naka-on ang cloud sync.");
    } catch {
      setMsg("Hindi maabot ang server ng app.");
    } finally {
      setBusy(false);
    }
  };

  /** Stops syncing; the account stays logged in and everything stays in this browser and in the cloud. */
  const disableCloud = () => {
    stopSync();
    const next = { ...DEFAULT_COUCH };
    setSettings(next);
    saveCouchSettings(next);
    setMsg("Naka-off ang cloud sync. Naka-save pa rin ang lahat sa browser na ito at sa cloud.");
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
        {settings.cloud ? STATE_LABEL[shownState].replace("CouchDB", "Cloud") : STATE_LABEL[shownState]}
        {shownState === "synced" && lastSync ? <span className="text-fg-subtle"> · {lastSync}</span> : null}
      </button>

      {open && (
        <div className="mt-1.5 p-2.5 rounded-lg border border-line bg-surface-2 space-y-2" data-testid="couch-panel">
          <div className="flex items-center justify-between">
            <strong className="text-fg">Sync (Songs, Bible, PPT, Media, Lineups)</strong>
            <button type="button" onClick={() => setOpen(false)} className="tap-target p-1 text-fg-subtle hover:text-fg" aria-label="Isara">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-fg-subtle">
            Laging naka-save muna sa browser na ito ang kanta, Bible, PPT at media (larawan/video); kapag naka-login, sumasabay sa CouchDB mo (dalawang direksyon).
          </p>
          {teamOn && (
            <p className="text-fg-muted" data-testid="couch-team-note">
              Naka-on ang Team sync: sa team napupunta ang mga kanta, kaya Bible, PPT, media at lineups lang ang isinasabay dito.
            </p>
          )}
          <div className="space-y-1.5 rounded-md border border-line p-2" data-testid="cloud-section">
            <div className="flex items-center gap-1.5 font-semibold text-fg">
              <Cloud className="w-3.5 h-3.5" /> Cloud sync <span className="font-normal text-fg-subtle">(Pro)</span>
            </div>
            {cloudOn ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-fg-muted">Naka-on: <strong className="text-fg break-all">{settings.username}</strong></span>
                <button type="button" onClick={disableCloud} className="btn btn-secondary btn-sm" data-testid="cloud-off">
                  I-off
                </button>
              </div>
            ) : account.status !== "user" ? (
              <>
                <p className="text-fg-subtle">Iisang library sa lahat ng computer ng simbahan, at backup sa cloud.</p>
                <button type="button" onClick={openAccount} className="btn btn-secondary btn-sm">
                  <LogIn className="w-3.5 h-3.5" /> Mag-login muna
                </button>
              </>
            ) : !canCloud ? (
              <>
                <p className="inline-flex items-center gap-1.5 text-fg-muted"><Lock className="w-3.5 h-3.5" /> Para sa Pro plan ang cloud sync.</p>
                <button type="button" onClick={openAccount} className="btn btn-primary btn-sm" data-testid="cloud-locked-plans">
                  Tingnan ang plans
                </button>
              </>
            ) : ownOn ? (
              <p className="text-fg-subtle">I-off muna ang sync sa sariling CouchDB (sa ibaba) bago i-on ang cloud sync.</p>
            ) : (
              <button type="button" onClick={enableCloud} disabled={busy || account.offline} className="btn btn-primary btn-sm" data-testid="cloud-on">
                <Cloud className="w-3.5 h-3.5" /> {busy ? "Sandali…" : "I-on ang cloud sync"}
              </button>
            )}
          </div>
          {!cloudOn && (
            <details className="space-y-2" open={ownOpen} onToggle={(e) => setOwnOpen(e.currentTarget.open)} data-testid="own-couch">
              <summary className="cursor-pointer text-fg-muted">Sariling CouchDB (advanced)</summary>
              <div className="mt-2 space-y-2">
          <label className="block">
            <span className="text-fg-muted">CouchDB URL</span>
            <input className={inputCls} value={settings.url} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, url: e.target.value.trim() })} placeholder="http://localhost:5984" />
          </label>
          <label className="block">
            <span className="text-fg-muted">Database — Songs</span>
            <input className={inputCls} value={settings.dbName} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, dbName: e.target.value.trim() })} placeholder="wtp_songs" />
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="block">
              <span className="text-fg-muted">Bible</span>
              <input className={inputCls} value={settings.bibleDbName} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, bibleDbName: e.target.value.trim() })} placeholder="wtp_bibles" />
            </label>
            <label className="block">
              <span className="text-fg-muted">PPT</span>
              <input className={inputCls} value={settings.pptDbName} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, pptDbName: e.target.value.trim() })} placeholder="wtp_presentations" />
            </label>
            <label className="col-span-2 block">
              <span className="text-fg-muted">Media (larawan + video)</span>
              <input className={inputCls} value={settings.mediaDbName} disabled={settings.enabled} onChange={(e) => setSettings({ ...settings, mediaDbName: e.target.value.trim() })} placeholder="wtp_media" />
            </label>
          </div>
          {!settings.enabled && user ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-fg-muted">Naka-login: <strong className="text-fg">{user}</strong></span>
              <button type="button" onClick={connectAsCurrent} className="btn btn-primary btn-sm" data-testid="couch-sync-on">
                <Database className="w-3.5 h-3.5" /> I-on ang sync
              </button>
            </div>
          ) : !settings.enabled || shownState === "login" ? (
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
              </div>
            </details>
          )}
          {status.message && <p className="text-warn-text">{status.message}</p>}
          {msg && <p role="status" className="text-fg">{msg}</p>}
        </div>
      )}
    </div>
  );
};
