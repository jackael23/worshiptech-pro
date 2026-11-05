/**
 * 2026-10-29 (Jarvis): text style of the slides (font, size, bold/italic, color, alignment,
 * outline/shadow). One global style (saved in this browser) + an optional override per
 * schedule item. The resolved style travels inside LiveState, so the projector window and
 * the phone remote show exactly the same.
 */
import type { TextStyle, ResolvedTextStyle } from "../types";

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Inter",
  scale: 1,
  bold: true,
  italic: false,
  color: null,
  align: "center",
  valign: "middle",
  outline: false,
  shadow: true,
};

export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2; // 2026-11-05: was 1.5 — bigger text for big rooms (auto-fit still keeps it on screen)

/** Fonts that are on (almost) every Windows PC. `w` = average glyph width in em, for auto-fit. */
export const FONT_PRESETS: { name: string; stack: string; w: number }[] = [
  { name: "Inter", stack: '"Inter Variable", "Segoe UI", sans-serif', w: 0.5 },
  { name: "Arial", stack: "Arial, Helvetica, sans-serif", w: 0.5 },
  { name: "Segoe UI", stack: '"Segoe UI", Arial, sans-serif', w: 0.5 },
  { name: "Calibri", stack: "Calibri, Carlito, Arial, sans-serif", w: 0.46 },
  { name: "Verdana", stack: "Verdana, Geneva, sans-serif", w: 0.58 },
  { name: "Tahoma", stack: "Tahoma, Verdana, sans-serif", w: 0.52 },
  { name: "Trebuchet MS", stack: '"Trebuchet MS", Arial, sans-serif', w: 0.5 },
  { name: "Georgia", stack: "Georgia, serif", w: 0.53 },
  { name: "Times New Roman", stack: '"Times New Roman", Times, serif', w: 0.45 },
  { name: "Impact", stack: "Impact, Haettenschweiler, sans-serif", w: 0.46 },
];
const CUSTOM_W = 0.56; // unknown font: assume a bit wide, so text still fits

/** Font names typed by the user: letters, digits, space, - _ only (goes into CSS). */
export function cleanFontName(name: string): string {
  return name.replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function fontStack(name: string): string {
  const preset = FONT_PRESETS.find((f) => f.name === name);
  if (preset) return preset.stack;
  const clean = cleanFontName(name);
  return clean ? `"${clean}", "Inter Variable", sans-serif` : FONT_PRESETS[0].stack;
}

export function fontWidth(name: string): number {
  return FONT_PRESETS.find((f) => f.name === name)?.w ?? CUSTOM_W;
}

/** True when the font is installed on this PC (compares text width against fallbacks). */
export function isFontAvailable(name: string): boolean {
  if (name === "Inter") return true; // bundled with the app
  const clean = cleanFontName(name);
  if (!clean || typeof document === "undefined") return false;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return true;
    const sample = "mmmmmmmmmmlli WWW 0123";
    return ["monospace", "serif", "sans-serif"].some((base) => {
      ctx.font = `72px ${base}`;
      const a = ctx.measureText(sample).width;
      ctx.font = `72px "${clean}", ${base}`;
      return ctx.measureText(sample).width !== a;
    });
  } catch {
    return true;
  }
}

const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/** Repairs anything read from storage (or a broken value) into a valid style. */
export function sanitizeTextStyle(raw: unknown): TextStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TEXT_STYLE;
  const scale = Number(r.scale);
  return {
    fontFamily: typeof r.fontFamily === "string" && cleanFontName(r.fontFamily) ? cleanFontName(r.fontFamily) : d.fontFamily,
    scale: Number.isFinite(scale) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(scale * 100) / 100)) : d.scale,
    bold: typeof r.bold === "boolean" ? r.bold : d.bold,
    italic: typeof r.italic === "boolean" ? r.italic : d.italic,
    color: isHexColor(r.color) ? r.color.toLowerCase() : null,
    align: r.align === "left" || r.align === "right" || r.align === "center" ? r.align : d.align,
    valign: r.valign === "top" || r.valign === "bottom" || r.valign === "middle" ? r.valign : d.valign,
    outline: typeof r.outline === "boolean" ? r.outline : d.outline,
    shadow: typeof r.shadow === "boolean" ? r.shadow : d.shadow,
  };
}

const STORE_KEY = "wtp-text-style-v1";

export function loadTextStyle(): TextStyle {
  try {
    const s = localStorage.getItem(STORE_KEY);
    return s ? sanitizeTextStyle(JSON.parse(s)) : { ...DEFAULT_TEXT_STYLE };
  } catch {
    return { ...DEFAULT_TEXT_STYLE };
  }
}

export function saveTextStyle(s: TextStyle) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked — works until reload */
  }
}

/**
 * Global style, or the item's own style when it has one.
 * forceColor: the item's own color wins even over a PowerPoint slide's text color.
 */
export function resolveTextStyle(global: TextStyle, override?: TextStyle | null): ResolvedTextStyle {
  return override ? { ...override, forceColor: override.color != null } : { ...global, forceColor: false };
}

export const sameStyle = (a?: ResolvedTextStyle, b?: ResolvedTextStyle) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
