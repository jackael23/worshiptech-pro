/**
 * 2026-11-07 (Mira): Presentation themes = text style + background for the projector, in one click.
 *  - Built-in themes below (backgrounds are CSS gradients: offline, sharp on any projector).
 *  - Custom themes: "I-save" the look of a schedule item. A picture / video background is saved
 *    as its Media id (the file stays in the media database + CouchDB sync), never as a copy.
 *  - "Default theme" = the last one applied to the whole schedule; new songs / verses get its background.
 * Saved in this browser (localStorage). Not synced to CouchDB yet.
 */
import type { BackgroundSettings, ScheduleItem, TextStyle } from "../types";
import { DEFAULT_TEXT_STYLE, sanitizeTextStyle } from "./textStyle";
import { SAMPLE_BACKGROUNDS } from "../data/easyworshipData";
import { resolveSongBackground } from "./songBackground";

export type ThemeBackground = { kind: "css"; css: string } | { kind: "media"; id: string };

export interface PresentationTheme {
  id: string;
  name: string;
  builtIn?: boolean;
  textStyle: TextStyle;
  background: ThemeBackground;
  bgSettings: BackgroundSettings;
}

export const NO_BG_SETTINGS: BackgroundSettings = { dim: 0, fit: "cover", blur: 0 };
/** Same fallback the Simulator uses for an item without a background. */
export const DEFAULT_ITEM_BG = "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)";

const ts = (patch: Partial<TextStyle>): TextStyle => ({ ...DEFAULT_TEXT_STYLE, ...patch });
const css = (c: string): ThemeBackground => ({ kind: "css", css: c });

export const BUILT_IN_THEMES: PresentationTheme[] = [
  { id: "th-classic", name: "Classic", builtIn: true, textStyle: ts({}), background: css(DEFAULT_ITEM_BG), bgSettings: NO_BG_SETTINGS },
  {
    id: "th-bold-gold",
    name: "Bold Gold",
    builtIn: true,
    textStyle: ts({ fontFamily: "Arial", color: "#fcd34d", outline: true, shadow: true }),
    background: css("radial-gradient(100% 100% at 50% 0%, #3f3f46 0%, #18181b 60%, #09090b 100%)"),
    bgSettings: NO_BG_SETTINGS,
  },
  {
    id: "th-clean-light",
    name: "Clean Light",
    builtIn: true,
    textStyle: ts({ fontFamily: "Segoe UI", color: "#0f172a", shadow: false }),
    background: css("radial-gradient(120% 90% at 50% 0%, #ffffff 0%, #eef2f7 55%, #dbe3ee 100%)"),
    bgSettings: NO_BG_SETTINGS,
  },
  {
    id: "th-calm",
    name: "Calm Gradient",
    builtIn: true,
    textStyle: ts({ fontFamily: "Calibri", scale: 1.1 }),
    background: css("radial-gradient(80% 70% at 15% 85%, #7e22ce 0%, transparent 60%), radial-gradient(70% 60% at 85% 15%, #db2777 0%, transparent 55%), #1e0b33"),
    bgSettings: NO_BG_SETTINGS,
  },
  {
    id: "th-lower-third",
    name: "Lower Third",
    builtIn: true,
    textStyle: ts({ fontFamily: "Segoe UI", scale: 0.75, valign: "bottom", shadow: true }),
    background: css("linear-gradient(180deg, #0b3a4a 0%, #0b3a4a 55%, #04161d 100%)"),
    bgSettings: NO_BG_SETTINGS,
  },
  {
    id: "th-serif",
    name: "Serif Hymn",
    builtIn: true,
    textStyle: ts({ fontFamily: "Georgia", bold: false, color: "#fef3c7" }),
    background: css("radial-gradient(100% 80% at 80% 0%, #166534 0%, transparent 55%), linear-gradient(160deg, #052e16 0%, #064e3b 60%, #022c22 100%)"),
    bgSettings: NO_BG_SETTINGS,
  },
  {
    id: "th-sunrise",
    name: "Sunrise",
    builtIn: true,
    textStyle: ts({ fontFamily: "Trebuchet MS" }),
    background: css("radial-gradient(90% 70% at 50% 110%, #f59e0b 0%, transparent 60%), linear-gradient(180deg, #1e1b4b 0%, #7c2d12 70%, #b45309 100%)"),
    bgSettings: { dim: 0.15, fit: "cover", blur: 0 },
  },
  {
    id: "th-ocean",
    name: "Ocean",
    builtIn: true,
    textStyle: ts({ fontFamily: "Verdana", scale: 0.95 }),
    background: css("linear-gradient(180deg, #082f49 0%, #0e7490 55%, #155e75 100%)"),
    bgSettings: NO_BG_SETTINGS,
  },
];

