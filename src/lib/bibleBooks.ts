/**
 * 2026-10-20 (Jarvis): Bible book names (English + Tagalog/Ang Biblia) and aliases,
 * reference parsing ("Juan 3:16", "Awit 23", "1 Cor 13:4-7", "Rom 8:28") for imported Bibles.
 */

/** [English name, Tagalog name, extra aliases] in canonical order (66 books). */
export const BIBLE_BOOKS: [string, string, string[]][] = [
  ["Genesis", "Genesis", ["gen", "gn"]],
  ["Exodus", "Exodo", ["ex", "exo", "exod"]],
  ["Leviticus", "Levitico", ["lev", "lv"]],
  ["Numbers", "Mga Bilang", ["num", "nm", "bilang", "blg"]],
  ["Deuteronomy", "Deuteronomio", ["deut", "dt", "deu"]],
  ["Joshua", "Josue", ["josh", "jos"]],
  ["Judges", "Mga Hukom", ["judg", "jdg", "hukom"]],
  ["Ruth", "Ruth", ["rut"]],
  ["1 Samuel", "1 Samuel", ["1 sam", "1sa"]],
  ["2 Samuel", "2 Samuel", ["2 sam", "2sa"]],
  ["1 Kings", "1 Mga Hari", ["1 kgs", "1ki", "1 hari"]],
  ["2 Kings", "2 Mga Hari", ["2 kgs", "2ki", "2 hari"]],
  ["1 Chronicles", "1 Mga Cronica", ["1 chr", "1ch", "1 cronica"]],
  ["2 Chronicles", "2 Mga Cronica", ["2 chr", "2ch", "2 cronica"]],
  ["Ezra", "Ezra", ["ezr"]],
  ["Nehemiah", "Nehemias", ["neh"]],
  ["Esther", "Ester", ["est", "esth"]],
  ["Job", "Job", []],
  ["Psalms", "Mga Awit", ["ps", "psa", "psalm", "awit", "aw", "salmo"]],
  ["Proverbs", "Mga Kawikaan", ["prov", "pr", "prv", "kawikaan", "kaw"]],
  ["Ecclesiastes", "Eclesiastes", ["eccl", "ecc", "ec"]],
  ["Song of Solomon", "Awit ni Solomon", ["song", "sos", "song of songs", "ang awit ng mga awit", "awit ng mga awit"]],
  ["Isaiah", "Isaias", ["isa", "is"]],
  ["Jeremiah", "Jeremias", ["jer"]],
  ["Lamentations", "Panaghoy", ["lam", "pan"]],
  ["Ezekiel", "Ezekiel", ["ezek", "eze"]],
  ["Daniel", "Daniel", ["dan"]],
  ["Hosea", "Oseas", ["hos"]],
  ["Joel", "Joel", []],
  ["Amos", "Amos", []],
  ["Obadiah", "Obadias", ["obad", "oba"]],
  ["Jonah", "Jonas", ["jon"]],
  ["Micah", "Mikas", ["mic", "miqueas"]],
  ["Nahum", "Nahum", ["nah"]],
  ["Habakkuk", "Habacuc", ["hab"]],
  ["Zephaniah", "Sofonias", ["zeph", "zep"]],
  ["Haggai", "Hagai", ["hag"]],
  ["Zechariah", "Zacarias", ["zech", "zec"]],
  ["Malachi", "Malakias", ["mal"]],
  ["Matthew", "Mateo", ["matt", "mt", "mat"]],
  ["Mark", "Marcos", ["mk", "mrk", "mar", "mc"]],
  ["Luke", "Lucas", ["lk", "luk", "luc"]],
  ["John", "Juan", ["jn", "jhn"]],
  ["Acts", "Mga Gawa", ["act", "gawa"]],
  ["Romans", "Mga Taga-Roma", ["rom", "roma", "ro"]],
  ["1 Corinthians", "1 Mga Taga-Corinto", ["1 cor", "1co", "1 corinto"]],
  ["2 Corinthians", "2 Mga Taga-Corinto", ["2 cor", "2co", "2 corinto"]],
  ["Galatians", "Mga Taga-Galacia", ["gal", "galacia"]],
  ["Ephesians", "Mga Taga-Efeso", ["eph", "efeso", "efe"]],
  ["Philippians", "Mga Taga-Filipos", ["phil", "php", "filipos", "fil"]],
  ["Colossians", "Mga Taga-Colosas", ["col", "colosas"]],
  ["1 Thessalonians", "1 Mga Taga-Tesalonica", ["1 thess", "1th", "1 tesalonica"]],
  ["2 Thessalonians", "2 Mga Taga-Tesalonica", ["2 thess", "2th", "2 tesalonica"]],
  ["1 Timothy", "1 Kay Timoteo", ["1 tim", "1ti", "1 timoteo"]],
  ["2 Timothy", "2 Kay Timoteo", ["2 tim", "2ti", "2 timoteo"]],
  ["Titus", "Kay Tito", ["tit", "tito"]],
  ["Philemon", "Kay Filemon", ["phlm", "philem", "filemon"]],
  ["Hebrews", "Mga Hebreo", ["heb", "hebreo"]],
  ["James", "Santiago", ["jas", "jm", "sant"]],
  ["1 Peter", "1 Pedro", ["1 pet", "1pe"]],
  ["2 Peter", "2 Pedro", ["2 pet", "2pe"]],
  ["1 John", "1 Juan", ["1 jn", "1jn"]],
  ["2 John", "2 Juan", ["2 jn", "2jn"]],
  ["3 John", "3 Juan", ["3 jn", "3jn"]],
  ["Jude", "Judas", ["jud"]],
  ["Revelation", "Apocalipsis", ["rev", "re", "apoc", "pahayag"]],
];

