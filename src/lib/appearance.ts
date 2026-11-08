/**
 * 2026-11-07 (Mira): Appearance settings for the app itself (not the projector).
 *  - mode: dark / light / auto (follows Windows)
 *  - accent: one of ACCENTS (blue = the old look)
 *  - background: none, a built-in scene (animated / nature, drawn in code — no downloads, works offline),
 *    or a picture / video from the Media tab (the file stays in the media database + its CouchDB sync)
 *  - motion: animated scenes can be paused (also paused automatically for "reduce motion")
 * Saved in this browser (localStorage). index.html reads the same key before first paint.
 */

export type AppearanceMode = "dark" | "light" | "auto";
export type ResolvedMode = "dark" | "light";

export interface AppBackground {
  /** "" = none, "scene-…" = built-in, "img-…" / "vid-…" = Media tab upload. */
  id: string;
  /** 0–0.8: how much the canvas color covers the background (keeps text readable). */
  dim: number;
  /** 0–20 px blur (pictures / videos only). */
  blur: number;
}

export interface Appearance {
  mode: AppearanceMode;
  accent: string;
  bg: AppBackground;
  motion: boolean;
}

export const APPEARANCE_KEY = "wtp-appearance-v1";
const OLD_THEME_KEY = "wtp-theme"; // 2026-10-28 dark/light toggle — still written so older code paths agree

export const DEFAULT_BG: AppBackground = { id: "", dim: 0.3, blur: 0 };
export const DEFAULT_APPEARANCE: Appearance = { mode: "dark", accent: "blue", bg: DEFAULT_BG, motion: true };

/** Accent colors. Each keeps white text on buttons readable (≈4.5:1 or better, blue = unchanged). */
export const ACCENTS: { id: string; name: string; swatch: string }[] = [
  { id: "blue", name: "Blue", swatch: "#3b82f6" },
  { id: "purple", name: "Purple", swatch: "#7c3aed" },
  { id: "green", name: "Green", swatch: "#15803d" },
  { id: "teal", name: "Teal", swatch: "#0f766e" },
  { id: "orange", name: "Orange", swatch: "#c2410c" },
  { id: "gold", name: "Gold", swatch: "#b45309" },
];

export type SceneKind = "animated" | "nature";
/** Built-in scenes. `thumb` is a cheap still used in the picker; the real scene is drawn by AppBackdrop. */
export const SCENES: { id: string; name: string; kind: SceneKind; thumb: string }[] = [
  { id: "scene-aurora", name: "Aurora", kind: "animated", thumb: "radial-gradient(60% 50% at 25% 35%, #14b8a6 0%, transparent 70%), radial-gradient(55% 45% at 75% 55%, #8b5cf6 0%, transparent 70%), #07131f" },
  { id: "scene-stars", name: "Starry Night", kind: "animated", thumb: "radial-gradient(1px 1px at 20% 30%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 70% 20%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 45% 60%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 85% 70%, #fff 50%, transparent 51%), linear-gradient(180deg, #050816 0%, #1b1f4b 100%)" },
  { id: "scene-bokeh", name: "Bokeh Lights", kind: "animated", thumb: "radial-gradient(12% 12% at 25% 40%, rgb(251 191 36 / .7) 0%, transparent 100%), radial-gradient(16% 16% at 70% 60%, rgb(236 72 153 / .55) 0%, transparent 100%), radial-gradient(10% 10% at 60% 25%, rgb(96 165 250 / .6) 0%, transparent 100%), #120d1f" },
  { id: "scene-waves", name: "Gentle Waves", kind: "animated", thumb: "linear-gradient(180deg, #0b1d3a 0%, #0b1d3a 50%, #1e3a8a 50%, #1e3a8a 68%, #2563eb 68%, #2563eb 84%, #3b82f6 84%)" },
  { id: "scene-mountains", name: "Mountain Sunrise", kind: "nature", thumb: "linear-gradient(180deg, #fb923c 0%, #fcd34d 45%, #7c3aed 46%, #4c1d95 70%, #1e1b4b 100%)" },
  { id: "scene-forest", name: "Forest Mist", kind: "nature", thumb: "linear-gradient(180deg, #a7c4b5 0%, #5b8a72 40%, #24543f 70%, #0f2e22 100%)" },
  { id: "scene-ocean", name: "Ocean Sunset", kind: "nature", thumb: "linear-gradient(180deg, #f97316 0%, #fdba74 45%, #0e7490 46%, #083344 100%)" },
  { id: "scene-lake", name: "Moonlit Lake", kind: "nature", thumb: "radial-gradient(10% 14% at 70% 25%, #fef9c3 0%, transparent 100%), linear-gradient(180deg, #0b1026 0%, #1e2a5a 55%, #0f172a 56%, #020617 100%)" },
];

const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);

/** Background ids we accept from storage (anything else = none). */
export const isValidBgId = (id: unknown): id is string =>
  typeof id === "string" && (id === "" || SCENES.some((s) => s.id === id) || /^(img|vid)-[A-Za-z0-9_-]{1,80}$/.test(id));

export function sanitizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Appearance> & { bg?: Partial<AppBackground> };
  const bg: Partial<AppBackground> = r.bg && typeof r.bg === "object" ? r.bg : {};
  return {
    mode: r.mode === "light" || r.mode === "auto" || r.mode === "dark" ? r.mode : DEFAULT_APPEARANCE.mode,
    accent: ACCENTS.some((a) => a.id === r.accent) ? (r.accent as string) : DEFAULT_APPEARANCE.accent,
    bg: {
      id: isValidBgId(bg.id) ? bg.id : "",
      dim: clamp(bg.dim, 0, 0.8, DEFAULT_BG.dim),
      blur: clamp(bg.blur, 0, 20, DEFAULT_BG.blur),
    },
    motion: typeof r.motion === "boolean" ? r.motion : true,
  };
}

export function loadAppearance(): Appearance {
  try {
    const s = localStorage.getItem(APPEARANCE_KEY);
    if (s) return sanitizeAppearance(JSON.parse(s));
    // first run after this update: keep the old dark/light choice
    const old = localStorage.getItem(OLD_THEME_KEY);
    if (old === "light" || old === "dark") return { ...DEFAULT_APPEARANCE, mode: old };
  } catch {
    /* storage blocked or broken JSON → defaults */
  }
  return DEFAULT_APPEARANCE;
}

export function saveAppearance(a: Appearance, resolved: ResolvedMode) {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a));
    localStorage.setItem(OLD_THEME_KEY, resolved);
  } catch {
    /* storage blocked */
  }
}

export const systemPrefersDark = () => {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return true;
  }
};

export const resolveMode = (mode: AppearanceMode, systemDark: boolean): ResolvedMode => (mode === "auto" ? (systemDark ? "dark" : "light") : mode);

/** Puts the settings on <html> (data-theme / data-accent / data-appbg / data-motion). */
export function applyAppearance(a: Appearance, resolved: ResolvedMode) {
  const el = document.documentElement;
  el.dataset.theme = resolved;
  el.dataset.accent = a.accent;
  if (a.bg.id) el.dataset.appbg = "on";
  else delete el.dataset.appbg;
  el.dataset.motion = a.motion ? "on" : "off";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "dark" ? "#111113" : "#ffffff");
}
