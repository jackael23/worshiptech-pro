/**
 * 2026-11-03 (Jarvis): My Songs storage = PouchDB (in this browser, IndexedDB) + optional live
 * sync to the user's own CouchDB (e.g. http://localhost:5984/wtp_songs).
 *  - Works without CouchDB: songs are saved in the browser's PouchDB first, sync catches up later.
 *  - First run: songs from the old localStorage list (wtp.mySongs.v1) are copied in once.
 *    The old list is left untouched as a backup.
 *  - CouchDB login uses a session cookie (POST /_session). The password is never stored.
 * Doc shape: { _id: song.id, type: "song", ...StoredSong }.
 */
import PouchDB from "pouchdb-browser";
import { StoredSong, sanitizeSong, loadMySongs } from "./mySongsStore";

export const LOCAL_SONGS_DB = "wtp-songs";
const MIGRATED_KEY = "wtp.mySongs.migratedToPouch.v1";
const SETTINGS_KEY = "wtp-couchdb-v1";

type SongDoc = StoredSong & { _id: string; _rev?: string; type: "song" };

let db: PouchDB.Database<SongDoc> | null = null;
function getDb(): PouchDB.Database<SongDoc> {
  if (!db) db = new PouchDB<SongDoc>(LOCAL_SONGS_DB, { auto_compaction: true });
  return db;
}

/** Latest known _rev of every song, needed to update/delete. */
const revs = new Map<string, string>();

/** All writes go through one queue so two quick saves never race each other. */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

function toDoc(s: StoredSong): SongDoc {
  const doc: SongDoc = { ...s, _id: s.id, type: "song" };
  if (doc.copyright === undefined) delete doc.copyright; // PouchDB rejects undefined fields in some adapters
  return doc;
}

const byCreated = (a: StoredSong, b: StoredSong) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title);

