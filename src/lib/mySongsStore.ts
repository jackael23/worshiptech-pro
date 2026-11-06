/**
 * 2026-10-20 (Jarvis): "My Songs" — songs the USER types/pastes in.
 * Saved only in this browser (localStorage). Never sent to the server or the AI.
 * 2026-11-03: storage moved to PouchDB + optional CouchDB sync (see songsDb.ts). The functions
 * here (sanitize, import/export, upsert) are still used; loadMySongs() = old list, for migration.
 * The app ships no copyrighted lyrics; the user's church licence (e.g. CCLI) covers their use.
 */
import { SongItem, BackgroundSettings } from "../types";
import { parseLyrics } from "./lyricsParser";

export const MY_SONGS_STORAGE_KEY = "wtp.mySongs.v1";
export const MY_SONGS_LIMITS = {
  MAX_SONGS: 5000, // 2026-11-03: was 200 (localStorage); now PouchDB/CouchDB
  MAX_LYRICS: 10000,
  MAX_TITLE: 120,
  MAX_FIELD: 80, // author, key, ccli
  MAX_IMPORT_BYTES: 20 * 1024 * 1024, // 2026-11-03: was 2 MB
};
export const USER_SONG_BACKGROUND = "linear-gradient(135deg, #334155 0%, #0f172a 100%)";

export interface StoredSong {
  id: string;
  title: string;
  author: string;
  key: string;
  ccli: string;
  copyright?: string; // 2026-10-20: e.g. "© 2016 Hillsong Music Publishing" (from SongSelect imports)
  lyrics: string; // raw text, so editing keeps the user's formatting
  /** 2026-11-06: own background — id only ("bg-…" built-in, "img-…"/"vid-…" Media upload), never the file itself. */
  bgId?: string;
  bgSettings?: BackgroundSettings;
  createdAt: string;
  updatedAt: string;
}

export type SongDraft = Pick<StoredSong, "title" | "author" | "key" | "ccli" | "copyright" | "lyrics" | "bgId" | "bgSettings">;

/** 2026-11-06: background ids that may be stored on a song. */
export const SONG_BG_ID_RE = /^(bg|img|vid)-[\w-]{1,70}$/; // same id rule as scheduleStore

/** Cleans background settings (dim 0–0.7, blur 0–20, fit cover/contain). */
export function sanitizeBgSettings(v: unknown): BackgroundSettings | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const num = (x: unknown, min: number, max: number) => (typeof x === "number" && isFinite(x) ? Math.min(max, Math.max(min, x)) : min);
  return { dim: num(o.dim, 0, 0.7), blur: Math.round(num(o.blur, 0, 20)), fit: o.fit === "contain" ? "contain" : "cover" };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function newSongId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `user-${rand}`;
}

/** Cleans one song from storage/import. Returns null if it is not usable. */
export function sanitizeSong(input: unknown): StoredSong | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const title = str(o.title, MY_SONGS_LIMITS.MAX_TITLE);
  const lyrics = typeof o.lyrics === "string" ? o.lyrics.replace(/\r\n?/g, "\n").slice(0, MY_SONGS_LIMITS.MAX_LYRICS) : "";
  if (!title || !lyrics.trim() || parseLyrics(lyrics).length === 0) return null;
  const now = new Date().toISOString();
  const id = typeof o.id === "string" && /^user-[\w-]{1,80}$/.test(o.id) ? o.id : newSongId();
  return {
    id,
    title,
    author: str(o.author, MY_SONGS_LIMITS.MAX_FIELD),
    key: str(o.key, 8),
    ccli: str(o.ccli, MY_SONGS_LIMITS.MAX_FIELD),
    copyright: str(o.copyright, 300) || undefined,
    lyrics,
    ...(typeof o.bgId === "string" && SONG_BG_ID_RE.test(o.bgId) ? { bgId: o.bgId, bgSettings: sanitizeBgSettings(o.bgSettings) } : {}),
    createdAt: str(o.createdAt, 40) || now,
    updatedAt: str(o.updatedAt, 40) || now,
  };
}

/** Reads My Songs. `available` is false when the browser blocks storage (e.g. private mode). */
export function loadMySongs(): { songs: StoredSong[]; available: boolean } {
  try {
    const raw = window.localStorage.getItem(MY_SONGS_STORAGE_KEY);
    if (!raw) return { songs: [], available: true };
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    const songs = list
      .map(sanitizeSong)
      .filter((s): s is StoredSong => s !== null)
      .slice(0, MY_SONGS_LIMITS.MAX_SONGS);
    return { songs, available: true };
  } catch {
    return { songs: [], available: false };
  }
}

