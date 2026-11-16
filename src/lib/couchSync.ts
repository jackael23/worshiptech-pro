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
import { couchSession, getAuth, subscribeAuth, trimUrl } from "./auth";

// 2026-11-16: 5th database "lineups" (saved lineups, lib/lineupStore.ts). Synced only when its
// remote name is set — cloud sync sets it; an own CouchDB set up before this has none.
export type DbKind = "songs" | "bibles" | "presentations" | "media" | "lineups";
export const DB_KINDS: DbKind[] = ["songs", "bibles", "presentations", "media", "lineups"];

const LOCAL_NAMES: Record<DbKind, string> = {
  songs: "wtp-songs",
  bibles: "wtp-bibles-pdb",
  presentations: "wtp-presentations-pdb",
  media: "wtp-media-pdb",
  lineups: "wtp-lineups",
};
/** Docs per replication batch: small for Bibles/PPT (each can be several MB); 1 for media (a video can be 200 MB). */
const BATCH: Record<DbKind, number> = { songs: 100, bibles: 1, presentations: 2, media: 1, lineups: 2 };
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
  lineupDbName: string; // "" = lineups are not synced (2026-11-16)
  /** 2026-11-16: true = the account's cloud databases (set up by the server), not an own CouchDB. */
  cloud: boolean;
  username: string;
  enabled: boolean;
}

export const DEFAULT_COUCH: CouchSettings = {
  url: "http://localhost:5984",
  dbName: "wtp_songs",
  bibleDbName: "wtp_bibles",
  pptDbName: "wtp_presentations",
  mediaDbName: "wtp_media",
  lineupDbName: "",
  cloud: false,
  username: "",
  enabled: false,
};

export const remoteName = (s: CouchSettings, kind: DbKind) =>
  kind === "songs" ? s.dbName : kind === "bibles" ? s.bibleDbName : kind === "presentations" ? s.pptDbName : kind === "media" ? s.mediaDbName : s.lineupDbName;
/** The databases these settings sync (lineups only when it has a remote name). */
const syncKinds = (s: CouchSettings) => DB_KINDS.filter((k) => k !== "lineups" || !!s.lineupDbName);

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
      lineupDbName: str(o.lineupDbName, ""),
      cloud: o.cloud === true,
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
  const names = syncKinds(s).map((k) => remoteName(s, k));
  if (!names.every((n) => DB_NAME_RE.test(n))) return "Mali ang pangalan ng database (maliliit na letra, numero, _ lang; hal. wtp_songs).";
  if (new Set(names).size !== names.length) return "Magkakaiba dapat ang pangalan ng database ng Songs, Bible, PPT at Media.";
  return null;
}

/** The CouchDB address of these settings, without a trailing slash. */
export const couchBase = (s: CouchSettings) => trimUrl(s.url);
const baseUrl = couchBase;
const withCookies: typeof fetch = (input, init) => PouchDB.fetch(input as string, { ...init, credentials: "include" });

// 2026-11-16: the session calls (login / who am I / logout) moved to lib/auth.ts — the same
// ones the account login uses. When sync points at the account server, it is ONE login:
// the cookie is shared, so logging out of the account also ends this sync (see below).

// ---------------------------------------------------------------- live sync (4 DBs)

const KIND_LABEL: Record<DbKind, string> = { songs: "Songs", bibles: "Bible", presentations: "PPT", media: "Media", lineups: "Lineups" };
const handlers = new Map<DbKind, { cancel(): void }>();
/** Bumps on every start / stop, so late events of an older sync are ignored. */
let syncGen = 0;
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
  syncGen++;
  handlers.forEach((h) => h.cancel());
  handlers.clear();
  perKind.clear();
  syncBase = null;
  publish();
}

/** CouchDB address the running sync talks to (null = not running). */
let syncBase: string | null = null;
let authWatched = false;
/** Account logged out (or its session ended) and the sync's server has no session any more → stop, instead of retrying with 401s. */
function watchAuth(): void {
  if (authWatched) return;
  authWatched = true;
  let wasUser = getAuth().status === "user";
  subscribeAuth(() => {
    const a = getAuth();
    const loggedOut = wasUser && a.status === "anon" && !a.offline;
    wasUser = a.status === "user";
    if (!loggedOut || !syncBase) return;
    const running = syncBase;
    // Ask the sync's own server: the account and the sync share a cookie when they are the same
    // CouchDB (also when one is reached through /couch and the other directly, same computer).
    void couchSession(running).then((w) => {
      if (syncBase === running && w.reachable && !w.name) stopSync();
    });
  });
}

