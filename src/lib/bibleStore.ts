/**
 * 2026-10-20 (Jarvis): full Bibles imported by the user from a WorshipTech-Pro Bible JSON
 * (e.g. KJV, Ang Dating Biblia 1905 — public domain). Stored in IndexedDB (a full Bible is
 * ~4–5 MB, too big for localStorage). Never sent to the server.
 */
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

const DB_NAME = "wtp-bibles";
const DB_VERSION = 1;
const memory = new Map<string, WtpBible>(); // cache + fallback when IndexedDB is unavailable
const memoryMeta = new Map<string, BibleMeta>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("bibles")) db.createObjectStore("bibles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        t.oncomplete = () => {
          db.close();
          resolve(req ? (req.result as T) : undefined);
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
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
    const rows = (await tx<BibleMeta[]>("meta", "readonly", (s) => s.getAll())) || [];
    return { bibles: rows.sort((a, b) => a.shortName.localeCompare(b.shortName)), persistent: true };
  } catch {
    return { bibles: [...memoryMeta.values()], persistent: false };
  }
}

export async function getBible(id: string): Promise<WtpBible | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const b = await tx<WtpBible>("bibles", "readonly", (s) => s.get(id));
    if (b) memory.set(id, b);
    return b || null;
  } catch {
    return null;
  }
}

/** Saves a validated Bible. Returns false when it could only be kept in memory (lost on reload). */
export async function saveBible(b: WtpBible): Promise<boolean> {
  memory.set(b.id, b);
  const meta = toMeta(b);
  memoryMeta.set(b.id, meta);
  try {
    await tx("bibles", "readwrite", (s) => s.put(b));
    await tx("meta", "readwrite", (s) => s.put(meta));
    return true;
  } catch {
    return false;
  }
}

export async function deleteBible(id: string): Promise<void> {
  memory.delete(id);
  memoryMeta.delete(id);
  try {
    await tx("bibles", "readwrite", (s) => s.delete(id));
    await tx("meta", "readwrite", (s) => s.delete(id));
  } catch {
    /* in-memory only */
  }
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