/** Saves My Songs. Returns false if the browser refused (blocked or full). */
export function saveMySongs(songs: StoredSong[]): boolean {
  try {
    window.localStorage.setItem(MY_SONGS_STORAGE_KEY, JSON.stringify(songs));
    return true;
  } catch {
    return false;
  }
}

export function toSongItem(s: StoredSong): SongItem {
  return {
    id: s.id,
    title: s.title,
    author: s.author || undefined,
    key: s.key || undefined,
    ccli: s.ccli || undefined,
    slides: parseLyrics(s.lyrics),
    defaultBackground: USER_SONG_BACKGROUND,
    source: "user",
    bgId: s.bgId,
    bgSettings: s.bgSettings,
  };
}

export function exportMySongsJson(songs: StoredSong[]): string {
  return JSON.stringify(
    {
      app: "WorshipTech-Pro",
      type: "my-songs",
      version: 1,
      exportedAt: new Date().toISOString(),
      songs,
    },
    null,
    2,
  );
}

export interface ImportResult {
  songs: StoredSong[];
  added: number;
  updated: number;
  skipped: number;
  error?: string;
}

/** Merges an exported file into the current list: same id = replace, new id = add. */
export function importMySongsJson(text: string, current: StoredSong[]): ImportResult {
  const fail = (error: string): ImportResult => ({ songs: current, added: 0, updated: 0, skipped: 0, error });
  if (text.length > MY_SONGS_LIMITS.MAX_IMPORT_BYTES) return fail("Masyadong malaki ang file (max 20 MB).");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("Hindi mabasa ang file. Siguraduhing .json export ito ng WorshipTech-Pro.");
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { songs?: unknown }).songs)
      ? (data as { songs: unknown[] }).songs
      : null;
  if (!list) return fail("Walang kantang nakita sa file.");

  const result = [...current];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of list) {
    const song = sanitizeSong(item);
    if (!song) {
      skipped++;
      continue;
    }
    const idx = result.findIndex((s) => s.id === song.id);
    if (idx >= 0) {
      result[idx] = song;
      updated++;
    } else if (result.length < MY_SONGS_LIMITS.MAX_SONGS) {
      result.push(song);
      added++;
    } else {
      skipped++;
    }
  }
  return { songs: result, added, updated, skipped };
}

/**
 * 2026-10-20: adds songs read from SongSelect / ChordPro files.
 * Same CCLI # (or, without one, same title + author) = update the existing My Song; otherwise add.
 */
const songKeyOf = (s: { title: string; author?: string }) => `${s.title.trim().toLowerCase()}|${(s.author || "").trim().toLowerCase()}`;
/** Same CCLI # (or, without one, same title + author) = the same song. */
function findSameSong(list: StoredSong[], song: { title: string; author?: string; ccli?: string }): number {
  const ccli = (song.ccli || "").trim();
  return list.findIndex((s) => (ccli && s.ccli === ccli) || (!ccli && songKeyOf(s) === songKeyOf(song)));
}

export type UpsertStatus = "new" | "update" | "invalid" | "full";

/**
 * 2026-11-06 (Bulk Add preview): what upsertSongs WOULD do with each draft, without saving.
 * A song repeated inside the same batch shows as "update" (the later copy wins), like upsertSongs.
 */
export function planUpsert(current: StoredSong[], drafts: SongDraft[]): UpsertStatus[] {
  const sim: StoredSong[] = [...current];
  const now = new Date().toISOString();
  return drafts.map((d) => {
    const clean = sanitizeSong({ ...d, id: newSongId(), createdAt: now, updatedAt: now });
    if (!clean) return "invalid";
    if (findSameSong(sim, clean) >= 0) return "update";
    if (sim.length >= MY_SONGS_LIMITS.MAX_SONGS) return "full";
    sim.push(clean);
    return "new";
  });
}

export function upsertSongs(current: StoredSong[], drafts: SongDraft[]): { songs: StoredSong[]; added: number; updated: number; skipped: number } {
  const result = [...current];
  let added = 0;
  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  for (const d of drafts) {
    const clean = sanitizeSong({ ...d, id: newSongId(), createdAt: now, updatedAt: now });
    if (!clean) {
      skipped++;
      continue;
    }
    const idx = findSameSong(result, clean);
    if (idx >= 0) {
      const old = result[idx];
      // 2026-11-06: a re-import without a background keeps the song's background.
      const bg = clean.bgId ? {} : { bgId: old.bgId, bgSettings: old.bgSettings };
      result[idx] = { ...clean, ...bg, id: old.id, createdAt: old.createdAt };
      updated++;
    } else if (result.length < MY_SONGS_LIMITS.MAX_SONGS) {
      result.push(clean);
      added++;
    } else {
      skipped++;
    }
  }
  return { songs: result, added, updated, skipped };
}
