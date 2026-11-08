/**
 * 2026-11-08 (Mira): Bible verses for the phone remote (Library → Bible).
 * The phone sends a reference ("Juan 3:16", "Awit 23") or book + chapter; the laptop looks it up in
 * an imported Bible (bibleStore) and sends the verses back. Same rules as the Bibles tab on the laptop
 * (parseReference, Tagalog / English book names, max 60 verses in one schedule item).
 * Pure functions (no DOM / storage) so they can be tested on their own.
 */
import type { WtpBible } from "./bibleStore";
import { BIBLE_BOOKS, parseReference } from "./bibleBooks";

export const MAX_PASSAGE_VERSES = 60; // same as the Bibles tab

export interface LookupVerse {
  v: number;
  text: string;
}

/** What the laptop sends back to the phones for one lookup. */
export interface BibleLookupResult {
  reqId: string;
  ok: boolean;
  error?: string;
  bibleId?: string;
  bibleShort?: string;
  book?: number;
  bookName?: string;
  chapter?: number;
  /** chapters in this book (for the phone's chapter grid) */
  chapterCount?: number;
  /** verses shown (the asked range, or the whole chapter) */
  verses?: LookupVerse[];
}

export interface LookupQuery {
  /** typed reference, e.g. "Juan 3:16-18" */
  ref?: string;
  /** or: book index (0–65) + chapter */
  book?: number;
  chapter?: number;
}

/** Book name as this Bible writes it (Tagalog Bibles use the Tagalog name). */
export function bookNameIn(bible: WtpBible, b: number): string {
  const bk = bible.books[b];
  return (bible.language === "tl" ? bk?.tl : bk?.name) || bk?.name || BIBLE_BOOKS[b]?.[0] || "?";
}

export function lookupVerses(bible: WtpBible, q: LookupQuery, reqId: string): BibleLookupResult {
  const fail = (error: string): BibleLookupResult => ({ reqId, ok: false, error, bibleId: bible.id, bibleShort: bible.shortName });
  let book: number;
  let chapter: number;
  let from: number | undefined;
  let to: number | undefined;
  if (q.ref && q.ref.trim()) {
    const r = parseReference(q.ref);
    if (!r) return fail(`Hindi mabasa ang "${q.ref.trim()}". Halimbawa: Juan 3:16, Awit 23, 1 Cor 13:4-7`);
    ({ book, chapter, from, to } = r);
  } else if (Number.isInteger(q.book) && Number.isInteger(q.chapter)) {
    book = q.book!;
    chapter = q.chapter!;
  } else return fail("Pumili ng aklat at kabanata.");
  const bk = bible.books[book];
  if (!bk) return fail("Wala ang aklat na ito sa Bible na ito.");
  const ch = bk.chapters[chapter - 1];
  const base = { reqId, bibleId: bible.id, bibleShort: bible.shortName, book, bookName: bookNameIn(bible, book), chapterCount: bk.chapters.length };
  if (!ch) return { ...base, ok: false, chapter, error: `Walang kabanata ${chapter} sa ${base.bookName}.` };
  const start = from ?? 1;
  const end = Math.min(to ?? ch.length, ch.length);
  if (start > ch.length) return { ...base, ok: false, chapter, error: `${base.bookName} ${chapter} ay may ${ch.length} verses lang.` };
  const verses: LookupVerse[] = [];
  for (let v = start; v <= end; v++) if (ch[v - 1]) verses.push({ v, text: ch[v - 1] });
  return { ...base, ok: true, chapter, verses };
}

/** "1, 2, 3, 5" → "1-3, 5" */
export function compactRange(vs: number[]): string {
  const s = [...new Set(vs)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`);
    i = j;
  }
  return out.join(", ");
}

/** Schedule item (1 slide per verse) for the chosen verses — same shape as the Bibles tab makes. */
export function passageFor(bible: WtpBible, book: number, chapter: number, verses: number[]): { title: string; slides: { label: string; text: string }[] } | null {
  const ch = bible.books[book]?.chapters[chapter - 1];
  if (!ch) return null;
  const list = [...new Set(verses)].filter((v) => Number.isInteger(v) && v >= 1 && v <= ch.length && ch[v - 1]).sort((a, b) => a - b).slice(0, MAX_PASSAGE_VERSES);
  if (list.length === 0) return null;
  const name = bookNameIn(bible, book);
  return {
    title: `${name} ${chapter}:${compactRange(list)} (${bible.shortName})`,
    slides: list.map((v) => ({ label: `${name} ${chapter}:${v}`, text: ch[v - 1] })),
  };
}
