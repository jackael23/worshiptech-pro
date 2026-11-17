/**
 * 2026-11-03c (Jarvis): keeps the Simulator's Schedule until the user changes or removes items.
 * Before, it went back to the sample schedule on every reload and when leaving the Simulator tab.
 *  - Saved in this browser only (PouchDB "wtp-schedule", NOT synced to CouchDB — Option A).
 *  - Items are saved as one attachment, because picture slides (PPT images) can be several MB.
 *  - The selected item is a small number, kept in localStorage.
 *  - A copy stays in memory, so coming back to the Simulator tab shows it at once.
 * On-air state (LIVE / Black / Logo) is NOT saved: after a reload nothing goes to the projector by itself.
 * 2026-11-14: pictures are saved once each as their own attachment (lib/dataUrlAssets.ts) — a PPT item's
 *   background picture used to be written again for every slide. Old saves are still read.
 */
import PouchDB from "pouchdb-browser";
import type { BackgroundSettings, ScheduleItem, SlideContent } from "../types";
import { SONG_ID_RE } from "./scheduleSync";
import { packAssets, assetAttachments, unpackAssets } from "./dataUrlAssets";

const DB_NAME = "wtp-schedule";
const DOC_ID = "current";
const ATTACHMENT = "schedule.json";
const SELECTED_KEY = "wtp.schedule.selected.v1";
const ALL_BG_KEY = "wtp.schedule.allBg.v1";
const MAX_ITEMS = 300;
const TYPES: ScheduleItem["type"][] = ["song", "scripture", "presentation", "media", "alert"];

let db: PouchDB.Database | null = null;
const getDb = () => (db ??= new PouchDB(DB_NAME, { auto_compaction: true }));

let cache: ScheduleItem[] | null = null;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);

function cleanSlide(raw: unknown): SlideContent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const image = str(o.image, 40_000_000);
  return {
    label: str(o.label, 200) ?? "",
    text: str(o.text, 20_000) ?? "",
    image: image && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image) ? image : undefined,
    background: str(o.background, 40_000_000),
    textColor: str(o.textColor, 40),
    notes: str(o.notes, 20_000),
    // 2026-11-08: chords for the Stage screen (dropped here before, so they vanished after a reload)
    chords: str(o.chords, 20_000),
  };
}