/** Normalises a book name: "1 Mga Taga-Corinto" → "1corinto", "II Kings" → "2kings", "Phil." → "phil". */
export function normBookName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/^\s*(iii|ii|i)\s+/, (m) => ({ iii: "3", ii: "2", i: "1" } as Record<string, string>)[m.trim()] + " ")
    .replace(/\b(mga|taga-|taga|kay|ang|sulat ni|aklat ng)\b/g, " ")
    .replace(/taga-/g, "")
    .replace(/[\s-]+/g, "");
}

const exactIndex = new Map<string, number>();
const allKeys: { key: string; book: number }[] = [];
BIBLE_BOOKS.forEach(([en, tl, aliases], i) => {
  for (const name of [en, tl, ...aliases]) {
    const k = normBookName(name);
    if (!k) continue;
    if (!exactIndex.has(k)) exactIndex.set(k, i);
    allKeys.push({ key: k, book: i });
  }
});

/** Finds the book index (0–65) for a typed name; accepts unique prefixes of 3+ letters. */
export function findBook(input: string): number | null {
  const k = normBookName(input);
  if (!k) return null;
  const exact = exactIndex.get(k);
  if (exact !== undefined) return exact;
  if (k.replace(/^\d/, "").length < 3) return null;
  const hits = new Set(allKeys.filter((e) => e.key.startsWith(k)).map((e) => e.book));
  return hits.size === 1 ? [...hits][0] : null;
}

export interface BibleRef {
  book: number;
  chapter: number;
  from?: number;
  to?: number;
}

/** Parses "Juan 3:16", "Juan 3:16-18", "Awit 23", "1 Cor 13", "Juan". Returns null if it is not a reference. */
export function parseReference(input: string): BibleRef | null {
  const m = input
    .trim()
    .match(/^((?:[1-3]|i{1,3})?\s*[^\d:]+?)\s*(?:(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?)?)?\s*$/i);
  if (!m) return null;
  const book = findBook(m[1]);
  if (book === null) return null;
  const chapter = m[2] ? parseInt(m[2], 10) : 1;
  const from = m[3] ? parseInt(m[3], 10) : undefined;
  const to = m[4] ? parseInt(m[4], 10) : from;
  if (from !== undefined && to !== undefined && to < from) return { book, chapter, from: to, to: from };
  return { book, chapter, from, to };
}
