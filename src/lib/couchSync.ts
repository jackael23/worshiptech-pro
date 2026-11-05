/**
 * 2026-11-03b (Jarvis): shared PouchDB databases (this browser) + live sync to the user's own
 * CouchDB, for My Songs, Bibles and Presentations (PPT).
 *  - Local DBs: "wtp-songs" (since 11-03), "wtp-bibles-pdb", "wtp-presentations-pdb".
 *  - Remote DBs (defaults): wtp_songs, wtp_bibles, wtp_presentations — one login for all three.
 *  - CouchDB login uses a session cookie (POST /_session). The password is never stored.
 *  - Big things (a whole Bible, picture slides) are saved as attachments, so the JSON body of
 *    each doc stays small (CouchDB's max_document_size does not count attachments).
 * 2026-11-05: 4th database "media" — Media-tab background pictures and videos
 *    (local "wtp-media-pdb", remote wtp_media; the file itself is an attachment).
 */
import PouchDB from "pouchdb-browser";

export type DbKind = "songs" | "bibles" | "presentations" | "media";
export const DB_KINDS: DbKind[] = ["songs", "bibles", "presentations", "media"];

const LOCAL_NAMES: Record<DbKind, string> = {
  songs: "wtp-songs",
  bibles: "wtp-bibles-pdb",
  presentations: "wtp-presentations-pdb",
  media: "wtp-media-pdb",
};
/** Docs per replication batch: small for Bibles/PPT (each can be several MB); 1 for media (a video can be 200 MB). */
const BATCH: Record<DbKind, number> = { songs: 100, bibles: 1, presentations: 2, media: 1 };
const SETTINGS_KEY = "wtp-couchdb-v1";

const dbs = new Map<DbKind, PouchDB.Database<any>>();
export function getLocalDb<T extends {} = {}>(kind: DbKind): PouchDB.Database<T> {
  let db = dbs.get(kind);
  if (!db) {
    db = new PouchDB(LOCAL_NAMES[kind], { auto_compaction: true });
    dbs.set(kind, db);
  }
  return db as PouchDB.Database<T>;
}