/** Copies the old localStorage songs into PouchDB once. Existing ids in PouchDB are kept. */
async function migrateFromLocalStorage(): Promise<number> {
  try {
    if (window.localStorage.getItem(MIGRATED_KEY)) return 0;
  } catch {
    return 0; // storage blocked: nothing to migrate
  }
  const { songs } = loadMySongs();
  let copied = 0;
  if (songs.length > 0) {
    const existing = await getDb().allDocs({ keys: songs.map((s) => s.id) });
    const missing = songs.filter((_, i) => {
      const row = existing.rows[i] as { error?: string; value?: { deleted?: boolean } };
      return row.error === "not_found" || row.value?.deleted;
    });
    if (missing.length > 0) {
      const res = await getDb().bulkDocs(missing.map(toDoc));
      copied = res.filter((r) => "ok" in r && r.ok).length;
    }
  }
  try {
    window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
  return copied;
}

let migration: Promise<number> | null = null;

async function readAll(): Promise<StoredSong[]> {
  const res = await getDb().allDocs({ include_docs: true });
  revs.clear();
  const songs: StoredSong[] = [];
  for (const row of res.rows) {
    if (row.id.startsWith("_design/") || !row.doc) continue;
    revs.set(row.id, row.value.rev);
    const s = sanitizeSong({ ...row.doc, id: row.doc._id });
    if (s && s.id === row.doc._id) songs.push(s);
  }
  return songs.sort(byCreated);
}

/**
 * Reads My Songs from PouchDB (runs the one-time migration first).
 * `available: false` = PouchDB could not open (blocked storage); falls back to the old list.
 */
export async function loadSongsFromDb(): Promise<{ songs: StoredSong[]; available: boolean; migrated: number }> {
  try {
    // Same promise for every caller in this page (React StrictMode runs effects twice in dev).
    migration ??= enqueue(migrateFromLocalStorage);
    const migrated = await migration;
    const songs = await enqueue(readAll);
    return { songs, available: true, migrated };
  } catch (err) {
    console.warn("[songsDb] PouchDB unavailable, using browser list", err);
    return { songs: loadMySongs().songs, available: false, migrated: 0 };
  }
}

/** Re-reads after pending writes finish (used when sync pulls changes). */
export function reloadSongs(): Promise<StoredSong[]> {
  return enqueue(readAll);
}

/** Writes only what changed between `prev` and `next` (add/update/delete). Returns false on failure. */
export function saveSongsDiff(prev: StoredSong[], next: StoredSong[]): Promise<boolean> {
  return enqueue(async () => {
    const prevMap = new Map(prev.map((s) => [s.id, s]));
    const nextIds = new Set(next.map((s) => s.id));
    const docs: Array<SongDoc | { _id: string; _rev: string; _deleted: true }> = [];
    for (const s of next) {
      const p = prevMap.get(s.id);
      if (p && JSON.stringify(p) === JSON.stringify(s)) continue;
      const rev = revs.get(s.id);
      docs.push(rev ? { ...toDoc(s), _rev: rev } : toDoc(s));
    }
    for (const p of prev) {
      const rev = revs.get(p.id);
      if (!nextIds.has(p.id) && rev) docs.push({ _id: p.id, _rev: rev, _deleted: true });
    }
    if (docs.length === 0) return true;

    const res = await getDb().bulkDocs(docs as SongDoc[]);
    let ok = true;
    for (let i = 0; i < res.length; i++) {
      const r = res[i] as { ok?: boolean; id: string; rev?: string; status?: number };
      if (r.ok && r.rev) {
        if ((docs[i] as { _deleted?: boolean })._deleted) revs.delete(r.id);
        else revs.set(r.id, r.rev);
        continue;
      }
      // 409 = sync brought a newer version in the meantime: retry once on top of the latest rev.
      if (r.status === 409) {
        try {
          const latest = await getDb().get(r.id);
          const retry = { ...docs[i], _rev: latest._rev } as SongDoc;
          const again = await getDb().put(retry);
          if ((docs[i] as { _deleted?: boolean })._deleted) revs.delete(again.id);
          else revs.set(again.id, again.rev);
          continue;
        } catch {
          /* fall through */
        }
      }
      ok = false;
    }
    return ok;
  });
}

/** Calls `onChange` (debounced) whenever the local DB changes from outside this tab's saves, e.g. sync. */
export function watchSongs(onChange: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  let feed: PouchDB.Core.Changes<SongDoc> | null = null;
  try {
    feed = getDb()
      .changes({ since: "now", live: true })
      .on("change", () => {
        clearTimeout(t);
        t = setTimeout(onChange, 300);
      })
      .on("error", () => undefined);
  } catch {
    /* ignore */
  }
  return () => {
    clearTimeout(t);
    feed?.cancel();
  };
}

// ---------------------------------------------------------------- CouchDB sync

export interface CouchSettings {
  url: string; // e.g. http://localhost:5984 (no user/password in it)
  dbName: string; // e.g. wtp_songs
  username: string;
  enabled: boolean;
}

export const DEFAULT_COUCH: CouchSettings = { url: "http://localhost:5984", dbName: "wtp_songs", username: "", enabled: false };

export type SyncState = "off" | "connecting" | "active" | "synced" | "login" | "error";
export interface SyncStatus {
  state: SyncState;
  message?: string;
  lastSync?: string;
}

export function loadCouchSettings(): CouchSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_COUCH };
    const o = JSON.parse(raw) as Partial<CouchSettings>;
    return {
      url: typeof o.url === "string" ? o.url : DEFAULT_COUCH.url,
      dbName: typeof o.dbName === "string" ? o.dbName : DEFAULT_COUCH.dbName,
      username: typeof o.username === "string" ? o.username.slice(0, 80) : "",
      enabled: o.enabled === true,
    };
  } catch {
    return { ...DEFAULT_COUCH };
  }
}

