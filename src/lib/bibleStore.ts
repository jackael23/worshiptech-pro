/**
 * 2026-10-20 (Jarvis): full Bibles imported by the user from a WorshipTech-Pro Bible JSON
 * (e.g. KJV, Ang Dating Biblia 1905 — public domain). Stored in IndexedDB (a full Bible is
 * ~4–5 MB, too big for localStorage). Never sent to the server.
 * 2026-11-03b: storage = PouchDB + optional sync to the user's own CouchDB (see couchSync.ts).
 */
import { getLocalDb, upsertDoc, removeDoc, watchLocal } from "./couchSync";
export interface WtpBibleBook {
  name: string; // English
  tl?: string; // Tagalog
  chapters: string[][]; // chapters[c-1][v-1] = verse text
}

export interface WtpBible {
  app: "WorshipTech-Pro";
  type: "bible";
  version: 1;
  id: string;
  name: string;
  shortName: string;
  language: string;
  license: string;
  source?: string;
  verseCount: number;
  books: WtpBibleBook[];
}

export interface BibleMeta {
  id: string;
  name: string;
  shortName: string;
  language: string;
  license: string;
  verseCount: number;
  importedAt: string;
}

export const BIBLE_LIMITS = { MAX_FILE_BYTES: 20 * 1024 * 1024, MAX_VERSES: 40000, MAX_VERSE_CHARS: 3000, MAX_BIBLES: 10 };

// 2026-11-03b: Bibles live in PouchDB ("wtp-bibles-pdb", synced to CouchDB "wtp_bibles" when the
// user logs in). Doc = meta fields + the whole Bible as attachment "bible.json" (~4–5 MB).
// The old IndexedDB "wtp-bibles" (10-20) is read once to migrate, then left as a backup.
const LEGACY_DB = "wtp-bibles";
const MIGRATED_KEY = "wtp.bibles.migratedToPouch.v1";
const ATTACHMENT = "bible.json";
const memory = new Map<string, WtpBible>(); // cache + fallback when the database is unavailable
const memoryMeta = new Map<string, BibleMeta>();

type BibleDoc = BibleMeta & { _id: string; type: "bible" };

/** Reads every Bible from the old IndexedDB store (empty when it never existed). */
function readLegacyBibles(): Promise<WtpBible[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve([]);
    const req = indexedDB.open(LEGACY_DB);
    req.onupgradeneeded = () => req.transaction?.abort(); // didn't exist: don't create it
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("bibles")) {
        db.close();
        return resolve([]);
      }
      const all = db.transaction("bibles", "readonly").objectStore("bibles").getAll();
      all.onsuccess = () => {
        db.close();
        resolve((all.result as WtpBible[]) || []);
      };
      all.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

async function putBible(b: WtpBible, importedAt = new Date().toISOString()): Promise<void> {
  const meta = { ...toMeta(b), importedAt };
  const doc = {
    ...meta,
    _id: b.id,
    type: "bible" as const,
    _attachments: { [ATTACHMENT]: { content_type: "application/json", data: new Blob([JSON.stringify(b)], { type: "application/json" }) } },
  };
  await upsertDoc("bibles", doc);
}

