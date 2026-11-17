/**
 * 2026-11-17 (Jarvis): musician tools for the Help chat (no AI, no internet).
 * Answers questions like:
 *   "G to E"                        → how many steps + the common chords in both keys
 *   "capo 3 G shapes"               → what key it sounds in (Bb)
 *   "anong capo para A gamit ang G" → which fret (capo 2) + other easy shapes for A
 *   "transpose G C D Em +2"         → A D E F#m
 * Uses the same note math as the Stage screen (lib/chords.ts).
 * Pure functions (no DOM / storage) so they can be tested on their own.
 */
import { isChord, prefersFlats, transposeChord, transposeKey } from "./chords";

type Lang = "en" | "tl";

const NOTE_INDEX: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};
const mod12 = (n: number) => ((n % 12) + 12) % 12;

interface Key {
  root: string; // "G", "Bb", "F#"
  minor: boolean;
}

const keyName = (k: Key) => k.root + (k.minor ? "m" : "");

/** "g", "Bb", "f#m", "eb" → Key. Anything else → null. */
function parseKey(token: string): Key | null {
  const t = token.replace(/♯/g, "#").replace(/♭/g, "b").trim();
  const m = t.match(/^([a-gA-G])(#|b)?(m)?$/);
  if (!m) return null;
  const root = m[1].toUpperCase() + (m[2] || "");
  if (NOTE_INDEX[root] === undefined) return null;
  return { root, minor: !!m[3] };
}

/** Key moved by semitones, spelled the usual way for that key (Bb, not A#). */
function moveKey(k: Key, steps: number): Key {
  const moved = transposeKey(keyName(k), steps);
  return { root: moved.replace(/m$/, ""), minor: k.minor };
}

/** Common chords of a key: I IV V vi (major) or i iv v VI VII (minor). */
function commonChords(k: Key): string[] {
  const base = k.minor ? ["Am", "Dm", "Em", "F", "G"] : ["C", "F", "G", "Am"];
  const steps = mod12(NOTE_INDEX[k.root] - (k.minor ? 9 : 0));
  const flat = prefersFlats("", keyName(k), 0);
  return base.map((c) => transposeChord(c, steps, flat));
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
/** Shortest move: +5 rather than −7, −2 rather than +10. */
const shortest = (n: number) => (mod12(n) > 6 ? mod12(n) - 12 : mod12(n));

function fretWord(n: number, lang: Lang) {
  if (lang === "en") return n === 1 ? "1 fret" : `${n} frets`;
  return `${n} fret`;
}

// ---------- the four tools ----------

function keyToKey(from: Key, to: Key, lang: Lang): string {
  const steps = shortest(NOTE_INDEX[to.root] - NOTE_INDEX[from.root]);
  const target = { root: to.root, minor: from.minor };
  const fromChords = commonChords(from).join(" – ");
  const toChords = commonChords(target).join(" – ");
  const label = from.minor ? "i – iv – v – VI – VII" : "I – IV – V – vi";
  const modeNote =
    from.minor !== to.minor
      ? lang === "en"
        ? `\n\n_Note: ${keyName(from)} and ${keyName(to)} are not the same kind of key (major vs minor). I kept it ${from.minor ? "minor" : "major"}._`
        : `\n\n_Paalala: magkaiba ang ${keyName(from)} at ${keyName(to)} (major at minor). Itinuloy ko bilang ${from.minor ? "minor" : "major"}._`
      : "";
  if (steps === 0) {
    return lang === "en" ? `**${keyName(from)} → ${keyName(to)}**: same key, no change needed.` : `**${keyName(from)} → ${keyName(to)}**: pareho lang ang key, walang kailangang baguhin.`;
  }
  if (lang === "en") {
    return `### 🎸 ${keyName(from)} → ${keyName(target)}: **${signed(steps)}** (${Math.abs(steps)} half step${Math.abs(steps) === 1 ? "" : "s"} ${steps > 0 ? "up" : "down"})

| | ${label} |
|---|---|
| ${keyName(from)} | ${fromChords} |
| ${keyName(target)} | ${toChords} |

**On the Stage screen or the phone's Chords tab:** press Transpose **${signed(steps)}**. Every chord moves by itself.${modeNote}`;
  }
  return `### 🎸 ${keyName(from)} → ${keyName(target)}: **${signed(steps)}** (${Math.abs(steps)} half step ${steps > 0 ? "pataas" : "pababa"})

| | ${label} |
|---|---|
| ${keyName(from)} | ${fromChords} |
| ${keyName(target)} | ${toChords} |

**Sa Stage screen o sa Chords tab ng phone:** pindutin ang Transpose hanggang **${signed(steps)}**. Kusa nang gagalaw lahat ng chords.${modeNote}`;
}

function capoSounds(capo: number, shape: Key, lang: Lang): string {
  const sound = moveKey(shape, capo);
  if (lang === "en") {
    return `### 🎸 Capo ${capo} + ${keyName(shape)} shapes = sounds in **${keyName(sound)}**

The capo raises everything by ${fretWord(capo, lang)}. You play ${keyName(shape)} chords (${commonChords(shape).join(", ")}), but the band hears ${keyName(sound)} (${commonChords(sound).join(", ")}).

_Tell the keyboard and bass player: **${keyName(sound)}**._`;
  }
  return `### 🎸 Capo ${capo} + ${keyName(shape)} shapes = tunog **${keyName(sound)}**

Tinataas ng capo nang ${fretWord(capo, lang)} ang lahat. ${keyName(shape)} chords ang hawak mo (${commonChords(shape).join(", ")}), pero **${keyName(sound)}** ang naririnig ng banda (${commonChords(sound).join(", ")}).

_Sabihin sa keyboard at bass: **${keyName(sound)}** ang key._`;
}

/** Easy open shapes on guitar, and the capo each needs to sound in `target` (capo 0–7 only). */
function shapeOptions(target: Key): Array<{ shape: Key; capo: number }> {
  const shapes = target.minor ? ["Am", "Em", "Dm"] : ["G", "C", "D", "A", "E"];
  return shapes
    .map((s) => parseKey(s)!)
    .map((shape) => ({ shape, capo: mod12(NOTE_INDEX[target.root] - NOTE_INDEX[shape.root]) }))
    .filter((o) => o.capo <= 7)
    .sort((a, b) => a.capo - b.capo);
}

function capoFind(target: Key, shape: Key | null, lang: Lang): string {
  const options = shapeOptions(target)
    .map((o) => `- **${keyName(o.shape)} shapes** → ${o.capo === 0 ? (lang === "en" ? "no capo" : "walang capo") : `capo ${o.capo}`}`)
    .join("\n");
  if (!shape) {
    return lang === "en"
      ? `### 🎸 Easy ways to play in **${keyName(target)}**\n\n${options}\n\n_Lower capo = fuller sound. Pick the shapes you know best._`
      : `### 🎸 Madadaling paraan para tumunog ng **${keyName(target)}**\n\n${options}\n\n_Mas mababang capo = mas buo ang tunog. Piliin ang shapes na kabisado mo._`;
  }
  const capo = mod12(NOTE_INDEX[target.root] - NOTE_INDEX[shape.root]);
  const head =
    capo === 0
      ? lang === "en"
        ? `### 🎸 ${keyName(shape)} shapes already sound in **${keyName(target)}**, no capo needed.`
        : `### 🎸 ${keyName(target)} na mismo ang ${keyName(shape)} shapes, hindi na kailangan ng capo.`
      : lang === "en"
      ? `### 🎸 For **${keyName(target)}** with ${keyName(shape)} shapes: **capo ${capo}**`
      : `### 🎸 Para tumunog ng **${keyName(target)}** gamit ang ${keyName(shape)} shapes: **capo ${capo}**`;
  const high =
    capo > 7
      ? lang === "en"
        ? "\n\n_That capo is very high and will sound thin. Try one of these instead:_"
        : "\n\n_Masyadong mataas ang capo na 'yan, maninipis ang tunog. Subukan na lang ang isa sa mga ito:_"
      : lang === "en"
      ? "\n\nOther easy shapes for the same key:"
      : "\n\nIba pang madaling shapes para sa parehong key:";
  return `${head}${high}\n${options}`;
}

function transposeList(chords: string[], steps: number, lang: Lang): string {
  const firstKey = parseKey(chords[0].replace(/^([A-G](?:#|b)?m?).*$/, "$1"));
  const flat = firstKey ? prefersFlats("", transposeKey(keyName(firstKey), steps), 0) : chords.some((c) => /^[A-G]b/.test(c));
  const moved = chords.map((c) => transposeChord(c, steps, flat));
  const word = lang === "en" ? (steps > 0 ? "up" : "down") : steps > 0 ? "pataas" : "pababa";
  return `### 🎸 Transpose **${signed(steps)}** (${Math.abs(steps)} half step ${word})

| ${lang === "en" ? "Before" : "Dati"} | ${chords.join(" | ")} |
|---|${chords.map(() => "---").join("|")}|
| **${lang === "en" ? "After" : "Ngayon"}** | ${moved.map((c) => `**${c}**`).join(" | ")} |`;
}

// ---------- reading the question ----------

const KEY_SRC = String.raw`[a-gA-G](?:#|b|♯|♭)?m?`;
const KEY_TO_KEY_RE = new RegExp(
  String.raw`(?:^|[\s(])(${KEY_SRC})\s*(?:to|->|→|=>|papuntang|papunta sa|papunta|into|hanggang)\s*(${KEY_SRC})(?=$|[\s?.!,)])`,
  "i",
);
const CAPO_NUM_RE = /capo\s*(?:sa\s*|ng\s*|on\s*|at\s*)?(?:fret\s*)?(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)?\s*fret\b|\bcapo\s*(\d{1,2})/i;
const SHAPE_HINT_RE = /^(shapes?|chords?|hugis|form|forms|shape)$/i;
const USING_WORDS = new Set(["gamit", "gamit ang", "using", "with", "w/", "sa"]);

function tokens(text: string): string[] {
  return text.replace(/[?!,;:()]/g, " ").split(/\s+/).filter(Boolean);
}

/** Key-looking words. Upper-case ones win; a lone lower-case "a" (English article) is ignored when others exist. */
function keyTokens(words: string[]): Array<{ key: Key; index: number }> {
  const found = words.map((w, index) => ({ w, index, key: parseKey(w) })).filter((x) => x.key) as Array<{ w: string; index: number; key: Key }>;
  const upper = found.filter((x) => /^[A-G]/.test(x.w));
  const list = upper.length ? upper : found.length > 1 ? found.filter((x) => x.w.toLowerCase() !== "a") : found;
  return list.map(({ key, index }) => ({ key, index }));
}

function readSteps(text: string): number | null {
  const t = text.toLowerCase();
  const sign = t.match(/(?:^|\s)([+-])\s?(\d{1,2})\b/);
  if (sign) return (sign[1] === "-" ? -1 : 1) * Number(sign[2]);
  const up = t.match(/\b(?:up|taas|itaas|pataas|raise)\s*(?:ng|by|nang)?\s*(\d{1,2})\b/);
  if (up) return Number(up[1]);
  const down = t.match(/\b(?:down|baba|ibaba|pababa|lower)\s*(?:ng|by|nang)?\s*(\d{1,2})\b/);
  if (down) return -Number(down[1]);
  return null;
}

/**
 * Musician question → markdown answer, or null when it is not a transpose / capo question
 * (then the normal Help search answers it).
 */
export function answerMusicQuestion(question: string, language: "Tagalog" | "English" | "Taglish"): string | null {
  const lang: Lang = language === "English" ? "en" : "tl";
  const text = (question || "").slice(0, 300);
  const lower = text.toLowerCase();
  const words = tokens(text);

  // 1) a list of chords + an amount: "transpose G C D Em +2", "G D Em C taas 2"
  const chordWords = words.filter((w) => isChord(w) && /^[A-G]/.test(w));
  const steps = readSteps(text);
  if (chordWords.length >= 2 && steps !== null && steps !== 0 && Math.abs(steps) <= 11) {
    return transposeList(chordWords.slice(0, 16), steps, lang);
  }

  // 2) capo questions
  if (/\bcapo\b/i.test(lower)) {
    const num = text.match(CAPO_NUM_RE);
    const capo = num ? Number(num[1] || num[2] || num[3]) : null;
    const keys = keyTokens(words);
    if (capo !== null && capo >= 1 && capo <= 11 && keys.length >= 1) {
      // "capo 3 G" — the shape is the key next to "shapes", else the first key
      const hinted = keys.find((k) => SHAPE_HINT_RE.test(words[k.index + 1] || ""));
      return capoSounds(capo, (hinted || keys[0]).key, lang);
    }
    if (keys.length >= 2) {
      // "capo para A gamit ang G shapes": the shape is next to "shapes" or after "gamit / using / with"
      const isShape = (k: { index: number }) =>
        SHAPE_HINT_RE.test(words[k.index + 1] || "") ||
        USING_WORDS.has((words[k.index - 1] || "").toLowerCase()) ||
        ((words[k.index - 2] || "").toLowerCase() === "gamit" && (words[k.index - 1] || "").toLowerCase() === "ang");
      const shape = keys.find(isShape) || keys[1];
      const target = keys.find((k) => k !== shape) || keys[0];
      return capoFind(target.key, shape.key, lang);
    }
    if (keys.length === 1) return capoFind(keys[0].key, null, lang);
    return null; // "paano gamitin ang capo?" → the Help article
  }

  // 3) key to key: "G to E", "D papuntang F"
  const kk = text.match(KEY_TO_KEY_RE);
  if (kk) {
    const from = parseKey(kk[1]);
    const to = parseKey(kk[2]);
    if (from && to) return keyToKey(from, to, lang);
  }
  return null;
}
