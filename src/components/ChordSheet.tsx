/**
 * 2026-11-08 (Mira): one slide's lyrics with chords above the words (Stage screen + Song editor preview).
 *  - Lines come from the slide's `chords` (ChordPro-style "[G]Amazing [C]grace"); without chords, plain lyrics.
 *  - transpose = semitones (+/-); flats or sharps follow the moved key (lib/chords.ts).
 *  - Sizes are in em: the parent's font-size sets the size.
 */
import React from "react";
import type { LiveState } from "../types";
import { COMMENT_RE, hasChords, prefersFlats, splitChordLine, stripChords, transposeChord, ChordSegment } from "../lib/chords";

interface Props {
  text: string;
  chords?: string;
  transpose?: number;
  songKey?: string;
  /** false = lyrics only (chords hidden). */
  showChords?: boolean;
  className?: string;
}

/** Long lyric pieces are split per word, so a line wraps between words and each chord stays on its word. */
function wordPieces(segs: ChordSegment[]): ChordSegment[] {
  const out: ChordSegment[] = [];
  for (const s of segs) {
    const words = s.text.match(/\S+\s*|\s+/g) || [""];
    words.forEach((w, i) => out.push({ chord: i === 0 ? s.chord : null, text: w }));
  }
  return out;
}

/** First two lines of the next slide (with their chords when it has any). Stage screen + phone Chords tab. */
export function nextPreview(state: Pick<LiveState, "nextSlideText" | "nextSlideChords">): { text: string; chords?: string } | null {
  const text = state.nextSlideText || "";
  if (!text.trim()) return null;
  const firstLines = (s: string, n: number) => s.split("\n").filter((l) => l.trim()).slice(0, n).join("\n");
  if (!state.nextSlideChords) return { text: firstLines(text, 2) };
  // keep chord lines up to the 2nd line that has words
  const lines = state.nextSlideChords.split("\n");
  const out: string[] = [];
  let words = 0;
  for (const l of lines) {
    out.push(l);
    if (/[^\s]/.test(l.replace(/\[[^\]]*\]/g, "").replace(/^\{.*\}$/, ""))) words++;
    if (words >= 2) break;
  }
  return { text: firstLines(text, 2), chords: out.join("\n") };
}

export const ChordSheet: React.FC<Props> = ({ text, chords, transpose = 0, songKey, showChords = true, className = "" }) => {
  const source = showChords && chords ? chords : text;
  const flat = prefersFlats(source, songKey, transpose);
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  return (
    <div className={`leading-tight ${className}`} data-testid="chord-sheet">
      {lines.map((line, i) => {
        const comment = line.trim().match(COMMENT_RE);
        if (comment) {
          if (!showChords) return null;
          return (
            <div key={i} className="mt-[0.3em] text-[0.55em] font-semibold uppercase tracking-wider text-sky-400">
              {comment[1]}
            </div>
          );
        }
        if (!showChords || !hasChords(line)) {
          const plain = showChords ? line : stripChords(line);
          if (!plain.trim()) return null;
          return (
            <div key={i} className="whitespace-pre-wrap">
              {plain}
            </div>
          );
        }
        const chordOnly = !stripChords(line);
        const segs = splitChordLine(line);
        if (chordOnly) {
          return (
            <div key={i} className="flex flex-wrap gap-x-[0.8em] text-[0.8em] font-bold text-amber-300">
              {segs
                .filter((s) => s.chord)
                .map((s, j) => (
                  <span key={j}>{transposeChord(s.chord!, transpose, flat)}</span>
                ))}
            </div>
          );
        }
        return (
          <div key={i} className="flex flex-wrap items-end">
            {wordPieces(segs).map((s, j) => (
              <span key={j} className="inline-flex flex-col">
                <span className="min-h-[1em] pr-[0.3em] text-[0.75em] font-bold leading-none text-amber-300">
                  {s.chord ? transposeChord(s.chord, transpose, flat) : " "}
                </span>
                <span className="whitespace-pre">{s.text || " "}</span>
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};
