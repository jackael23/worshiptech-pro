/**
 * 2026-11-07 (Jarvis): keeps song items in the Schedule in step with My Songs.
 *  - A song added from My Songs remembers where it came from (ScheduleItem.songId).
 *  - When that song is edited (Song editor, Bulk Add, Import, or CouchDB sync from another device),
 *    the item's slides + title follow. The item's own text style / background are left alone.
 *  - A song that no longer exists leaves its copy in the schedule (unlinked) so nothing vanishes mid-service.
 *  - "Para sa schedule na ito lang" edits unlink the item, so later song edits don't overwrite them.
 * 2026-11-14:
 *  - The song's BACKGROUND follows too: the item remembers which song background it was built with
 *    (songBg); when that changes in My Songs, the item's id is returned in `bgPending` and the caller
 *    resolves the picture / video (async) and puts it on the item.
 *  - Items without a link (added before 11-07, or from the phone) are linked to a My Song when the
 *    title and the slides are exactly the same — unless they were changed "para sa schedule na ito lang".
 * Pure functions (no DOM / storage) so they can be tested on their own.
 */
import type { ScheduleItem, SlideContent } from "../types";
import type { StoredSong } from "./mySongsStore";
import { asSectionLabel, parseLyrics } from "./lyricsParser";
import { COMMENT_RE, hasChords, stripChords } from "./chords";
import { keepSlideSizes } from "./textStyle";

/** Same id rule as My Songs (sanitizeSong). */
export const SONG_ID_RE = /^user-[\w-]{1,80}$/;

/** "3. Amazing Grace" → "3. " (the number the schedule puts in front of the title). */
const numberPrefix = (title: string) => title.match(/^\d+\.\s*/)?.[0] ?? "";

/** Title for a schedule item: keeps its number, swaps in the new song title. */
export const retitle = (itemTitle: string, songTitle: string) => `${numberPrefix(itemTitle)}${songTitle}`;

/** Song lyrics → schedule slides (same parser as the Song editor). 2026-11-08: + chords when the slide has any. */
export const songSlides = (lyrics: string): SlideContent[] =>
  parseLyrics(lyrics).map(({ label, text, chords }) => (chords ? { label, text, chords } : { label, text }));

const sameSlides = (a: SlideContent[], b: SlideContent[]) =>
  a.length === b.length && a.every((s, i) => s.label === b[i].label && s.text === b[i].text && s.chords === b[i].chords && !s.image && !s.background && !s.notes);

/** Which background a song has (picture / video / built-in id + dim / fit / blur). "" = none. */
export const songBgSig = (s: Pick<StoredSong, "bgId" | "bgSettings">) => (s.bgId ? `${s.bgId}|${JSON.stringify(s.bgSettings ?? null)}` : "");

const plainTitle = (t: string) => t.replace(/^\d+\.\s*/, "").trim().toLowerCase();

/** The one My Song an unlinked item is an unchanged copy of (same title + same slides), if any. */
function findCopyOf(item: ScheduleItem, songs: StoredSong[]): StoredSong | undefined {
  const t = plainTitle(item.title);
  const same = songs.filter((s) => s.title.trim().toLowerCase() === t);
  if (same.length !== 1) return undefined;
  return sameSlides(item.slides, songSlides(same[0].lyrics)) ? same[0] : undefined;
}

/**
 * Updates every linked song item from `songs`. Returns the same array (and changed = false)
 * when nothing differs, so React doesn't re-render / re-save for nothing.
 */
export function syncScheduleWithSongs(
  items: ScheduleItem[],
  songs: StoredSong[],
): { items: ScheduleItem[]; changed: boolean; bgPending: string[] } {
  const byId = new Map(songs.map((s) => [s.id, s]));
  let changed = false;
  const bgPending: string[] = [];
  const next = items.map((original) => {
    let item = original;
    if (item.type !== "song") return item;
    if (!item.songId) {
      // 2026-11-14: link an unchanged copy (added before 11-07 or from the phone remote) to its My Song
      const copy = item.songUnlinked ? undefined : findCopyOf(item, songs);
      if (!copy) return item;
      changed = true;
      item = { ...item, songId: copy.id, songBg: songBgSig(copy) };
    }
    const song = byId.get(item.songId!);
    if (!song) {
      // deleted song: keep the copy, just forget the link
      changed = true;
      const { songId: _drop, songBg: _bg, ...rest } = item;
      return rest as ScheduleItem;
    }
    // 2026-11-14: background. An item from before today has no songBg yet: remember the current
    // one (no change on screen); after that, a different one means the song's background was edited.
    const sig = songBgSig(song);
    if (item.songBg === undefined) {
      changed = true;
      item = { ...item, songBg: sig };
    } else if (item.songBg !== sig) bgPending.push(item.id);
    const slides = songSlides(song.lyrics);
    const title = retitle(item.title, song.title);
    const songKey = song.key || undefined; // 2026-11-08: Stage screen shows the key
    if (slides.length === 0 || (title === item.title && songKey === item.songKey && sameSlides(item.slides, slides))) return item;
    changed = true;
    const { songKey: _oldKey, ...rest } = item;
    return {
      ...rest,
      title,
      // 2026-11-25: slides that didn't change keep their own text size
      slides: keepSlideSizes(item.slides, slides),
      activeSlideIndex: Math.min(item.activeSlideIndex, slides.length - 1),
      ...(songKey ? { songKey } : {}),
    };
  });
  return { items: changed ? next : items, changed, bgPending };
}

/**
 * Schedule slides → lyrics text for the Song editor (used for items that aren't linked to a
 * My Song, e.g. sample hymns). parseLyrics(slidesToLyrics(s)) gives back the same slides for
 * section labels ("Verse 1", "Chorus", "… (cont.)") and for numbered "Slide N" labels.
 */
export function slidesToLyrics(slides: SlideContent[]): string {
  const out: string[] = [];
  let current: string | null = null; // label the parser will be using
  for (const s of slides) {
    // blank lines inside a slide would split it in two
    // 2026-11-08: a slide with chords is written with its chords (the parser strips them for the projector)
    const text = (s.chords || s.text).replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    if (!s.text.trim() || !text) continue;
    const cont = s.label.match(/^(.*) \(cont\.\)$/);
    const section = asSectionLabel(cont ? cont[1] : s.label);
    // A section label is written as its own line, unless it just continues the current one.
    // Other labels (custom names, "Slide N") can't be kept as text — the parser renumbers them.
    const header = section && !(cont && current === section) ? section : null;
    if (header) current = header;
    if (out.length > 0) out.push("");
    // 2026-11-08: chord-only intro lines ("{c: Intro}" + chord lines) in front of the slide = their own block
    const lines = text.split("\n");
    let lead = 0;
    while (lead < lines.length && (COMMENT_RE.test(lines[lead]) || (hasChords(lines[lead]) && !stripChords(lines[lead])))) lead++;
    if (lead > 0 && lead < lines.length) {
      out.push(...lines.slice(0, lead), "");
      lines.splice(0, lead);
    }
    if (header) out.push(header);
    out.push(lines.join("\n"));
  }
  return out.join("\n");
}
