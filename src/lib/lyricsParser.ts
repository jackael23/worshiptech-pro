/**
 * 2026-10-20 (Jarvis): turns pasted lyrics into EasyWorship-style slides.
 *  - A blank line starts a new slide.
 *  - A line that is only a section name ("Verse 1", "Chorus", "[Bridge]", "Pre-Chorus:")
 *    becomes the label of the slides that follow it.
 *  - Unlabeled slides after a labeled one get "<label> (cont.)"; with no labels at all
 *    they are numbered "Slide 1", "Slide 2", ...
 * Pure function (no DOM / storage) so it can be tested on its own.
 */
export interface ParsedSlide {
  label: string;
  text: string;
}

export const MAX_SLIDES = 100;

const SECTION_WORDS =
  // 2026-10-20: + misc/other/turnaround/channel/post-chorus (labels used in SongSelect files)
  "verse|chorus|pre[- ]?chorus|post[- ]?chorus|bridge|tag|intro|outro|ending|refrain|interlude|instrumental|coda|vamp|hook|misc|other|turnaround|channel|berso|koro|tulay";
const LABEL_RE = new RegExp(
  `^[\\[(]?\\s*(${SECTION_WORDS})(?:\\s*(\\d+[a-z]?))?\\s*[\\])]?\\s*:?$`,
  "i",
);

function formatLabel(word: string, num?: string): string {
  const pretty = word
    .toLowerCase()
    .replace(/\s+/g, "-")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("-");
  return num ? `${pretty} ${num.toUpperCase()}` : pretty;
}

/** Returns the formatted label if the line is a section header, otherwise null. */
export function asSectionLabel(line: string): string | null {
  const m = line.trim().match(LABEL_RE);
  return m ? formatLabel(m[1], m[2]) : null;
}

/**
 * 2026-11-06: same as parseLyrics, plus where each slide sits in the text
 * (start/end = character offsets of its first and last line, after \r\n → \n).
 * Used to highlight a slide's lines in the lyrics box when its thumbnail is clicked.
 */
export interface ParsedSlideRange extends ParsedSlide {
  start: number;
  end: number;
}

export function parseLyricsWithRanges(raw: string): ParsedSlideRange[] {
  const lines = (raw || "").replace(/\r\n?/g, "\n").split("\n");
  const slides: ParsedSlideRange[] = [];
  let label: string | null = null; // current section label
  let labelUsed = false; // has a slide already used the current label?
  let block: string[] = [];
  let blockStart = 0;
  let blockEnd = 0;

  const flush = () => {
    if (block.length === 0) return;
    let slideLabel: string;
    if (label) {
      slideLabel = labelUsed ? `${label} (cont.)` : label;
      labelUsed = true;
    } else {
      slideLabel = `Slide ${slides.length + 1}`;
    }
    slides.push({ label: slideLabel, text: block.join("\n"), start: blockStart, end: blockEnd });
    block = [];
  };

  let offset = 0;
  for (const rawLine of lines) {
    const lineStart = offset;
    offset += rawLine.length + 1; // + "\n"
    const line = rawLine.replace(/\s+$/g, "").replace(/^\s+/g, "");
    if (!line) {
      flush();
      continue;
    }
    const sectionLabel = asSectionLabel(line);
    if (sectionLabel) {
      flush();
      label = sectionLabel;
      labelUsed = false;
      continue;
    }
    if (block.length === 0) blockStart = lineStart;
    block.push(line);
    blockEnd = lineStart + rawLine.length;
    if (slides.length >= MAX_SLIDES) break;
  }
  flush();
  return slides.slice(0, MAX_SLIDES);
}

export function parseLyrics(raw: string): ParsedSlide[] {
  // 2026-11-06: same rules as before, now shared with parseLyricsWithRanges.
  return parseLyricsWithRanges(raw).map(({ label, text }) => ({ label, text }));
}
