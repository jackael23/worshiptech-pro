/**
 * 2026-11-08: PowerPoint (.pptx) → song for My Songs.
 *
 * Reuses readPptx() (lib/pptxImport.ts) to get the text of every slide, then builds the song's
 * lyrics the way the Song editor wants them: one slide = one block of lines, a blank line between
 * slides. A slide whose first line is "Verse 1" / "Chorus" … keeps that label (lyricsParser does the rest).
 *
 *  - Title = the file name. If the first slide only repeats the title, it is dropped.
 *  - Empty / black slides and hidden slides are skipped. Text only: fonts, pictures and backgrounds
 *    of the PPT are not kept (the song uses the app's own theme/background).
 *  - Nothing is saved here; the result goes to the same preview as Bulk Add / Import folder.
 *
 * 2026-11-14: one PPT with SEVERAL songs (a Sunday line-up) is split into one song each.
 * Where a song starts is guessed from, in this order (the first rule that fits wins):
 *   A. "header" — the song title sits in the title box of every lyric slide ("Way Maker" on top,
 *      lyrics below) and changes when the next song begins;
 *   B. "titleSlides" — 2+ Title Slide / Section Header slides (short text: title, maybe the author);
 *   C. "blanks" — songs separated by empty slides, and at least 2 of the parts begin with a
 *      one-line title slide.
 * Nothing fits → one song per file, exactly as before. The user can also turn splitting off in the
 * preview ("Huwag hatiin"), see SongLibrary.
 */
import { readPptx } from "./pptxImport";
import { validateDraft, BulkSong } from "./bulkPaste";
import { asSectionLabel } from "./lyricsParser";

