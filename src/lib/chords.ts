/**
 * 2026-11-08 (Mira): chords for musicians (Stage screen), written ChordPro-style inside the lyrics:
 *   "[G]Amazing [C]grace how [G]sweet"
 * The projector never shows chords (lyricsParser strips them); the Stage screen shows them above the words.
 *  - Only chord-shaped brackets count: [G] [Am7] [Cmaj7] [Dsus4] [G/B] [Bb] [F#m] [E(add9)].
 *    Labels like [Bridge] / [Chorus] and notes like [x2] are NOT chords.
 *  - A line with chords and no words (e.g. "[G] [C] [D]") is a chord-only line.
 *  - "{c: Intro}" lines inside a slide's chords are small labels (chord-only intro before a slide).
 * Pure functions (no DOM / storage) so they can be tested on their own.
 */

/** What may follow the root note: m, maj7, sus4, add9, dim, aug, 7, b5, #9, +, °, (…), -. */
const CHORD_BODY = String.raw`(?:maj|min|dim|aug|sus|add|no|m|M|[0-9]|[#b+°ø()-])*`;
const NOTE = String.raw`[A-G](?:#|b)?`;
const CHORD_SRC = `${NOTE}${CHORD_BODY}(?:\\/${NOTE})?`;
const CHORD_ONLY_RE = new RegExp(`^${CHORD_SRC}$`);
/** Global matcher for [Chord] tokens in a line (only chord-shaped ones). */
const CHORD_TOKEN_RE = new RegExp(`\\[(${CHORD_SRC})\\]`, "g");

export const COMMENT_RE = /^\{\s*c\s*:\s*(.*?)\s*\}$/i;

export function isChord(s: string): boolean {
  return CHORD_ONLY_RE.test(s.trim());
}

export function hasChords(text: string): boolean {
  CHORD_TOKEN_RE.lastIndex = 0;
  return CHORD_TOKEN_RE.test(text || "");
}

/** Removes [Chord] tokens; leaves other brackets ([x2], [Bridge]) alone. Collapses the gaps left behind. */
export function stripChords(line: string): string {
  return (line || "").replace(CHORD_TOKEN_RE, "").replace(/[ \t]{2,}/g, " ").trim();
}

export interface ChordSegment {
  /** chord above this piece of text (null = none) */
  chord: string | null;
  text: string;
}

/** "[G]Amazing [C]grace" → [{chord:"G",text:"Amazing "},{chord:"C",text:"grace"}] (for chords-over-words layout). */
export function splitChordLine(line: string): ChordSegment[] {
  const out: ChordSegment[] = [];
  let last = 0;
  let chord: string | null = null;
  CHORD_TOKEN_RE.lastIndex = 0;
  for (let m = CHORD_TOKEN_RE.exec(line); m; m = CHORD_TOKEN_RE.exec(line)) {
    const text = line.slice(last, m.index);
    if (text || chord) out.push({ chord, text });
    chord = m[1];
    last = m.index + m[0].length;
  }
  const rest = line.slice(last);
  if (rest || chord) out.push({ chord, text: rest });
  return out;
}

// ---------------------------------------------------------------- transpose
const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const PITCH: Record<string, number> = {};
SHARPS.forEach((n, i) => (PITCH[n] = i));
FLATS.forEach((n, i) => (PITCH[n] = i));
Object.assign(PITCH, { Cb: 11, "B#": 0, Fb: 4, "E#": 5 });
/** Keys usually written with flats (major and minor). */
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Gb", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"]);

const mod12 = (n: number) => ((n % 12) + 12) % 12;

function moveNote(note: string, steps: number, preferFlat: boolean): string {
  const p = PITCH[note];
  if (p === undefined) return note;
  return (preferFlat ? FLATS : SHARPS)[mod12(p + steps)];
}

/** "G/B" +2 → "A/C#". Unknown text is returned unchanged. */
export function transposeChord(chord: string, steps: number, preferFlat = false): string {
  if (!steps) return chord;
  const m = chord.match(/^([A-G](?:#|b)?)(.*?)(?:\/([A-G](?:#|b)?))?$/);
  if (!m) return chord;
  const [, root, body, bass] = m;
  return moveNote(root, steps, preferFlat) + body + (bass ? "/" + moveNote(bass, steps, preferFlat) : "");
}

/** Song key moved by `steps` ("G" +2 → "A", "Em" +1 → "Fm"). */
export function transposeKey(key: string, steps: number): string {
  const k = (key || "").trim();
  const m = k.match(/^([A-G](?:#|b)?)(m?)$/);
  if (!m || !steps) return k;
  const sharp = moveNote(m[1], steps, false) + m[2];
  const flat = moveNote(m[1], steps, true) + m[2];
  return FLAT_KEYS.has(flat) ? flat : sharp;
}

/** Use flats after transposing? From the (moved) key if known, else from how the text spells its chords. */
export function prefersFlats(text: string, key: string | undefined, steps: number): boolean {
  if (key && /^[A-G](?:#|b)?m?$/.test(key.trim())) return FLAT_KEYS.has(transposeKey(key, steps));
  CHORD_TOKEN_RE.lastIndex = 0;
  let flats = 0;
  let sharps = 0;
  for (let m = CHORD_TOKEN_RE.exec(text); m; m = CHORD_TOKEN_RE.exec(text)) {
    if (/^[A-G]b/.test(m[1])) flats++;
    else if (/^[A-G]#/.test(m[1])) sharps++;
  }
  return flats > sharps;
}

/** Every [Chord] in the text moved by `steps`. */
export function transposeText(text: string, steps: number, preferFlat = false): string {
  if (!steps) return text;
  return (text || "").replace(CHORD_TOKEN_RE, (_all, c: string) => `[${transposeChord(c, steps, preferFlat)}]`);
}
