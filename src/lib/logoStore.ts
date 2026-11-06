/**
 * 2026-11-06 (Jarvis): the Logo screen (Ctrl+L) — the app's default, or the church's own
 * picture / video / built-in background with an optional title + subtitle.
 *
 * Settings live in this browser (localStorage "wtp-logo-v1": it is a setting of the laptop that runs
 * the service). The picture / video itself stays in the Media database (and its CouchDB sync);
 * only its id is saved here.
 *
 * The resolved logo is NOT kept inside the app's LiveState (App.tsx keeps an untouched LiveState so a
 * reload never overwrites what the projector shows). It is merged in with withLogo() right where a
 * frame is shown or sent: Live monitor, projector window, phone remote.
 */
import { useEffect, useState } from "react";
import type { BackgroundSettings, LiveState } from "../types";
import { SONG_BG_ID_RE, sanitizeBgSettings } from "./mySongsStore";
import { resolveSongBackground } from "./songBackground";
import { isVideoId, watchMedia } from "./mediaStore";

export const LOGO_STORAGE_KEY = "wtp-logo-v1";
export const LOGO_TEXT_MAX = 80;

export interface LogoSettings {
  /** false = the app's default logo screen. */
  custom: boolean;
  /** "bg-…" built-in, "img-…" picture, "vid-…" video (Media tab). */
  bgId?: string;
  bgSettings?: BackgroundSettings;
  title: string;
  subtitle: string;
}

export const DEFAULT_LOGO: LogoSettings = { custom: false, title: "", subtitle: "" };

/** What a screen needs to draw the custom logo (merged into LiveState). */
export interface LogoFrame {
  logoCustom?: boolean;
  logoBackground?: string;
  logoVideoId?: string;
  logoSettings?: BackgroundSettings;
  logoTitle?: string;
  logoSubtitle?: string;
  /** true = the chosen picture / video is not in this browser (deleted / not synced yet). */
  logoMissing?: boolean;
}

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, LOGO_TEXT_MAX) : "");

export function sanitizeLogo(raw: unknown): LogoSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LOGO };
  const o = raw as Record<string, unknown>;
  const bgId = typeof o.bgId === "string" && SONG_BG_ID_RE.test(o.bgId) ? o.bgId : undefined;
  return {
    custom: o.custom === true,
    bgId,
    bgSettings: bgId ? sanitizeBgSettings(o.bgSettings) : undefined,
    title: clean(o.title),
    subtitle: clean(o.subtitle),
  };
}

export function loadLogoSettings(): LogoSettings {
  try {
    const raw = window.localStorage.getItem(LOGO_STORAGE_KEY);
    return raw ? sanitizeLogo(JSON.parse(raw)) : { ...DEFAULT_LOGO };
  } catch {
    return { ...DEFAULT_LOGO };
  }
}

/** Returns false when the browser refused to save (private mode / full). */
export function saveLogoSettings(s: LogoSettings): boolean {
  try {
    window.localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(sanitizeLogo(s)));
    return true;
  } catch {
    return false;
  }
}

/** Settings → frame (async: a picture / poster is read from the media database). */
export async function resolveLogo(s: LogoSettings): Promise<LogoFrame> {
  if (!s.custom) return {};
  const base: LogoFrame = { logoCustom: true, logoTitle: s.title || undefined, logoSubtitle: s.subtitle || undefined };
  if (!s.bgId) return base;
  const r = await resolveSongBackground(s.bgId);
  // Picture / video not in this browser: keep the title on a dark screen, or the default logo if there is no text.
  if (!r.css) return s.title || s.subtitle ? { ...base, logoMissing: true } : {};
  return {
    ...base,
    logoBackground: r.css,
    logoVideoId: r.mediaId && isVideoId(r.mediaId) ? r.mediaId : undefined,
    logoSettings: s.bgSettings,
  };
}

const LOGO_KEYS = ["logoCustom", "logoBackground", "logoVideoId", "logoSettings", "logoTitle", "logoSubtitle", "logoMissing"] as const;

/**
 * LiveState + the current logo, for the screens. Any logo fields already in the state (e.g. a frame
 * read back from a projector window after a reload) are replaced, so an old logo never sticks.
 */
export function withLogo(state: LiveState, logo: LogoFrame): LiveState {
  const hasOld = LOGO_KEYS.some((k) => (state as unknown as Record<string, unknown>)[k] !== undefined);
  if (!logo.logoCustom && !hasOld) return state; // same object = nothing re-renders
  const next = { ...state } as LiveState & Record<string, unknown>;
  for (const k of LOGO_KEYS) delete next[k];
  return logo.logoCustom ? { ...next, ...logo } : next;
}

// ---- one shared copy for the whole app (App.tsx + Simulator + settings dialog) ----
let settings: LogoSettings | null = null;
let frame: LogoFrame = {};
let run = 0;
const listeners = new Set<() => void>();
let mediaWatch: (() => void) | null = null;

function notify() {
  listeners.forEach((l) => l());
}

async function refresh() {
  const my = ++run;
  const next = await resolveLogo(settings || DEFAULT_LOGO);
  if (my !== run) return; // a newer change is on its way
  frame = next;
  notify();
}

function ensureLoaded() {
  if (settings) return;
  settings = loadLogoSettings();
  void refresh();
  if (!mediaWatch) {
    try {
      mediaWatch = watchMedia(() => {
        if (settings?.custom && settings.bgId && !settings.bgId.startsWith("bg-")) void refresh();
      });
    } catch {
      mediaWatch = () => undefined;
    }
  }
}

export function getLogoSettings(): LogoSettings {
  ensureLoaded();
  return settings!;
}

/** Saves + applies at once (Live / projector / phones follow). */
export function setLogoSettings(next: LogoSettings): boolean {
  settings = sanitizeLogo(next);
  const ok = saveLogoSettings(settings);
  notify();
  void refresh();
  return ok;
}

/** The current resolved logo; re-renders when it changes. */
export function useLogoFrame(): LogoFrame {
  ensureLoaded();
  const [f, setF] = useState<LogoFrame>(frame);
  useEffect(() => {
    const l = () => setF(frame);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return f;
}
