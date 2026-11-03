/**
 * 2026-11-03 (Jarvis): My Songs storage = PouchDB (in this browser, IndexedDB) + optional live
 * sync to the user's own CouchDB (e.g. http://localhost:5984/wtp_songs).
 *  - Works without CouchDB: songs are saved in the browser's PouchDB first, sync catches up later.
 *  - First run: songs from the old localStorage list (wtp.mySongs.v1) are copied in once.
 *    The old list is left untouched as a backup.
 *  - CouchDB login uses a session cookie (POST /_session). The password is never stored.
 * Doc shape: { _id: song.id, type: "song", ...StoredSong }.
 */
import { StoredSong, sanitizeSong, loadMySongs } from "./mySongsStore";
import { getLocalDb, watchLocal } from "./couchSync";

const MIGRATED_KEY = "wtp.mySongs.migratedToPouch.v1";

type SongDoc = StoredSong & { _id: string; _rev?: string; type: "song" };

// 2026-11-03b: the PouchDB instance + CouchDB sync moved to couchSync.ts (shared with Bibles/PPT).
const getDb = () => getLocalDb<SongDoc>("songs");

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

/** Calls `onChange` (debounced) whenever the local songs DB changes, e.g. pulled by sync. */
export const watchSongs = (onChange: () => void) => watchLocal("songs", onChange);
