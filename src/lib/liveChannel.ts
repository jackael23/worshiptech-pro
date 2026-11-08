/**
 * 2026-10-28 (Jarvis): keeps projector output windows (?output=main) in sync with the app,
 * using the browser's BroadcastChannel — same browser, same site, no server, no internet.
 *
 * Messages
 *  app → output : "frame"       the current LiveState (sent on every change and on request)
 *  app → all    : "app-hello"   the app (re)loaded — outputs answer with what they show,
 *                               so a reload never changes what's on the projector
 *  output → app : "output-hello" / "ping" (every 2 s) / "bye" / "frame-from-output" / "key"
 *
 * 2026-11-08 (Mira): two kinds of output window — "main" = projector (?output=main), "stage" = Stage
 * screen for musicians / worship leaders with chords (?output=stage). hello / ping say which kind, so the
 * app counts them apart. With 3 screens (laptop + projector + TV) each kind remembers its own screen.
 */
import type { LiveState } from "../types";

export const LIVE_CHANNEL = "wtp-live-v1";

export type OutputKind = "main" | "stage";

export type LiveMessage =
  | { type: "frame"; state: LiveState }
  | { type: "app-hello" }
  | { type: "output-hello"; id: string; kind?: OutputKind }
  | { type: "ping"; id: string; kind?: OutputKind }
  | { type: "bye"; id: string }
  | { type: "frame-from-output"; id: string; state: LiveState }
  /** Keys pressed while the output window has focus (PgDn, ↑/↓, Ctrl+B/C/L) — run in the app. */
  | { type: "key"; key: string; ctrlKey: boolean };

export const OUTPUT_PING_MS = 2000;
export const OUTPUT_TIMEOUT_MS = 6000;

export function openLiveChannel(onMessage: (m: LiveMessage) => void): { post: (m: LiveMessage) => void; close: () => void } | null {
  if (typeof BroadcastChannel === "undefined") return null;
  const ch = new BroadcastChannel(LIVE_CHANNEL);
  ch.onmessage = (e) => {
    const m = e.data as LiveMessage;
    if (m && typeof m === "object" && typeof m.type === "string") onMessage(m);
  };
  return {
    post: (m) => {
      try {
        ch.postMessage(m);
      } catch {
        /* channel closed */
      }
    },
    close: () => ch.close(),
  };
}

/** Keys that the output window forwards to the app. */
export function isForwardedKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey && ["b", "c", "l"].includes(e.key.toLowerCase())) return true;
  // 2026-11-07: ← / → too (previous / next live slide, like ↑ / ↓)
  return ["PageDown", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key);
}

// ---------- opening the window ----------

const OUTPUT_URL = (kind: OutputKind) => `${location.origin}${location.pathname}?output=${kind}`;
const WINDOW_NAME = (kind: OutputKind) => `wtp-output-${kind}`;

/** True when this browser can place a window on another screen (Chrome / Edge: Window Management API). */
export function canUseSecondScreen(): boolean {
  return typeof window !== "undefined" && "getScreenDetails" in window;
}

type ScreenDetailed = { left?: number; top?: number; availLeft: number; availTop: number; availWidth: number; availHeight: number; width?: number; height?: number; isPrimary?: boolean; label?: string };
type ScreenDetails = { screens: ScreenDetailed[]; currentScreen: ScreenDetailed };

const getDetails = () => (window as unknown as { getScreenDetails: () => Promise<ScreenDetails> }).getScreenDetails();

/** 2026-11-08: a screen the user can pick for an output window. key = where it sits (stays the same between visits). */
export interface ScreenChoice {
  key: string;
  label: string;
  width: number;
  height: number;
  isCurrent: boolean;
}

const screenKey = (s: ScreenDetailed) => `${s.left ?? s.availLeft},${s.top ?? s.availTop},${s.width ?? s.availWidth}x${s.height ?? s.availHeight}`;

const SCREEN_PREF_KEY = "wtp.outputScreens.v1";

/** Remembered screen for each kind of output window (null = none yet). */
export function loadScreenChoice(kind: OutputKind): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(SCREEN_PREF_KEY) || "{}");
    return typeof v?.[kind] === "string" ? v[kind] : null;
  } catch {
    return null;
  }
}

function saveScreenChoice(kind: OutputKind, key: string) {
  try {
    const v = JSON.parse(localStorage.getItem(SCREEN_PREF_KEY) || "{}");
    localStorage.setItem(SCREEN_PREF_KEY, JSON.stringify({ ...(v && typeof v === "object" ? v : {}), [kind]: key }));
  } catch {
    /* storage blocked: just don't remember */
  }
}

/** The screens connected to this computer (asks for the "window management" permission once). */
export async function listScreens(): Promise<ScreenChoice[] | "denied" | "unsupported"> {
  if (!canUseSecondScreen()) return "unsupported";
  try {
    const d = await getDetails();
    return d.screens.map((s, i) => ({
      key: screenKey(s),
      label: s.label || `Screen ${i + 1}`,
      width: s.width ?? s.availWidth,
      height: s.height ?? s.availHeight,
      isCurrent: s === d.currentScreen,
    }));
  } catch {
    return "denied";
  }
}

/**
 * Opens (or focuses) an output window (projector or Stage screen).
 * secondScreen=true: asks for the "window management" permission and places the window on another screen:
 *   the one picked for this kind before (screenKey, or the remembered one), else a screen that the other kind
 *   isn't using, else any screen other than this one. A picked screen is remembered for next time.
 * Returns what happened, for a short notice in the UI.
 */
export async function openOutputWindow(
  secondScreen: boolean,
  kind: OutputKind = "main",
  pickKey?: string,
): Promise<"opened" | "second-screen" | "no-second-screen" | "denied" | "blocked"> {
  let features = "popup,width=960,height=540,left=80,top=80";
  let result: "opened" | "second-screen" | "no-second-screen" | "denied" = "opened";
  if (secondScreen && canUseSecondScreen()) {
    try {
      const details = await getDetails();
      const others = details.screens.filter((s) => s !== details.currentScreen);
      const wanted = pickKey ?? loadScreenChoice(kind);
      const otherKind = loadScreenChoice(kind === "main" ? "stage" : "main");
      const target =
        details.screens.find((s) => wanted && screenKey(s) === wanted) ??
        others.find((s) => screenKey(s) !== otherKind) ??
        others[0];
      if (target) {
        features = `popup,left=${target.availLeft},top=${target.availTop},width=${target.availWidth},height=${target.availHeight}`;
        result = "second-screen";
        if (pickKey) saveScreenChoice(kind, pickKey);
      } else result = "no-second-screen";
    } catch {
      result = "denied"; // permission refused
    }
  }
  const w = window.open(OUTPUT_URL(kind), WINDOW_NAME(kind), features);
  if (!w) return "blocked";
  w.focus();
  return result;
}