/**
 * 2026-11-16: cloud sync goes through the app's own address (/couch), and a browser keeps at
 * most 6 connections open to one address (HTTP/1.1, i.e. the laptop). A live sync holds one
 * open per database; five of them plus the app's own two (presence, phone remote) left none
 * for the actual transfers. So in cloud mode only the small, often-edited databases are live;
 * the big, rarely-changed ones sync once now, again after every local change, and every
 * CLOUD_POLL_MS to pick up what another computer added.
 */
const CLOUD_LIVE: DbKind[] = ["songs", "lineups"];
const CLOUD_POLL_MS = 2 * 60 * 1000;

function periodicSync(
  kind: DbKind,
  remote: PouchDB.Database,
  opts: { batch_size: number; batches_limit: number },
  set: (st: SyncStatus) => void,
  describe: (e: unknown) => SyncStatus,
): { cancel(): void } {
  let dead = false;
  let running: PouchDB.Replication.Sync<{}> | null = null;
  let again = false;
  const run = () => {
    if (dead) return;
    if (running) {
      again = true; // something changed while a round was running: one more round after it
      return;
    }
    const h = getLocalDb(kind).sync(remote, opts);
    running = h;
    h.on("denied", (e) => set(describe(e)))
      .on("complete", () => {
        running = null;
        if (dead) return;
        set({ state: "synced" });
        if (again) {
          again = false;
          run();
        }
      })
      .on("error", (e) => {
        running = null;
        again = false;
        if (!dead) set(describe(e)); // the next change or the timer tries again
      });
  };
  const stopWatch = watchLocal(kind, run);
  const timer = setInterval(run, CLOUD_POLL_MS);
  run();
  return {
    cancel() {
      dead = true;
      clearInterval(timer);
      stopWatch();
      running?.cancel();
    },
  };
}

/** Starts two-way sync of Songs, Bibles, PPT, Media (and Lineups) with CouchDB. */
export function startSync(s: CouchSettings): void {
  syncGen++;
  handlers.forEach((h) => h.cancel());
  handlers.clear();
  perKind.clear();
  const err = validateCouchSettings(s);
  if (err) {
    perKind.set("songs", { state: "error", message: err });
    publish();
    return;
  }
  syncBase = baseUrl(s);
  watchAuth();
  const describe = (e: unknown): SyncStatus => {
    const status = (e as { status?: number })?.status;
    if (status === 401) return { state: "login", message: "Kailangang mag-login ulit sa CouchDB." };
    // 403 = logged in, but not allowed in that database (cloud: the Pro plan ended and the databases were locked)
    if (status === 403) return { state: "error", message: s.cloud ? "Walang access sa cloud. Tapos na ba ang Pro plan? Tingnan sa Account." : "Walang access ang account na ito sa database." };
    if (status === 413) return { state: "error", message: "Masyadong malaki para sa CouchDB (taasan ang max_http_request_size)." };
    const m = (e as { reason?: string })?.reason || (e as { message?: string })?.message;
    return { state: "error", message: m ? `Sync error: ${m}` : "Hindi maabot ang CouchDB — susubok ulit." };
  };
  const gen = syncGen;
  for (const kind of syncKinds(s)) {
    perKind.set(kind, { state: "connecting" });
    const remote = new PouchDB(`${baseUrl(s)}/${encodeURIComponent(remoteName(s, kind))}`, { fetch: withCookies });
    const set = (st: SyncStatus) => {
      if (gen !== syncGen) return;
      perKind.set(kind, st);
      publish();
    };
    const opts = { batch_size: BATCH[kind], batches_limit: 2 };
    if (s.cloud && !CLOUD_LIVE.includes(kind)) {
      handlers.set(kind, periodicSync(kind, remote, opts, set, describe));
      continue;
    }
    const handler = getLocalDb(kind).sync(remote, { ...opts, live: true, retry: true });
    handlers.set(kind, handler);
    handler
      .on("active", () => set({ state: "active" }))
      .on("paused", (e) => set(e ? describe(e) : { state: "synced" }))
      .on("denied", (e) => set(describe(e)))
      .on("error", (e) => set(describe(e)));
  }
  publish();
}