let migration: Promise<void> | null = null;
function migrateOnce(): Promise<void> {
  migration ??= (async () => {
    try {
      if (window.localStorage.getItem(MIGRATED_KEY)) return;
    } catch {
      return;
    }
    const old = await readLegacyBibles();
    if (old.length > 0) {
      const have = await getLocalDb("bibles").allDocs({ keys: old.map((b) => b.id) });
      for (let i = 0; i < old.length; i++) {
        const row = have.rows[i] as { error?: string; value?: { deleted?: boolean } };
        if (row.error === "not_found" || row.value?.deleted) {
          const { bible } = validateBible(old[i]);
          if (bible) await putBible(bible);
        }
      }
    }
    try {
      window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  })();
  return migration;
}

export function toMeta(b: WtpBible): BibleMeta {
  return {
    id: b.id,
    name: b.name,
    shortName: b.shortName,
    language: b.language,
    license: b.license,
    verseCount: b.verseCount,
    importedAt: new Date().toISOString(),
  };
}

/** Lists imported Bibles. `persistent` is false when only the in-memory fallback works. */
export async function listBibles(): Promise<{ bibles: BibleMeta[]; persistent: boolean }> {
  try {
    await migrateOnce();
    const res = await getLocalDb<BibleDoc>("bibles").allDocs({ include_docs: true });
    const bibles: BibleMeta[] = [];
    for (const row of res.rows) {
      const d = row.doc;
      if (!d || row.id.startsWith("_design/") || d.type !== "bible") continue;
      bibles.push({
        id: d._id,
        name: String(d.name || d._id),
        shortName: String(d.shortName || d._id),
        language: String(d.language || "en"),
        license: String(d.license || ""),
        verseCount: Number(d.verseCount) || 0,
        importedAt: String(d.importedAt || ""),
      });
    }
    return { bibles: bibles.sort((a, b) => a.shortName.localeCompare(b.shortName)), persistent: true };
  } catch {
    return { bibles: [...memoryMeta.values()], persistent: false };
  }
}

export async function getBible(id: string): Promise<WtpBible | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const blob = (await getLocalDb("bibles").getAttachment(id, ATTACHMENT)) as Blob;
    // Synced from CouchDB = outside data: validate again before use.
    const { bible } = validateBible(JSON.parse(await blob.text()));
    if (bible) memory.set(id, bible);
    return bible || null;
  } catch {
    return null;
  }
}

/** Saves a validated Bible. Returns false when it could only be kept in memory (lost on reload). */
export async function saveBible(b: WtpBible): Promise<boolean> {
  memory.set(b.id, b);
  memoryMeta.set(b.id, toMeta(b));
  try {
    await putBible(b);
    return true;
  } catch {
    return false;
  }
}

export async function deleteBible(id: string): Promise<void> {
  memory.delete(id);
  memoryMeta.delete(id);
  try {
    await removeDoc("bibles", id);
  } catch {
    /* in-memory only */
  }
}

/** Calls `onChange` when Bibles change (e.g. pulled from CouchDB); clears the cache first. */
export function watchBibles(onChange: () => void): () => void {
  return watchLocal("bibles", () => {
    memory.clear();
    onChange();
  });
}

const isStr = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;

/** Checks a parsed JSON file and returns a clean Bible, or an error message (Taglish). */
export function validateBible(data: unknown): { bible?: WtpBible; error?: string } {
  const d = data as Partial<WtpBible> | null;
  if (!d || typeof d !== "object" || d.type !== "bible" || d.app !== "WorshipTech-Pro") {
    return { error: "Hindi ito WorshipTech-Pro Bible file (.wtp-bible.json)." };
  }
  if (typeof d.id !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(d.id)) return { error: "Mali ang id ng Bible file." };
  if (!isStr(d.name, 120) || !isStr(d.shortName, 40)) return { error: "Kulang ang pangalan ng Bible file." };
  if (!Array.isArray(d.books) || d.books.length === 0 || d.books.length > 66) return { error: "Mali ang listahan ng mga aklat." };
  let verses = 0;
  const books: WtpBibleBook[] = [];
  for (const bk of d.books) {
    if (!bk || !isStr(bk.name, 60) || !Array.isArray(bk.chapters) || bk.chapters.length === 0 || bk.chapters.length > 200) {
      return { error: "May sirang aklat sa file." };
    }
    const chapters: string[][] = [];
    for (const ch of bk.chapters) {
      if (!Array.isArray(ch) || ch.length > 200) return { error: `May sirang kabanata sa ${bk.name}.` };
      const clean = ch.map((v) => (typeof v === "string" ? v.slice(0, BIBLE_LIMITS.MAX_VERSE_CHARS) : ""));
      verses += clean.length;
      if (verses > BIBLE_LIMITS.MAX_VERSES) return { error: "Masyadong maraming verses sa file." };
      chapters.push(clean);
    }
    books.push({ name: bk.name.trim(), tl: isStr(bk.tl, 60) ? bk.tl!.trim() : undefined, chapters });
  }
  return {
    bible: {
      app: "WorshipTech-Pro",
      type: "bible",
      version: 1,
      id: d.id,
      name: d.name!.trim(),
      shortName: d.shortName!.trim(),
      language: isStr(d.language, 10) ? d.language! : "en",
      license: isStr(d.license, 120) ? d.license! : "",
      source: isStr(d.source, 300) ? d.source : undefined,
      verseCount: verses,
      books,
    },
  };
}
