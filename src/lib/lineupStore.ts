/**
 * 2026-11-16: saved lineups — keep several schedules (e.g. one per Sunday) and open them later,
 * so a service can be prepared ahead of time. Paid feature ("schedule" in lib/entitlements.ts).
 *  - The ONE working Schedule (lib/scheduleStore.ts) stays free; a lineup is a named copy of it.
 *  - Saved in this browser (PouchDB "wtp-lineups"). With cloud sync (Pro) it is one of the synced
 *    databases (lib/couchSync.ts), so the lineups follow the church to its other computers.
 *  - Same shape as the working schedule: items in one attachment, each picture once
 *    (lib/dataUrlAssets.ts), so a lineup with PPT slides does not balloon.
 */
import type { ScheduleItem } from "../types";
import { cleanItems } from "./scheduleStore";
import { getLocalDb, watchLocal } from "./couchSync";
import { packAssets, assetAttachments, unpackAssets } from "./dataUrlAssets";

const ATTACHMENT = "schedule.json";
const CURRENT_KEY = "wtp.lineup.current.v1";
const ID_RE = /^lineup-[\w-]{1,60}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LINEUP_NAME_MAX = 80;
export const MAX_LINEUPS = 200;

export interface LineupMeta {
  id: string;
  name: string;
  /** Day of the service, "YYYY-MM-DD" ("" = no date). */
  serviceDate: string;
  savedAt: string;
  count: number;
}

const getDb = () => getLocalDb("lineups");

/** Calls `onChange` when the saved lineups change, e.g. pulled in by sync from another computer. */
export const watchLineups = (onChange: () => void) => watchLocal("lineups", onChange);

function toMeta(doc: Record<string, unknown>): LineupMeta | null {
  const id = typeof doc._id === "string" && ID_RE.test(doc._id) ? doc._id : null;
  const name = typeof doc.name === "string" ? doc.name.trim().slice(0, LINEUP_NAME_MAX) : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    serviceDate: typeof doc.serviceDate === "string" && DATE_RE.test(doc.serviceDate) ? doc.serviceDate : "",
    savedAt: typeof doc.savedAt === "string" ? doc.savedAt : "",
    count: Number.isInteger(doc.count) && (doc.count as number) >= 0 ? (doc.count as number) : 0,
  };
}

/** Newest service first; lineups without a date go last (newest save first). */
const byService = (a: LineupMeta, b: LineupMeta) => b.serviceDate.localeCompare(a.serviceDate) || b.savedAt.localeCompare(a.savedAt);

/** Names and dates only (the items are not read). Empty list when storage is unavailable. */
export async function listLineups(): Promise<LineupMeta[]> {
  try {
    const res = await getDb().allDocs({ include_docs: true });
    return res.rows.map((r) => (r.doc ? toMeta(r.doc as unknown as Record<string, unknown>) : null)).filter((m): m is LineupMeta => m !== null).sort(byService);
  } catch {
    return [];
  }
}

/** Saves `items` as a lineup. With `id` it replaces that lineup; without, a new one is made. */
export async function saveLineup(input: { id?: string; name: string; serviceDate: string; items: ScheduleItem[] }): Promise<LineupMeta | null> {
  const name = input.name.trim().slice(0, LINEUP_NAME_MAX);
  if (!name || input.items.length === 0) return null;
  const id = input.id && ID_RE.test(input.id) ? input.id : `lineup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const d = getDb();
    let rev: string | undefined;
    try {
      rev = (await d.get(id))._rev;
    } catch {
      if (!input.id && (await d.info()).doc_count >= MAX_LINEUPS) return null;
    }
    const { packed, assets } = packAssets(input.items);
    const meta: LineupMeta = { id, name, serviceDate: DATE_RE.test(input.serviceDate) ? input.serviceDate : "", savedAt: new Date().toISOString(), count: input.items.length };
    await d.put({
      _id: id,
      ...(rev ? { _rev: rev } : {}),
      type: "lineup",
      name: meta.name,
      serviceDate: meta.serviceDate,
      savedAt: meta.savedAt,
      count: meta.count,
      _attachments: {
        [ATTACHMENT]: { content_type: "application/json", data: new Blob([JSON.stringify(packed)], { type: "application/json" }) },
        ...assetAttachments(assets),
      },
    });
    return meta;
  } catch (err) {
    console.warn("[lineupStore] could not save the lineup", err);
    return null;
  }
}

/** The items of a saved lineup (checked the same way as the working schedule). Null = gone / unreadable. */
export async function loadLineup(id: string): Promise<ScheduleItem[] | null> {
  if (!ID_RE.test(id)) return null;
  try {
    const doc = (await getDb().get(id, { attachments: true, binary: true })) as unknown as {
      _attachments?: Record<string, { content_type?: string; data?: unknown }>;
    };
    const blob = doc._attachments?.[ATTACHMENT]?.data;
    if (!(blob instanceof Blob)) return null;
    const items = cleanItems(await unpackAssets(JSON.parse(await blob.text()), doc._attachments));
    return items && items.length > 0 ? items : null;
  } catch {
    return null;
  }
}

export async function deleteLineup(id: string): Promise<boolean> {
  try {
    const d = getDb();
    await d.remove(await d.get(id));
    return true;
  } catch {
    return false;
  }
}

/** The lineup the working Schedule was last opened from / saved to ("" = none). */
export function getCurrentLineupId(): string {
  try {
    const v = window.localStorage.getItem(CURRENT_KEY) || "";
    return ID_RE.test(v) ? v : "";
  } catch {
    return "";
  }
}

export function setCurrentLineupId(id: string): void {
  try {
    if (id) window.localStorage.setItem(CURRENT_KEY, id);
    else window.localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* ignore */
  }
}

/** The coming Sunday (today when it is Sunday), as "YYYY-MM-DD" in local time. */
export function nextSunday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + ((7 - from.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
