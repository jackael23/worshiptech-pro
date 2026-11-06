/**
 * 2026-11-06 (Jarvis): Bulk Add — many songs in one big paste (or one plain .txt file).
 *
 *   Amazing Grace            ← first line = title ("Title: Amazing Grace" also works)
 *   Author: John Newton      ← optional meta lines right after the title
 *   Key: G                     (Author/Artist, Key, CCLI, Copyright)
 *
 *   Verse 1                  ← lyrics: same rules as the single-song editor (lyricsParser)
 *   Amazing grace how sweet the sound
 *   ---                      ← a line of --- (or ===) separates songs
 *   Holy, Holy, Holy
 *   ...
 *
 * A line starting with "Title:" also starts a new song, so "---" is optional when every song
 * has a "Title:" line. Pure functions (no DOM) so they can be tested on their own.
 * 2026-11-06 (b): each song also knows where it sits in the text (line / endLine / lyricsStart), so
 * Bulk Add can rewrite one song in the box after editing it, and highlight a slide's lines.
 */
import { SongDraft, MY_SONGS_LIMITS } from "./mySongsStore";
import { asSectionLabel, parseLyrics } from "./lyricsParser";

export interface BulkSong {
  /** 1-based line number where this song starts in the pasted text (for error messages). */
  line: number;
  /** 1-based line number of the song's last non-blank line (paste mode). */
  endLine?: number;
  /** Character offset (in the \n-normalized text) where the lyrics start; -1 = no lyrics (paste mode). */
  lyricsStart?: number;
  draft: SongDraft;
  slideCount: number;
  /** Set when the song cannot be saved (no title, no lyrics, too long). */
  error?: string;
  /** Optional source, e.g. a file name from folder import. */
  source?: string;
}

export const MAX_BULK_CHARS = 2 * 1024 * 1024; // 2 MB of pasted text
export const MAX_BULK_SONGS = 1000;