export const PPTX_SONG_EXTENSIONS = [".pptx"];

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Slide text → clean lines (no blank lines inside a slide, trailing spaces removed). */
function slideLines(text: string): string[] {
  return text
    .replace(/\r\n?|\u000b/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// ---------- splitting (pure, no DOM) ----------

/** One slide, as the splitter sees it. */
export interface SlideRec {
  /** All text lines of the slide (empty = blank / picture-only slide). */
  lines: string[];
  /** First line of the title placeholder ("" = none). */
  header: string;
  /** Lines of everything except the title placeholder. */
  bodyLines: string[];
  /** PowerPoint layout type ("title", "secHead", "obj", ...). */
  layout: string;
  titleKind: "" | "title" | "ctrTitle";
}

export type SplitHow = "header" | "titleSlides" | "blanks";

export interface SplitSong {
  title: string;
  author: string;
  blocks: string[][];
}

const isLabel = (line: string) => !!asSectionLabel(line);
const AUTHOR_RE = /^(?:(?:words\s+(?:and|&)\s+music|words|music|lyrics)\s+by|by|ni|[-–—•]|©)\s*[:\-]?\s*/i;

/** Short text that can be a song title (+ author line). */
function titleLike(lines: string[]): boolean {
  if (lines.length < 1 || lines.length > 3) return false;
  if (lines[0].length > 80 || lines.join(" ").length > 140) return false;
  return !isLabel(lines[0]);
}

/** Stricter, for slides with no layout info: one line, or a line + "by …". */
function titleLikeStrict(lines: string[]): boolean {
  if (!titleLike(lines) || lines[0].length > 60 || /[,;]$/.test(lines[0])) return false;
  return lines.length === 1 || (lines.length === 2 && AUTHOR_RE.test(lines[1]));
}

function isTitleSlide(r: SlideRec): boolean {
  return (r.layout === "title" || r.layout === "secHead" || r.titleKind === "ctrTitle") && titleLike(r.lines);
}

/** "1. Way Maker" → "Way Maker". */
const cleanTitle = (s: string) => s.replace(/^\s*\d{1,2}\s*[.)\-:]\s+/, "").trim().slice(0, 200);
const cleanAuthor = (s: string | undefined) => (s ? s.replace(AUTHOR_RE, "").trim().slice(0, 100) : "");

/** Header used by rule A: a real title (not "Verse 1") above lyrics on the same slide. */
const headerOf = (r: SlideRec) => (r.header && !isLabel(r.header) && r.bodyLines.length > 0 ? r.header : "");

/**
 * Splits a deck into songs. Returns null when the deck looks like ONE song (or nothing fits),
 * so the caller keeps the old one-song-per-file behavior.
 */
export function splitSlidesIntoSongs(recs: SlideRec[]): { songs: SplitSong[]; how: SplitHow } | null {
  const filled = recs.filter((r) => r.lines.length > 0);
  if (filled.length < 2) return null;

  // Rule A: the song title on top of the lyric slides.
  const headers = filled.map(headerOf);
  const distinct = new Set(headers.filter(Boolean).map(norm));
  const withHeader = headers.filter(Boolean).length;
  const repeats = headers.some((h, i) => h && i + 1 < headers.length && norm(h) === norm(headers[i + 1]));
  let how: SplitHow | null = null;
  if (distinct.size >= 2 && repeats && withHeader >= filled.length / 2) how = "header";

  // Rule B: two or more Title Slide / Section Header slides.
  if (!how && filled.filter(isTitleSlide).length >= 2) how = "titleSlides";

  // Rule C: parts separated by blank slides, 2+ of them starting with a title-only slide.
  if (!how) {
    const parts: SlideRec[][] = [[]];
    for (const r of recs) {
      if (r.lines.length === 0) {
        if (parts[parts.length - 1].length) parts.push([]);
      } else parts[parts.length - 1].push(r);
    }
    const real = parts.filter((p) => p.length > 0);
    const titled = real.filter((p) => p.length >= 2 && titleLikeStrict(p[0].lines)).length;
    if (real.length >= 2 && titled >= 2) how = "blanks";
  }
  if (!how) return null;

  const songs: SplitSong[] = [];
  let cur: SplitSong | null = null;
  const start = (title: string, author = ""): SplitSong => {
    const s: SplitSong = { title: cleanTitle(title), author: cleanAuthor(author), blocks: [] };
    songs.push(s);
    return s;
  };

  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.lines.length === 0) {
      if (how === "blanks") cur = null; // a blank slide ends the song
      continue;
    }
    if (isTitleSlide(r)) {
      // Title placeholder (if any) = title; the other line(s) = author.
      const title = r.header || r.lines[0];
      cur = start(title, r.lines.find((l) => norm(l) !== norm(title)));
      continue;
    }
    const h = how === "header" ? headerOf(r) : "";
    if (h) {
      if (!cur || norm(cur.title) !== norm(cleanTitle(h))) cur = start(h);
      cur.blocks.push(r.bodyLines);
      continue;
    }
    if (!cur) {
      const next = recs[i + 1];
      if (how === "blanks" && titleLikeStrict(r.lines) && next && next.lines.length > 0) {
        cur = start(r.lines[0], r.lines[1]);
        continue;
      }
      cur = start("");
    }
    const c: SplitSong = cur;
    // The song title repeated in the title box above the lyrics is not part of the lyrics.
    const sameHeader = r.header && r.bodyLines.length > 0 && c.title && norm(cleanTitle(r.header)) === norm(c.title);
    c.blocks.push(sameHeader ? r.bodyLines : r.lines);
  }

  // A song with no title slide: its first lyric line (not "Verse 1") becomes the title.
  for (const s of songs) {
    if (!s.title) s.title = cleanTitle(s.blocks.flat().find((l) => !isLabel(l)) || "");
  }
  return songs.length >= 2 ? { songs, how } : null;
}

const HOW_TEXT: Record<SplitHow, string> = {
  header: "batay sa title sa itaas ng bawat slide",
  titleSlides: "batay sa mga title slide",
  blanks: "batay sa mga blank slide at title",
};

// ---------- file → songs ----------

