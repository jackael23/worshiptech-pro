/**
 * 2026-11-25 (Jarvis): edit ONE slide from the Slides panel (Edit slide / "Hatiin sa 2").
 * Same rule as the Song editor: Enter = new line in the slide, a blank line = a new slide.
 *  - A song item that follows its My Song: the slide's own lines in the song's lyrics are replaced
 *    (the rest of the lyrics stay exactly as typed) → every copy + the Live follow.
 *  - Other items (hymns, Bible, PPT text, "para sa schedule na ito lang"): only that item changes.
 * Pure functions (no DOM / storage).
 */
import type { SlideContent } from "../types";
import { parseLyrics, parseLyricsWithRanges } from "./lyricsParser";
import { hasChords, stripChords, COMMENT_RE } from "./chords";

const norm = (s: string) => s.replace(/\r\n?/g, "\n");

/** The lines of slide `idx` exactly as typed in the song's lyrics (with chords), or null. */
export function slideRawText(lyrics: string, idx: number, expectText?: string): string | null {
  const text = norm(lyrics);
  const r = parseLyricsWithRanges(text)[idx];
  if (!r || (expectText !== undefined && r.text !== expectText)) return null;
  return text.slice(r.start, r.end);
}

/** Lyrics with slide `idx` replaced by `block` (a blank line in it = more slides). null = slide not found. */
export function replaceSlideInLyrics(lyrics: string, idx: number, block: string, expectText?: string): string | null {
  const text = norm(lyrics);
  const r = parseLyricsWithRanges(text)[idx];
  if (!r || (expectText !== undefined && r.text !== expectText)) return null;
  return text.slice(0, r.start) + cleanBlock(block) + text.slice(r.end);
}

/** Trims trailing spaces, at most one blank line in a row, no blank lines at the ends. */
export function cleanBlock(block: string): string {
  return norm(block)
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "");
}

/** How many slides the edited text becomes (0 = nothing to show). */
export const countPieces = (block: string) => parseLyrics(cleanBlock(block)).length;

/** Text (lyric) lines of the block, i.e. not chord-only / comment lines. */
const isLyricLine = (l: string) => {
  const t = l.trim();
  if (!t || COMMENT_RE.test(t)) return false;
  return hasChords(t) ? !!stripChords(t) : true;
};

/**
 * "Hatiin sa 2": a blank line in the middle (by lyric lines; chord-only lines stay with the
 * lines after them). Already split blocks: the longest piece is split. Unchanged when it can't be split.
 */
export function splitInHalf(block: string): string {
  const pieces = cleanBlock(block).split(/\n\n/);
  let best = 0;
  pieces.forEach((p, i) => {
    if (p.split("\n").filter(isLyricLine).length > pieces[best].split("\n").filter(isLyricLine).length) best = i;
  });
  const lines = pieces[best].split("\n");
  const lyricIdx = lines.map((l, i) => (isLyricLine(l) ? i : -1)).filter((i) => i >= 0);
  if (lyricIdx.length < 2) return cleanBlock(block);
  let cut = lyricIdx[Math.ceil(lyricIdx.length / 2)];
  // keep chord-only lines in front of the second half together with it
  while (cut > 0 && !isLyricLine(lines[cut - 1]) && lines[cut - 1].trim()) cut--;
  pieces[best] = `${lines.slice(0, cut).join("\n")}\n\n${lines.slice(cut).join("\n")}`;
  return pieces.join("\n\n");
}

/** Can "Hatiin sa 2" do anything with this slide? (at least 2 lyric lines) */
export const canSplit = (block: string) => norm(block).split("\n").filter(isLyricLine).length >= 2;

/** "Hatiin dito": a blank line at the cursor (spaces around it removed). */
export function splitAt(block: string, pos: number): string {
  const t = norm(block);
  const before = t.slice(0, pos).replace(/[ \t]+$/, "").replace(/\n+$/, "");
  const after = t.slice(pos).replace(/^[ \t]+/, "").replace(/^\n+/, "");
  if (!before || !after) return t;
  return `${before}\n\n${after}`;
}

/**
 * Schedule-only edit: the item's slide `original` becomes these slides. The first keeps its label;
 * the next ones are "<label> (cont.)"; a section name typed in the text wins. PowerPoint look
 * (background / text color) goes to every piece, speaker notes to the first.
 */
export function editedSlides(block: string, original: SlideContent): SlideContent[] {
  const base = original.label.replace(/ \(cont\.\)$/, "");
  return parseLyrics(cleanBlock(block)).map((p, k) => {
    const label = /^Slide \d+$/.test(p.label) ? (k === 0 ? original.label : `${base} (cont.)`) : p.label;
    const s: SlideContent = { label, text: p.text };
    if (p.chords) s.chords = p.chords;
    if (original.background) s.background = original.background;
    if (original.textColor) s.textColor = original.textColor;
    if (k === 0 && original.notes) s.notes = original.notes;
    // the slide's own size stays only when its words didn't change
    if (k === 0 && original.sizeScale && p.text === original.text) s.sizeScale = original.sizeScale;
    return s;
  });
}
