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

export interface PptxSongResult {
  song: BulkSong;
  /** Notes for the user (hidden slides, pictures, dropped title slide). */
  warnings: string[];
}

export async function parsePptxAsSong(file: File | Blob, fileName: string): Promise<PptxSongResult> {
  const baseName = fileName.replace(/^.*[\\/]/, "").replace(/\.pptx$/i, "").trim();
  const deck = await readPptx(file, fileName.replace(/^.*[\\/]/, ""));
  const warnings = [...deck.warnings];

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
    const isLabel = first.length === 1 && !!asSectionLabel(first[0]);
    if (!isLabel && t && first.length <= 2 && (joined === t || norm(first[0]) === t)) {
      blocks.shift();
      warnings.push("Ang unang slide (title lang) ay hindi isinama sa lyrics.");
    }
  }

  const lyrics = blocks.map((b) => b.join("\n")).join("\n\n");
  const draft = { title: baseName.slice(0, 200), author: "", key: "", ccli: "", copyright: "", lyrics };
  const { slideCount, error } = validateDraft(draft);
  return {
    song: { line: 1, draft, slideCount, error, source: fileName },
    warnings,
  };
}

/** For Import folder / Import button: never throws, a failed file becomes an error row in the preview. */
export async function parsePptxForBulk(file: File | Blob, fileName: string): Promise<{ songs: BulkSong[]; warnings: string[] }> {
  try {
    const r = await parsePptxAsSong(file, fileName);
    return { songs: [r.song], warnings: r.warnings.map((w) => `${fileName.replace(/^.*[\\/]/, "")}: ${w}`) };
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