/** Calls `onChange` (debounced) whenever that local DB changes (own saves or pulled by sync). */
export function watchLocal(kind: DbKind, onChange: () => void): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  let feed: PouchDB.Core.Changes<{}> | null = null;
  try {
    feed = getLocalDb(kind)
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

/** Saves `doc` over whatever revision is there now (or creates it). */
export async function upsertDoc<T extends {}>(kind: DbKind, doc: T & { _id: string }): Promise<void> {
  const db = getLocalDb<T>(kind);
  let rev: string | undefined;
  try {
    rev = (await db.get(doc._id))._rev;
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
  await db.put(rev ? { ...doc, _rev: rev } : doc);
}

export async function removeDoc(kind: DbKind, id: string): Promise<void> {
  const db = getLocalDb(kind);
  try {
    const d = await db.get(id);
    await db.remove(d);
  } catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
  }
}

// ---------------------------------------------------------------- settings + login

export interface CouchSettings {
  url: string; // e.g. http://localhost:5984 (no user/password in it)
  dbName: string; // songs, e.g. wtp_songs
  bibleDbName: string; // e.g. wtp_bibles
  pptDbName: string; // e.g. wtp_presentations
  mediaDbName: string; // e.g. wtp_media (2026-11-05)
  username: string;
  enabled: boolean;
}

export const DEFAULT_COUCH: CouchSettings = {
  url: "http://localhost:5984",
  dbName: "wtp_songs",
  bibleDbName: "wtp_bibles",
  pptDbName: "wtp_presentations",
  mediaDbName: "wtp_media",
  username: "",
  enabled: false,
};

export const remoteName = (s: CouchSettings, kind: DbKind) =>
  kind === "songs" ? s.dbName : kind === "bibles" ? s.bibleDbName : kind === "presentations" ? s.pptDbName : s.mediaDbName;

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
    const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
    return {
      url: str(o.url, DEFAULT_COUCH.url),
      dbName: str(o.dbName, DEFAULT_COUCH.dbName),
      bibleDbName: str(o.bibleDbName, DEFAULT_COUCH.bibleDbName), // older settings (11-03) had songs only
      pptDbName: str(o.pptDbName, DEFAULT_COUCH.pptDbName),
      mediaDbName: str(o.mediaDbName, DEFAULT_COUCH.mediaDbName), // older settings (before 11-05) had no media
      username: str(o.username, "").slice(0, 80),
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

const DB_NAME_RE = /^[a-z][a-z0-9_$()+/-]{0,120}$/;

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
  const names = DB_KINDS.map((k) => remoteName(s, k));
  if (!names.every((n) => DB_NAME_RE.test(n))) return "Mali ang pangalan ng database (maliliit na letra, numero, _ lang; hal. wtp_songs).";
  if (new Set(names).size !== names.length) return "Magkakaiba dapat ang pangalan ng database ng Songs, Bible, PPT at Media.";
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

// ---------------------------------------------------------------- live sync (4 DBs)

const KIND_LABEL: Record<DbKind, string> = { songs: "Songs", bibles: "Bible", presentations: "PPT", media: "Media" };
const handlers = new Map<DbKind, PouchDB.Replication.Sync<{}>>();
const perKind = new Map<DbKind, SyncStatus>();
let syncStatus: SyncStatus = { state: "off" };
const syncListeners = new Set<(st: SyncStatus) => void>();

/** One status for all four: error > login > connecting > active > synced. */
function publish() {
  const list = DB_KINDS.map((k) => ({ k, st: perKind.get(k) })).filter((x): x is { k: DbKind; st: SyncStatus } => !!x.st);
  let next: SyncStatus;
  if (list.length === 0) next = { state: "off" };
  else {
    const pick = (state: SyncState) => list.find((x) => x.st.state === state);
    const bad = pick("error") || pick("login");
    if (bad) next = { state: bad.st.state, message: `${KIND_LABEL[bad.k]}: ${bad.st.message || ""}`.trim() };
    else if (pick("connecting")) next = { state: "connecting" };
    else if (pick("active")) next = { state: "active" };
    else next = { state: "synced", lastSync: new Date().toISOString() };
  }
  syncStatus = next.state === "synced" || !syncStatus.lastSync ? next : { ...next, lastSync: syncStatus.lastSync };
  syncListeners.forEach((fn) => fn(syncStatus));
}

/** Sync keeps running while the app is open (even when the Songs/Bible/PPT/Media tab is closed). */
export function subscribeSync(fn: (st: SyncStatus) => void): () => void {
  syncListeners.add(fn);
  fn(syncStatus);
  return () => {
    syncListeners.delete(fn);
  };
}
export const isSyncRunning = () => handlers.size > 0;

export function stopSync(): void {
  handlers.forEach((h) => h.cancel());
  handlers.clear();
  perKind.clear();
  publish();
}

/** Starts two-way live sync of Songs, Bibles, PPT and Media with the user's CouchDB. */
export function startSync(s: CouchSettings): void {
  handlers.forEach((h) => h.cancel());
  handlers.clear();
  perKind.clear();
  const err = validateCouchSettings(s);
  if (err) {
    perKind.set("songs", { state: "error", message: err });
    publish();
    return;
  }
  const describe = (e: unknown): SyncStatus => {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) return { state: "login", message: "Kailangang mag-login ulit sa CouchDB." };
    if (status === 413) return { state: "error", message: "Masyadong malaki para sa CouchDB (taasan ang max_http_request_size)." };
    const m = (e as { reason?: string })?.reason || (e as { message?: string })?.message;
    return { state: "error", message: m ? `Sync error: ${m}` : "Hindi maabot ang CouchDB — susubok ulit." };
  };
  for (const kind of DB_KINDS) {
    perKind.set(kind, { state: "connecting" });
    const remote = new PouchDB(`${baseUrl(s)}/${encodeURIComponent(remoteName(s, kind))}`, { fetch: withCookies });
    const handler = getLocalDb(kind).sync(remote, { live: true, retry: true, batch_size: BATCH[kind], batches_limit: 2 });
    handlers.set(kind, handler);
    const mine = () => handlers.get(kind) === handler;
    const set = (st: SyncStatus) => {
      if (!mine()) return;
      perKind.set(kind, st);
      publish();
    };
    handler
      .on("active", () => set({ state: "active" }))
      .on("paused", (e) => set(e ? describe(e) : { state: "synced" }))
      .on("denied", (e) => set(describe(e)))
      .on("error", (e) => set(describe(e)));
  }
  publish();
}
