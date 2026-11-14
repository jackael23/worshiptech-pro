/**
 * 2026-10-28 (Jarvis): PowerPoint decks imported by the user (Presentations tab).
 * Stored in IndexedDB like the Bibles — picture slides can be many MB, too big for localStorage.
 * Never sent to the server.
 * 2026-11-03b: storage = PouchDB + optional sync to the user's own CouchDB (see couchSync.ts).
 * 2026-11-14 (format v2): each picture is saved ONCE as its own attachment ("asset-a0", …) and the
 *   slides point to it (lib/dataUrlAssets.ts) — a background picture used to be written again for every
 *   slide (1.8 MB .pptx → 72 MB). The doc also keeps a small `thumb` + `searchText`, so the list no
 *   longer opens every deck: listPresentations() returns PresentationMeta, loadPresentation(id) the slides.
 *   Old (v1) decks are still read, and re-saved as v2 the first time the list sees them.
 */
import type { SlideContent } from "../types";
import { getLocalDb, upsertDoc, removeDoc, watchLocal } from "./couchSync";
import { packAssets, assetAttachments, unpackAssets } from "./dataUrlAssets";
import { makeThumb } from "./imageShrink";

export interface StoredPresentation {
  id: string;
  name: string;
  kind: "pptx" | "images";
  slides: SlideContent[];
  createdAt: string;
}

export const PRESENTATION_LIMITS = { MAX_PRESENTATIONS: 40 };

/** First slide, small enough for the list (no full-size pictures). */
export interface PresentationThumb {
  text: string;
  background: string;
  textColor?: string;
  /** Small JPEG (192×108) of the slide's picture / background picture. */
  image?: string;
}

/** What the list shows — the slides are loaded only when the deck is added to the schedule. */
export interface PresentationMeta {
  id: string;
  name: string;
  kind: "pptx" | "images";
  slideCount: number;
  createdAt: string;
  thumb: PresentationThumb;
  /** Labels + text of all slides (lowercase), for the search box. */
  searchText: string;
}

const FORMAT = 2;
const MAX_SEARCH_CHARS = 20_000;

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

const FIRST_DATA_URL_RE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/i;

/** List info of a deck (thumbnail of the first slide + text for search). */
export async function buildMeta(p: StoredPresentation): Promise<PresentationMeta> {
  const first = p.slides[0];
  const bg = first?.background || "#0f172a";
  const bgPicture = bg.match(FIRST_DATA_URL_RE)?.[0];
  const image = first?.image ? await makeThumb(first.image, true) : bgPicture ? await makeThumb(bgPicture) : undefined;
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    slideCount: p.slides.length,
    createdAt: p.createdAt,
    thumb: {
      text: (first?.text.split("\n")[0] || "").slice(0, 80),
      background: bgPicture ? "#0f172a" : bg.slice(0, 2000),
      textColor: first?.textColor,
      image,
    },
    searchText: p.slides
      .map((s) => `${s.label}\n${s.text}`)
      .join("\n")
      .toLowerCase()
      .slice(0, MAX_SEARCH_CHARS),
  };
}

function cleanMeta(d: Record<string, unknown>): PresentationMeta | null {
  const id = str(d._id, 80);
  if (!id || !/^ppt-[\w-]{1,70}$/.test(id) || d.v !== FORMAT) return null;
  const t = (d.thumb && typeof d.thumb === "object" ? d.thumb : {}) as Record<string, unknown>;
  const image = str(t.image, 200_000);
  return {
    id,
    name: str(d.name, 200) || "Presentation",
    kind: d.kind === "images" ? "images" : "pptx",
    slideCount: Math.max(0, Number(d.slideCount) || 0),
    createdAt: str(d.createdAt, 40) || new Date(0).toISOString(),
    thumb: {
      text: str(t.text, 80) ?? "",
      background: str(t.background, 2000) || "#0f172a",
      textColor: str(t.textColor, 40),
      image: image && /^data:image\/jpeg;base64,/.test(image) ? image : undefined,
    },
    searchText: str(d.searchText, MAX_SEARCH_CHARS) ?? "",
  };
}

async function putPresentation(p: StoredPresentation, meta?: PresentationMeta): Promise<PresentationMeta> {
  const m = meta || (await buildMeta(p));
  const { packed, assets } = packAssets(p.slides);
  await upsertDoc("presentations", {
    _id: p.id,
    type: "presentation",
    v: FORMAT,
    name: p.name,
    kind: p.kind,
    slideCount: p.slides.length,
    createdAt: p.createdAt,
    thumb: m.thumb,
    searchText: m.searchText,
    _attachments: {
      [ATTACHMENT]: { content_type: "application/json", data: new Blob([JSON.stringify(packed)], { type: "application/json" }) },
      ...assetAttachments(assets),
    },
  });
  return m;
}

type RawDoc = Record<string, unknown> & { _attachments?: Record<string, { content_type?: string; data?: unknown }> };

/** Full deck from a doc read with { attachments: true, binary: true } (v1 or v2). */
async function fromDoc(d: RawDoc): Promise<StoredPresentation | null> {
  const blob = d._attachments?.[ATTACHMENT]?.data;
  if (!(blob instanceof Blob)) return null;
  let slides: unknown;
  try {
    slides = JSON.parse(await blob.text());
  } catch {
    return null;
  }
  return cleanPresentation(d, await unpackAssets(slides, d._attachments));
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

const newestMeta = (a: PresentationMeta, b: PresentationMeta) => b.createdAt.localeCompare(a.createdAt);

/**
 * All decks (list info only), newest first. `persistent` is false when only the in-memory fallback works.
 * A deck still in the old format is opened once, re-saved in the new format, then listed.
 */
export async function listPresentations(): Promise<{ presentations: PresentationMeta[]; persistent: boolean }> {
  const fromMemory = async (skip: Set<string>) => {
    const out: PresentationMeta[] = [];
    for (const p of memory.values()) if (!skip.has(p.id)) out.push(await buildMeta(p));
    return out;
  };
  try {
    await migrateOnce();
    const db = getLocalDb("presentations");
    const res = await db.allDocs({ include_docs: true }); // attachment stubs only — the slides stay on disk
    const rows: PresentationMeta[] = [];
    for (const row of res.rows) {
      const d = row.doc as unknown as RawDoc | undefined;
      if (!d || row.id.startsWith("_design/") || d.type !== "presentation") continue;
      const meta = cleanMeta(d);
      if (meta) {
        rows.push(meta);
        continue;
      }
      // Old format (v1): open it, list it, and save it again in the new, smaller format.
      try {
        const full = await fromDoc((await db.get(row.id, { attachments: true, binary: true })) as unknown as RawDoc);
        if (!full) continue;
        const m = await buildMeta(full);
        rows.push(m);
        await putPresentation(full, m).catch(() => undefined);
      } catch {
        /* unreadable doc: skip */
      }
    }
    rows.push(...(await fromMemory(new Set(rows.map((r) => r.id)))));
    return { presentations: rows.sort(newestMeta), persistent: true };
  } catch {
    return { presentations: (await fromMemory(new Set())).sort(newestMeta), persistent: false };
  }
}

/** The whole deck (all slides with their pictures), or null when it is gone. */
export async function loadPresentation(id: string): Promise<StoredPresentation | null> {
  const mem = memory.get(id);
  if (mem) return mem;
  try {
    return await fromDoc((await getLocalDb("presentations").get(id, { attachments: true, binary: true })) as unknown as RawDoc);
  } catch {
    return null;
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