// ---------------- storage ----------------
const KEY = "wtp-pres-themes-v1";
export const MAX_CUSTOM_THEMES = 30;

export interface ThemeStore {
  defaultId: string | null;
  custom: PresentationTheme[];
}

const MEDIA_ID_RE = /^(img|vid)-[A-Za-z0-9_-]{1,80}$/;
const clampNum = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);

function cleanBgSettings(raw: any): BackgroundSettings {
  return { dim: clampNum(raw?.dim, 0, 0.7, 0), fit: raw?.fit === "contain" ? "contain" : "cover", blur: clampNum(raw?.blur, 0, 20, 0) };
}

/** Gradients / colors only from storage — never url(…) (pictures come back by Media id). */
const safeCss = (c: unknown): c is string => typeof c === "string" && c.length > 0 && c.length <= 2000 && !/url\s*\(|expression|javascript:|[<>{};]/i.test(c);

export function cleanTheme(raw: any): PresentationTheme | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && /^th-[A-Za-z0-9_-]{1,60}$/.test(raw.id) ? raw.id : null;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 40) : "";
  if (!id || !name) return null;
  const b = raw.background;
  const background: ThemeBackground | null =
    b?.kind === "media" && typeof b.id === "string" && MEDIA_ID_RE.test(b.id) ? { kind: "media", id: b.id } : b?.kind === "css" && safeCss(b.css) ? { kind: "css", css: b.css } : null;
  if (!background) return null;
  return { id, name, textStyle: sanitizeTextStyle(raw.textStyle), background, bgSettings: cleanBgSettings(raw.bgSettings) };
}

export function loadThemeStore(): ThemeStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    const custom = Array.isArray(raw?.custom) ? (raw.custom.map(cleanTheme).filter(Boolean) as PresentationTheme[]).slice(0, MAX_CUSTOM_THEMES) : [];
    const all = [...BUILT_IN_THEMES, ...custom];
    const defaultId = typeof raw?.defaultId === "string" && all.some((t) => t.id === raw.defaultId) ? raw.defaultId : null;
    return { defaultId, custom };
  } catch {
    return { defaultId: null, custom: [] };
  }
}

export function saveThemeStore(s: ThemeStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked / full */
  }
}

export const allThemes = (s: ThemeStore) => [...BUILT_IN_THEMES, ...s.custom];
export const findTheme = (s: ThemeStore, id: string | null | undefined) => (id ? allThemes(s).find((t) => t.id === id) : undefined);

// ---------------- applying ----------------
/** What a schedule item needs for its background. Null = a picture/video that is not in this browser. */
export interface ItemBg {
  background: string;
  bgMediaId?: string;
  bgSettings: BackgroundSettings;
}

export async function resolveThemeBg(t: PresentationTheme): Promise<ItemBg | null> {
  if (t.background.kind === "css") return { background: t.background.css, bgSettings: t.bgSettings };
  const r = await resolveSongBackground(t.background.id);
  if (!r.css) return null;
  return { background: r.css, bgMediaId: t.background.id, bgSettings: t.bgSettings };
}

/** Cheap preview background for a theme card (pictures/videos: their css once resolved, else a dark placeholder). */
export const previewCss = (t: PresentationTheme, mediaCss?: string | null) => (t.background.kind === "css" ? t.background.css : mediaCss || "#111");

/** Builds a custom theme from how an item looks now. Pictures/videos become a Media id; other url(…) = default bg. */
export function themeFromItem(name: string, style: TextStyle, item: ScheduleItem | undefined): PresentationTheme {
  let background: ThemeBackground = { kind: "css", css: DEFAULT_ITEM_BG };
  if (item?.bgMediaId && MEDIA_ID_RE.test(item.bgMediaId)) background = { kind: "media", id: item.bgMediaId };
  else if (item?.background && safeCss(item.background)) background = { kind: "css", css: item.background };
  else if (item?.background) {
    const sample = SAMPLE_BACKGROUNDS.find((b) => b.css === item.background);
    if (sample) background = { kind: "css", css: sample.css };
  }
  return {
    id: `th-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 40) || "Aking theme",
    textStyle: sanitizeTextStyle(style),
    background,
    bgSettings: cleanBgSettings(item?.bgSettings),
  };
}