export function saveCouchSettings(s: CouchSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Checks the settings. Returns an error message (Taglish) or null when OK. */
export function validateCouchSettings(s: CouchSettings): string | null {
  let u: URL;
  try {
    u = new URL(s.url);
  } catch {
    return "Mali ang CouchDB URL (hal. http://localhost:5984).";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Dapat http:// o https:// ang CouchDB URL.";
  if (u.username || u.password) return "Huwag ilagay ang username/password sa URL — gamitin ang Login.";
  if (!/^[a-z][a-z0-9_$()+/-]{0,120}$/.test(s.dbName)) return "Mali ang pangalan ng database (maliliit na letra, numero, _ lang; hal. wtp_songs).";
  return null;
}

const baseUrl = (s: CouchSettings) => s.url.replace(/\/+$/, "");
const withCookies: typeof fetch = (input, init) => PouchDB.fetch(input as string, { ...init, credentials: "include" });

/** Logs in to CouchDB (session cookie). The password is only sent, never saved. */
export async function couchLogin(s: CouchSettings, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${baseUrl(s)}/_session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: s.username, password }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Mali ang username o password." };
    return { ok: false, error: `CouchDB: HTTP ${res.status}` };
  } catch {
    return { ok: false, error: "Hindi maabot ang CouchDB. Bukas ba ito, at naka-enable ang CORS (credentials) para sa address ng app?" };
  }
}

/** Who is logged in (null = nobody / unreachable). */
export async function couchSessionUser(s: CouchSettings): Promise<{ name: string | null; reachable: boolean }> {
  try {
    const res = await fetch(`${baseUrl(s)}/_session`, { credentials: "include" });
    if (!res.ok) return { name: null, reachable: true };
    const j = (await res.json()) as { userCtx?: { name?: string | null } };
    return { name: j.userCtx?.name ?? null, reachable: true };
  } catch {
    return { name: null, reachable: false };
  }
}

export async function couchLogout(s: CouchSettings): Promise<void> {
  try {
    await fetch(`${baseUrl(s)}/_session`, { method: "DELETE", credentials: "include" });
  } catch {
    /* ignore */
  }
}

let syncHandler: PouchDB.Replication.Sync<SongDoc> | null = null;
let syncStatus: SyncStatus = { state: "off" };
const syncListeners = new Set<(st: SyncStatus) => void>();
function onStatus(st: SyncStatus) {
  syncStatus = st.state === "synced" || !syncStatus.lastSync ? st : { ...st, lastSync: syncStatus.lastSync };
  syncListeners.forEach((fn) => fn(syncStatus));
}

/** Sync keeps running while the app is open (even when the Songs tab is closed). */
export function subscribeSync(fn: (st: SyncStatus) => void): () => void {
  syncListeners.add(fn);
  fn(syncStatus);
  return () => {
    syncListeners.delete(fn);
  };
}
export const isSyncRunning = () => syncHandler !== null;

export function stopSync(): void {
  syncHandler?.cancel();
  syncHandler = null;
  onStatus({ state: "off" });
}

/** Starts two-way live sync with the user's CouchDB. */
export function startSync(s: CouchSettings): void {
  syncHandler?.cancel();
  syncHandler = null;
  const err = validateCouchSettings(s);
  if (err) {
    onStatus({ state: "error", message: err });
    return;
  }
  onStatus({ state: "connecting" });
  const remote = new PouchDB<SongDoc>(`${baseUrl(s)}/${encodeURIComponent(s.dbName)}`, { fetch: withCookies });
  const describe = (e: unknown): SyncStatus => {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) return { state: "login", message: "Kailangang mag-login ulit sa CouchDB." };
    const m = (e as { message?: string; reason?: string })?.reason || (e as { message?: string })?.message;
    return { state: "error", message: m ? `Sync error: ${m}` : "Hindi maabot ang CouchDB — susubok ulit." };
  };
  const handler = getDb().sync(remote, { live: true, retry: true });
  syncHandler = handler;
  handler
    .on("active", () => syncHandler === handler && onStatus({ state: "active" }))
    .on("paused", (e) => {
      if (syncHandler !== handler) return;
      onStatus(e ? describe(e) : { state: "synced", lastSync: new Date().toISOString() });
    })
    .on("denied", (e) => syncHandler === handler && onStatus(describe(e)))
    .on("error", (e) => syncHandler === handler && onStatus(describe(e)));
}
