/**
 * 2026-11-25 (Jarvis): auto-fit of slide text, measured with the real font (canvas) instead of
 * an average letter width, and with word wrap like the browser does it. Sizes are in % of the
 * screen width (cqw), so the same numbers hold for a thumbnail, the Preview and the projector.
 *
 *  - fitSlide(): the font size for one slide + whether auto-fit made it smaller / it doesn't fit.
 *  - uniformRatio(): "same size on every slide" — the size that fits the longest slide.
 *  - useFontsVersion(): re-render when a font finishes loading (measurements are redone then).
 */
import { useSyncExternalStore } from "react";
import type { ResolvedTextStyle, SlideContent, TextStyle } from "../types";
import { SCALE_MAX, SCALE_MIN, fontStack, fontWidth } from "./textStyle";

/** Base text size (cqw) of every screen: thumbnails, Preview, Live, projector, phone. */
export const BASE_TEXT_SCALE = 6;

const PAD = 6; // % of width on each side (SlideScreen: p-[6cqw])
const BOX_W = (100 - PAD * 2) * 0.98; // small safety margin for rounding / outline
const BOX_H = 56.25 - PAD * 2; // 16:9
const LINE_H = 1.3; // SlideScreen: leading-[1.3]
/** Smallest size auto-fit goes to (was 1.6). Below this the slide is flagged "hindi kasya". */
export const MIN_FS = 1.4;

export const clampSlideScale = (v: unknown): number | undefined => {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  const r = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 100) / 100));
  return r === 1 ? undefined : r;
};

// ---------- font loading → re-measure ----------
let fontsVersion = 0;
const listeners = new Set<() => void>();
const cache = new Map<string, number>();
const loading = new Set<string>();
function bump() {
  cache.clear();
  fontsVersion++;
  listeners.forEach((l) => l());
}
if (typeof document !== "undefined" && document.fonts) {
  document.fonts.addEventListener?.("loadingdone", bump);
}
export function useFontsVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => fontsVersion,
    () => fontsVersion,
  );
}

// ---------- measuring ----------
let ctx: CanvasRenderingContext2D | null | undefined;
function getCtx(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try {
    ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  } catch {
    ctx = null;
  }
  return ctx;
}

type Style = Pick<TextStyle, "fontFamily" | "bold" | "italic">;
const fontSpec = (st: Style) => `${st.italic ? "italic " : ""}${st.bold ? 600 : 400} 100px ${fontStack(st.fontFamily)}`;

/** Width of `text` in em (font size = 1), or null when it can't be measured (no canvas). */
function measureEm(text: string, st: Style): number | null {
  const c = getCtx();
  if (!c) return null;
  const spec = fontSpec(st);
  const key = spec + "\u0000" + text;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  c.font = spec;
  const w = c.measureText(text).width / 100;
  // the font may still be loading → measure again once it's in (don't keep the fallback width)
  let ready = true;
  try {
    ready = !document.fonts || document.fonts.check(spec);
  } catch {
    ready = true;
  }
  if (ready) cache.set(key, w);
  else if (!loading.has(spec)) {
    loading.add(spec);
    document.fonts
      .load(spec)
      .then(() => {
        loading.delete(spec);
        bump();
      })
      .catch(() => loading.delete(spec));
  }
  return w;
}

/** Number of lines the text takes at font size fs (cqw); Infinity when a single word is wider than the box. */
function countLines(lines: string[][], fs: number, wordEm: number[][], spaceEm: number): number {
  let n = 0;
  for (let li = 0; li < lines.length; li++) {
    const words = lines[li];
    if (words.length === 0) {
      n++;
      continue;
    }
    let row = 1;
    let x = 0;
    for (let wi = 0; wi < words.length; wi++) {
      const w = wordEm[li][wi] * fs;
      if (w > BOX_W) return Infinity; // the browser won't break inside a word → it would stick out
      if (x === 0) x = w;
      else if (x + spaceEm * fs + w <= BOX_W) x += spaceEm * fs + w;
      else {
        row++;
        x = w;
      }
    }
    n += row;
  }
  return n;
}

/** Old estimate (no canvas, e.g. tests without a DOM): average letter width of the font. */
function estimateFits(text: string, fs: number, st: Style): boolean {
  const glyph = fontWidth(st.fontFamily) * (st.bold ? 1.04 : 1) * (st.italic ? 1.02 : 1);
  const perLine = BOX_W / (fs * glyph);
  const wrapped = text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return wrapped * fs * LINE_H <= BOX_H;
}

/** Largest font size ≤ max (cqw) at which the text fits the screen; MIN_FS + overflow when nothing fits. */
export function fitFontSize(text: string, max: number, st: Style): { fs: number; overflow: boolean } {
  if (!text) return { fs: max, overflow: false };
  const lines = text.split("\n").map((l) => l.split(/\s+/).filter(Boolean));
  const spaceEm = measureEm(" ", st);
  let fits: (fs: number) => boolean;
  if (spaceEm === null) fits = (fs) => estimateFits(text, fs, st);
  else {
    const wordEm = lines.map((ws) => ws.map((w) => measureEm(w, st) ?? 0));
    fits = (fs) => countLines(lines, fs, wordEm, spaceEm) * fs * LINE_H <= BOX_H;
  }
  if (fits(max)) return { fs: max, overflow: false };
  if (!fits(MIN_FS)) return { fs: MIN_FS, overflow: true };
  // binary search between MIN_FS (fits) and max (doesn't)
  let lo = MIN_FS;
  let hi = max;
  while (hi - lo > 0.02) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { fs: lo, overflow: false };
}

export interface SlideFit {
  /** Font size used (cqw). */
  fs: number;
  /** Size asked for before auto-fit (cqw). */
  max: number;
  /** fs / max — below 1 = auto-fit made the text smaller. */
  ratio: number;
  /** Even the smallest size doesn't fit: part of the text is cut off. */
  overflow: boolean;
}

/** Font size of one slide with the item/global size, "same size" mode and the slide's own size. */
export function fitSlide(text: string, textScale: number, st: ResolvedTextStyle): SlideFit {
  const base = textScale * st.scale * (st.uniformSize && st.uniformRatio ? st.uniformRatio : 1);
  const max = base * (st.slideScale ?? 1);
  const { fs, overflow } = fitFontSize(text, max, st);
  return { fs, max, ratio: max > 0 ? fs / max : 1, overflow };
}

/** "Same size on every slide": fit of the longest slide, as 0–1 × the normal size. */
export function uniformRatio(slides: Pick<SlideContent, "text" | "image">[], st: TextStyle): number {
  const max = BASE_TEXT_SCALE * st.scale;
  let r = 1;
  for (const s of slides) {
    if (!s.text || s.image) continue;
    r = Math.min(r, fitFontSize(s.text, max, st).fs / max);
  }
  return Math.round(r * 1000) / 1000;
}