const SEPARATOR_RE = /^\s*(?:-{3,}|={3,})\s*$/;
const TITLE_RE = /^\s*title\s*[:=]\s*(.*)$/i;
const META_RE = /^\s*(author|artist|writer|key|ccli(?:\s*(?:#|no\.?|number|song\s*#?))?|copyright|©)\s*[:=]\s*(.*)$/i;

function emptyDraft(): SongDraft {
  return { title: "", author: "", key: "", ccli: "", copyright: "", lyrics: "" };
}

/** 2026-11-06 (b): slide count + error message of one song (same rules for paste, folder and edits). */
export function validateDraft(d: SongDraft): { slideCount: number; error?: string } {
  const slideCount = parseLyrics(d.lyrics).length;
  let error: string | undefined;
  if (!d.title.trim()) error = "Walang title (ang unang linya ang title).";
  else if (d.lyrics.length > MY_SONGS_LIMITS.MAX_LYRICS) error = `Sobrang haba ng lyrics (${d.lyrics.length}/${MY_SONGS_LIMITS.MAX_LYRICS} characters).`;
  else if (slideCount === 0) error = "Walang lyrics.";
  return { slideCount, error };
}

/** Parses one song block (lines between separators). */
function parseBlock(lines: string[], startLine: number, fallbackTitle: string | undefined, lineOffsets: number[]): BulkSong | null {
  // Skip blank lines at the start.
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return null; // empty block = nothing pasted here
  const line = startLine + i;
  const d = emptyDraft();

  const first = lines[i].trim();
  const titleMatch = first.match(TITLE_RE);
  if (titleMatch) {
    d.title = titleMatch[1].trim();
    i++;
  } else if (asSectionLabel(first) || META_RE.test(first)) {
    // No title line ("Verse 1" or "Author:" first) → use the file name if we have one.
    d.title = fallbackTitle || "";
  } else {
    d.title = first;
    i++;
  }

  // Meta lines directly after the title (blank lines between are allowed).
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) {
      i++;
      continue;
    }
    const m = t.match(META_RE);
    if (!m) break;
    const name = m[1].toLowerCase();
    const val = m[2].trim();
    if (name === "author" || name === "artist" || name === "writer") d.author = d.author || val;
    else if (name === "key") d.key = d.key || val;
    else if (name.startsWith("ccli")) d.ccli = d.ccli || (val.match(/\d+/) || [val])[0];
    else d.copyright = d.copyright || (name === "©" ? `© ${val}` : val);
    i++;
  }

  const lyricsJoined = lines.slice(i).join("\n");
  const rawLyrics = lyricsJoined.replace(/^\n+|\s+$/g, "");
  const leadingNewlines = (lyricsJoined.match(/^\n*/) || [""])[0].length;
  const lyricsLineIdx = startLine - 1 + i;
  const lyricsStart = rawLyrics && lyricsLineIdx < lineOffsets.length ? lineOffsets[lyricsLineIdx] + leadingNewlines : -1;
  let last = lines.length - 1;
  while (last > 0 && !lines[last].trim()) last--;
  const endLine = startLine + last;
  d.title = d.title.slice(0, MY_SONGS_LIMITS.MAX_TITLE);
  d.author = d.author.slice(0, MY_SONGS_LIMITS.MAX_FIELD);
  d.key = d.key.slice(0, 8);
  d.ccli = d.ccli.slice(0, MY_SONGS_LIMITS.MAX_FIELD);
  d.copyright = (d.copyright || "").slice(0, 300);
  d.lyrics = rawLyrics;

  const { slideCount, error } = validateDraft(d);
  return { line, endLine, lyricsStart, draft: d, slideCount, error };
}

/**
 * Splits pasted text into songs. Empty blocks (e.g. "---" at the start or end) are ignored.
 * `fallbackTitle` is used when a block has no title line (e.g. the file name of a .txt file).
 */
export function parseBulkText(text: string, fallbackTitle?: string): { songs: BulkSong[]; error?: string } {
  if (text.length > MAX_BULK_CHARS) return { songs: [], error: "Sobrang haba ng na-paste (max 2 MB). Hatiin sa ilang batch." };
  const all = (text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const lineOffsets: number[] = [];
  let off = 0;
  for (const l of all) {
    lineOffsets.push(off);
    off += l.length + 1;
  }
  const songs: BulkSong[] = [];
  let block: string[] = [];
  let blockStart = 1;

  const flush = () => {
    const s = parseBlock(block, blockStart, fallbackTitle, lineOffsets);
    if (s) songs.push(s);
    block = [];
  };

  all.forEach((raw, idx) => {
    if (SEPARATOR_RE.test(raw)) {
      flush();
      blockStart = idx + 2;
      return;
    }
    // "Title:" starts a new song, unless the current block has only blank lines so far.
    if (TITLE_RE.test(raw) && block.some((l) => l.trim())) {
      flush();
      blockStart = idx + 1;
    }
    if (block.length === 0) blockStart = idx + 1;
    block.push(raw);
  });
  flush();

  if (songs.length > MAX_BULK_SONGS) {
    return { songs: songs.slice(0, MAX_BULK_SONGS), error: `Max ${MAX_BULK_SONGS} kanta bawat batch; ang sobra ay hindi isinama.` };
  }
  return { songs };
}

/**
 * 2026-11-06 (b): writes one song back as Bulk Add text:
 * title ("Title: …" when the title would otherwise be read as a label / meta / separator),
 * then Author/Key/CCLI/Copyright lines that have a value, a blank line, and the lyrics.
 */
export function serializeSong(d: SongDraft): string {
  const t = d.title.trim();
  const needsPrefix = !t || !!asSectionLabel(t) || META_RE.test(t) || SEPARATOR_RE.test(t) || TITLE_RE.test(t);
  const out = [needsPrefix ? `Title: ${t}` : t];
  if (d.author.trim()) out.push(`Author: ${d.author.trim()}`);
  if (d.key.trim()) out.push(`Key: ${d.key.trim()}`);
  if (d.ccli.trim()) out.push(`CCLI: ${d.ccli.trim()}`);
  if ((d.copyright || "").trim()) out.push(`Copyright: ${(d.copyright || "").trim()}`);
  out.push("");
  out.push(d.lyrics.replace(/\r\n?/g, "\n").replace(/\s+$/, ""));
  return out.join("\n");
}

/**
 * Replaces one song (found by parseBulkText on this same text) with an edited version.
 * Returns the text unchanged when the song cannot be located (e.g. the text changed meanwhile).
 */
export function replaceSongInText(text: string, song: Pick<BulkSong, "line" | "endLine">, d: SongDraft): string {
  const lines = (text || "").replace(/\r\n?/g, "\n").split("\n");
  const from = song.line - 1;
  const to = (song.endLine ?? song.line) - 1;
  if (from < 0 || to < from || to >= lines.length) return text;
  return [...lines.slice(0, from), ...serializeSong(d).split("\n"), ...lines.slice(to + 1)].join("\n");
}
