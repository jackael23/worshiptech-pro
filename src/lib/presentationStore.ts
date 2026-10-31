/**
 * 2026-10-28 (Jarvis): PowerPoint decks imported by the user (Presentations tab).
 * Stored in IndexedDB like the Bibles — picture slides can be many MB, too big for localStorage.
 * Never sent to the server.
 */
import type { SlideContent } from "../types";

export interface StoredPresentation {
  id: string;
  name: string;
  kind: "pptx" | "images";
  slides: SlideContent[];
  createdAt: string;
}

export const PRESENTATION_LIMITS = { MAX_PRESENTATIONS: 40 };

const DB_NAME = "wtp-presentations";
const DB_VERSION = 1;
const STORE = "presentations";
const memory = new Map<string, StoredPresentation>(); // fallback when IndexedDB is unavailable (private mode)

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        t.onerror = t.onabort = () => {
          db.close();
          reject(t.error);
        };
      }),
  );
}

export const newPresentationId = () => `ppt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** All decks, newest first. `persistent` is false when only the in-memory fallback works. */
export async function listPresentations(): Promise<{ presentations: StoredPresentation[]; persistent: boolean }> {
  try {
    const rows = (await tx<StoredPresentation[]>("readonly", (s) => s.getAll())) || [];
    for (const r of memory.values()) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    return { presentations: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), persistent: true };
  } catch {
    return { presentations: [...memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), persistent: false };
  }
}

/** Returns false when it could only be kept in memory (lost on reload, e.g. storage full). */
export async function savePresentation(p: StoredPresentation): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(p));
    memory.delete(p.id);
    return true;
  } catch {
    memory.set(p.id, p);
    return false;
  }
}

export async function deletePresentation(id: string): Promise<void> {
  memory.delete(id);
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* in-memory only */
  }
}