export interface PptxSongsResult {
  songs: BulkSong[];
  /** Notes for the user (hidden slides, pictures, dropped title slide, split). */
  warnings: string[];
  /** Set when the file was split into several songs. */
  split?: SplitHow;
}

const baseNameOf = (fileName: string) => fileName.replace(/^.*[\\/]/, "").replace(/\.pptx$/i, "").trim();

function toBulk(draft: BulkSong["draft"], line: number, source: string): BulkSong {
  const { slideCount, error } = validateDraft(draft);
  return { line, draft, slideCount, error, source };
}

export async function parsePptxSongs(file: File | Blob, fileName: string, opts: { split?: boolean } = {}): Promise<PptxSongsResult> {
  const baseName = baseNameOf(fileName);
  const deck = await readPptx(file, fileName.replace(/^.*[\\/]/, ""));
  const warnings = [...deck.warnings];

  if (opts.split !== false && deck.meta && deck.meta.length === deck.slides.length) {
    const recs: SlideRec[] = deck.slides.map((s, i) => {
      const m = deck.meta![i];
      return {
        lines: slideLines(s.text || ""),
        header: slideLines(m.title)[0] || "",
        bodyLines: slideLines(m.body),
        layout: m.layout,
        titleKind: m.titleKind,
      };
    });
    const r = splitSlidesIntoSongs(recs);
    if (r) {
      warnings.push(`Hinati sa ${r.songs.length} kanta (${HOW_TEXT[r.how]}).`);
      const songs = r.songs.map((s, i) =>
        toBulk(
          { title: s.title || `${baseName} (${i + 1})`, author: s.author, key: "", ccli: "", copyright: "", lyrics: s.blocks.map((b) => b.join("\n")).join("\n\n") },
          i + 1,
          fileName,
        ),
      );
      return { songs, warnings, split: r.how };
    }
  }

  // One song per file (the behavior before 2026-11-14).
  const blocks: string[][] = [];
  let empty = 0;
  for (const s of deck.slides) {
    const lines = slideLines(s.text || "");
    if (lines.length === 0) empty++;
    else blocks.push(lines);
  }
  if (empty) warnings.push(`${empty} slide na walang text ang nilaktawan.`);

  // First slide that only repeats the song title (or "title + author") is a title slide, not lyrics.
  if (blocks.length > 1) {
    const first = blocks[0];
    const t = norm(baseName);
    const joined = norm(first.join(" "));
    const isLbl = first.length === 1 && isLabel(first[0]);
    if (!isLbl && t && first.length <= 2 && (joined === t || norm(first[0]) === t)) {
      blocks.shift();
      warnings.push("Ang unang slide (title lang) ay hindi isinama sa lyrics.");
    }
  }

  const lyrics = blocks.map((b) => b.join("\n")).join("\n\n");
  return { songs: [toBulk({ title: baseName.slice(0, 200), author: "", key: "", ccli: "", copyright: "", lyrics }, 1, fileName)], warnings };
}

/** For Import folder / Import button: never throws, a failed file becomes an error row in the preview. */
export async function parsePptxForBulk(
  file: File | Blob,
  fileName: string,
  opts: { split?: boolean } = {},
): Promise<{ songs: BulkSong[]; warnings: string[]; split?: SplitHow }> {
  try {
    const r = await parsePptxSongs(file, fileName, opts);
    return { songs: r.songs, warnings: r.warnings.map((w) => `${fileName.replace(/^.*[\\/]/, "")}: ${w}`), split: r.split };
  } catch (e) {
    const baseName = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").trim();
    return {
      songs: [
        {
          line: 1,
          draft: { title: baseName, author: "", key: "", ccli: "", copyright: "", lyrics: "" },
          slideCount: 0,
          error: e instanceof Error ? e.message : "Hindi mabasa ang PowerPoint.",
          source: fileName,
        },
      ],
      warnings: [],
    };
  }
}