/** Light check of what was saved (keeps unknown-but-valid fields such as textStyle / bgSettings). */
export function cleanItems(v: unknown): ScheduleItem[] | null {
  if (!Array.isArray(v)) return null;
  const out: ScheduleItem[] = [];
  for (const raw of v.slice(0, MAX_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = str(o.id, 120);
    const title = str(o.title, 300);
    const type = TYPES.includes(o.type as ScheduleItem["type"]) ? (o.type as ScheduleItem["type"]) : null;
    const slides = Array.isArray(o.slides) ? o.slides.map(cleanSlide).filter((s): s is SlideContent => s !== null) : [];
    if (!id || title === undefined || !type || slides.length === 0) continue;
    const item: ScheduleItem = {
      ...(o as unknown as ScheduleItem),
      id,
      title,
      type,
      slides,
      activeSlideIndex: Math.min(Math.max(0, Number(o.activeSlideIndex) || 0), slides.length - 1),
      background: str(o.background, 40_000_000),
      notes: str(o.notes, 20_000),
      // 2026-11-05: id of the Media-tab picture / video used as background
      bgMediaId: typeof o.bgMediaId === "string" && /^(img|vid)-[\w-]{1,70}$/.test(o.bgMediaId) ? o.bgMediaId : undefined,
      // 2026-11-07: My Song this item follows (lib/scheduleSync.ts)
      songId: type === "song" && typeof o.songId === "string" && SONG_ID_RE.test(o.songId) ? o.songId : undefined,
      // 2026-11-08: song key for the Stage screen
      songKey: str(o.songKey, 8),
      // 2026-11-14: song background this item follows + "para sa schedule na ito lang" marker
      songBg: str(o.songBg, 400),
      songUnlinked: o.songUnlinked === true ? true : undefined,
    };
    out.push(item);
  }
  return out;
}

/** The schedule kept in memory from earlier in this page (null = not loaded yet). */
export const getCachedSchedule = (): ScheduleItem[] | null => cache;

/** Reads the saved schedule. Null = nothing saved yet (first run) or storage unavailable. */
export async function loadSchedule(): Promise<ScheduleItem[] | null> {
  if (cache) return cache;
  try {
    const doc = (await getDb().get(DOC_ID, { attachments: true, binary: true })) as unknown as {
      _attachments?: Record<string, { content_type?: string; data?: unknown }>;
    };
    const blob = doc._attachments?.[ATTACHMENT]?.data;
    if (!(blob instanceof Blob)) return null;
    const items = cleanItems(await unpackAssets(JSON.parse(await blob.text()), doc._attachments));
    if (items && items.length > 0) cache = items;
    return cache;
  } catch {
    return null; // 404 on first run, or blocked storage
  }
}

// Saves are coalesced: while one write runs, only the newest schedule waits for the next write.
let writing = false;
let pending: ScheduleItem[] | null = null;

async function writeLoop(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    while (pending) {
      const items = pending;
      pending = null;
      try {
        const d = getDb();
        let rev: string | undefined;
        try {
          rev = (await d.get(DOC_ID))._rev;
        } catch {
          /* first save */
        }
        const { packed, assets } = packAssets(items);
        const doc = {
          _id: DOC_ID,
          ...(rev ? { _rev: rev } : {}),
          savedAt: new Date().toISOString(),
          count: items.length,
          _attachments: {
            [ATTACHMENT]: { content_type: "application/json", data: new Blob([JSON.stringify(packed)], { type: "application/json" }) },
            ...assetAttachments(assets),
          },
        };
        await d.put(doc);
      } catch (err) {
        console.warn("[scheduleStore] could not save the schedule", err);
      }
    }
  } finally {
    writing = false;
  }
}

/** Saves the schedule (in memory right away, in the browser database just after). */
export function saveSchedule(items: ScheduleItem[]): void {
  cache = items;
  pending = items;
  void writeLoop();
}

export function loadSelectedIndex(): number {
  try {
    const n = Number(window.localStorage.getItem(SELECTED_KEY));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

export function saveSelectedIndex(i: number): void {
  try {
    window.localStorage.setItem(SELECTED_KEY, String(i));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- whole-schedule background (2026-11-17)

/**
 * 2026-11-17 (Jarvis): "Buong schedule" background — one background for every item, also for items
 * added later. Only its id is remembered ("bg-…" built-in, "img-…" / "vid-…" Media upload) plus
 * dim / fit / blur; the picture itself stays in the media database.
 */
export interface ScheduleBgChoice {
  id: string;
  bgSettings: BackgroundSettings;
}
const ALL_BG_ID_RE = /^(bg|img|vid)-[\w-]{1,70}$/;

export function loadScheduleBg(): ScheduleBgChoice | null {
  try {
    const o = JSON.parse(window.localStorage.getItem(ALL_BG_KEY) || "null") as { id?: unknown; bgSettings?: Record<string, unknown> } | null;
    if (!o || typeof o.id !== "string" || !ALL_BG_ID_RE.test(o.id)) return null;
    const b = o.bgSettings || {};
    const num = (x: unknown, min: number, max: number) => (typeof x === "number" && isFinite(x) ? Math.min(max, Math.max(min, x)) : min);
    return { id: o.id, bgSettings: { dim: num(b.dim, 0, 0.7), blur: Math.round(num(b.blur, 0, 20)), fit: b.fit === "contain" ? "contain" : "cover" } };
  } catch {
    return null;
  }
}

export function saveScheduleBg(c: ScheduleBgChoice | null): void {
  try {
    if (c) window.localStorage.setItem(ALL_BG_KEY, JSON.stringify(c));
    else window.localStorage.removeItem(ALL_BG_KEY);
  } catch {
    /* ignore: stays for this page only */
  }
}
