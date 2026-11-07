/**
 * 2026-11-07 (Jarvis): keeps song items in the Schedule in step with My Songs.
 *  - A song added from My Songs remembers where it came from (ScheduleItem.songId).
 *  - When that song is edited (Song editor, Bulk Add, Import, or CouchDB sync from another device),
 *    the item's slides + title follow. The item's own text style / background are left alone.
 *  - A song that no longer exists leaves its copy in the schedule (unlinked) so nothing vanishes mid-service.
 *  - "Para sa schedule na ito lang" edits unlink the item, so later song edits don't overwrite them.
 * Pure functions (no DOM / storage) so they can be tested on their own.
 */
import type { ScheduleItem, SlideContent } from "../types";
import type { StoredSong } from "./mySongsStore";
import { asSectionLabel, parseLyrics } from "./lyricsParser";

/** Same id rule as My Songs (sanitizeSong). */
export const SONG_ID_RE = /^user-[\w-]{1,80}$/;

/** "3. Amazing Grace" → "3. " (the number the schedule puts in front of the title). */
const numberPrefix = (title: string) => title.match(/^\d+\.\s*/)?.[0] ?? "";

/** Title for a schedule item: keeps its number, swaps in the new song title. */
export const retitle = (itemTitle: string, songTitle: string) => `${numberPrefix(itemTitle)}${songTitle}`;

/** Song lyrics → schedule slides (same parser as the Song editor). */
export const songSlides = (lyrics: string): SlideContent[] => parseLyrics(lyrics).map(({ label, text }) => ({ label, text }));

const sameSlides = (a: SlideContent[], b: SlideContent[]) =>
  a.length === b.length && a.every((s, i) => s.label === b[i].label && s.text === b[i].text && !s.image && !s.background && !s.notes);

/**
 * Updates every linked song item from `songs`. Returns the same array (and changed = false)
 * when nothing differs, so React doesn't re-render / re-save for nothing.
 */
export function syncScheduleWithSongs(items: ScheduleItem[], songs: StoredSong[]): { items: ScheduleItem[]; changed: boolean } {
  const byId = new Map(songs.map((s) => [s.id, s]));
  let changed = false;
  const next = items.map((item) => {
    if (item.type !== "song" || !item.songId) return item;
    const song = byId.get(item.songId);
    if (!song) {
      // deleted song: keep the copy, just forget the link
      changed = true;
      const { songId: _drop, ...rest } = item;
      return rest as ScheduleItem;
    }
    const slides = songSlides(song.lyrics);
    const title = retitle(item.title, song.title);
    if (slides.length === 0 || (title === item.title && sameSlides(item.slides, slides))) return item;
    changed = true;
    return {
      ...item,
      title,
      slides,
      activeSlideIndex: Math.min(item.activeSlideIndex, slides.length - 1),
    };
  });
  return { items: changed ? next : items, changed };
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
    const text = s.text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    if (!text) continue;
    const cont = s.label.match(/^(.*) \(cont\.\)$/);
    const section = asSectionLabel(cont ? cont[1] : s.label);
    // A section label is written as its own line, unless it just continues the current one.
    // Other labels (custom names, "Slide N") can't be kept as text — the parser renumbers them.
    const header = section && !(cont && current === section) ? section : null;
    if (header) current = header;
    if (out.length > 0) out.push("");
    if (header) out.push(header);
    out.push(text);
  }
  return out.join("\n");
}
