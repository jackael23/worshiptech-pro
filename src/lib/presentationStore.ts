/**
 * 2026-10-28 (Jarvis): PowerPoint decks imported by the user (Presentations tab).
 * Stored in IndexedDB like the Bibles — picture slides can be many MB, too big for localStorage.
 * Never sent to the server.
 * 2026-11-03b: storage = PouchDB + optional sync to the user's own CouchDB (see couchSync.ts).
 */
import type { SlideContent } from "../types";
import { getLocalDb, upsertDoc, removeDoc, watchLocal } from "./couchSync";

export interface StoredPresentation {
  id: string;
  name: string;
  kind: "pptx" | "images";
  slides: SlideContent[];
  createdAt: string;
}

export const PRESENTATION_LIMITS = { MAX_PRESENTATIONS: 40 };

// 2026-11-03b: decks live in PouchDB ("wtp-presentations-pdb", synced to CouchDB "wtp_presentations"
// when the user logs in). Doc = name/kind/createdAt + all slides as attachment "slides.json"
// (picture slides can be many MB). The old IndexedDB "wtp-presentations" is read once to migrate.
const LEGACY_DB = "wtp-presentations";
const LEGACY_STORE = "presentations";
const MIGRATED_KEY = "wtp.presentations.migratedToPouch.v1";
const ATTACHMENT = "slides.json";
const memory = new Map<string, StoredPresentation>(); // fallback when the database is unavailable (private mode)

export const newPresentationId = () => `ppt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Cleans slides read from storage / CouchDB. */
function cleanSlides(v: unknown): SlideContent[] {
  if (!Array.isArray(v)) return [];
  const out: SlideContent[] = [];
  for (const raw of v.slice(0, 500)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const image = str(o.image, 40_000_000);
    out.push({
      label: str(o.label, 200) ?? "",
      text: str(o.text, 20_000) ?? "",
      image: image && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image) ? image : undefined,
      background: str(o.background, 40_000_000),
      textColor: str(o.textColor, 40),
      notes: str(o.notes, 20_000),
    });
  }
  return out;
}

function cleanPresentation(o: Record<string, unknown>, slides: unknown): StoredPresentation | null {
  const id = str(o._id ?? o.id, 80);
  if (!id || !/^ppt-[\w-]{1,70}$/.test(id)) return null;
  const s = cleanSlides(slides);
  if (s.length === 0) return null;
  return {
    id,
    name: str(o.name, 200) || "Presentation",
    kind: o.kind === "images" ? "images" : "pptx",
    slides: s,
    createdAt: str(o.createdAt, 40) || new Date(0).toISOString(),
  };
}

function readLegacy(): Promise<StoredPresentation[]> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve([]);
    const req = indexedDB.open(LEGACY_DB);
    req.onupgradeneeded = () => req.transaction?.abort(); // didn't exist: don't create it
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.close();
        return resolve([]);
      }
      const all = db.transaction(LEGACY_STORE, "readonly").objectStore(LEGACY_STORE).getAll();
      all.onsuccess = () => {
        db.close();
        resolve((all.result as StoredPresentation[]) || []);
      };
      all.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

async function putPresentation(p: StoredPresentation): Promise<void> {
  await upsertDoc("presentations", {
    _id: p.id,
    type: "presentation",
    name: p.name,
    kind: p.kind,
    slideCount: p.slides.length,
    createdAt: p.createdAt,
    _attachments: { [ATTACHMENT]: { content_type: "application/json", data: new Blob([JSON.stringify(p.slides)], { type: "application/json" }) } },
  });
}

let migration: Promise<void> | null = null;
function migrateOnce(): Promise<void> {
  migration ??= (async () => {
    try {
      if (window.localStorage.getItem(MIGRATED_KEY)) return;
    } catch {
      return;
    }
    const old = await readLegacy();
    if (old.length > 0) {
      const have = await getLocalDb("presentations").allDocs({ keys: old.map((p) => p.id) });
      for (let i = 0; i < old.length; i++) {
        const row = have.rows[i] as { error?: string; value?: { deleted?: boolean } };
        const clean = cleanPresentation(old[i] as unknown as Record<string, unknown>, old[i].slides);
        if (clean && (row.error === "not_found" || row.value?.deleted)) await putPresentation(clean);
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

const newestFirst = (a: StoredPresentation, b: StoredPresentation) => b.createdAt.localeCompare(a.createdAt);

/** All decks, newest first. `persistent` is false when only the in-memory fallback works. */
export async function listPresentations(): Promise<{ presentations: StoredPresentation[]; persistent: boolean }> {
  try {
    await migrateOnce();
    const res = await getLocalDb("presentations").allDocs({ include_docs: true, attachments: true, binary: true });
    const rows: StoredPresentation[] = [];
    for (const row of res.rows) {
      const d = row.doc as unknown as (Record<string, unknown> & { _attachments?: Record<string, { data?: unknown }> }) | undefined;
      if (!d || row.id.startsWith("_design/") || d.type !== "presentation") continue;
      const blob = d._attachments?.[ATTACHMENT]?.data;
      if (!(blob instanceof Blob)) continue;
      let slides: unknown = [];
      try {
        slides = JSON.parse(await blob.text());
      } catch {
        continue;
      }
      const p = cleanPresentation(d, slides);
      if (p) rows.push(p);
    }
    for (const r of memory.values()) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    return { presentations: rows.sort(newestFirst), persistent: true };
  } catch {
    return { presentations: [...memory.values()].sort(newestFirst), persistent: false };
  }
}

/** Returns false when it could only be kept in memory (lost on reload, e.g. storage full). */
export async function savePresentation(p: StoredPresentation): Promise<boolean> {
  try {
    await putPresentation(p);
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
    await removeDoc("presentations", id);
  } catch {
    /* in-memory only */
  }
}

/** Calls `onChange` when decks change (e.g. pulled from CouchDB). */
export const watchPresentations = (onChange: () => void) => watchLocal("presentations", onChange);
