/**
 * 2026-10-28 (Jarvis): keeps projector output windows (?output=main) in sync with the app,
 * using the browser's BroadcastChannel — same browser, same site, no server, no internet.
 *
 * Messages
 *  app → output : "frame"       the current LiveState (sent on every change and on request)
 *  app → all    : "app-hello"   the app (re)loaded — outputs answer with what they show,
 *                               so a reload never changes what's on the projector
 *  output → app : "output-hello" / "ping" (every 2 s) / "bye" / "frame-from-output" / "key"
 */
import type { LiveState } from "../types";

export const LIVE_CHANNEL = "wtp-live-v1";

export type LiveMessage =
  | { type: "frame"; state: LiveState }
  | { type: "app-hello" }
  | { type: "output-hello"; id: string }
  | { type: "ping"; id: string }
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
  return ["PageDown", "ArrowDown", "ArrowUp"].includes(e.key);
}

// ---------- opening the window ----------

const OUTPUT_URL = () => `${location.origin}${location.pathname}?output=main`;
const WINDOW_NAME = "wtp-output-main";

/** True when this browser can place a window on another screen (Chrome / Edge: Window Management API). */
export function canUseSecondScreen(): boolean {
  return typeof window !== "undefined" && "getScreenDetails" in window;
}

type ScreenDetailed = { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary?: boolean; label?: string };

/**
 * Opens (or focuses) the projector window.
 * secondScreen=true: asks for the "window management" permission and places the window on a screen
 * other than this one. Returns what happened, for a short notice in the UI.
 */
export async function openOutputWindow(secondScreen: boolean): Promise<"opened" | "second-screen" | "no-second-screen" | "denied" | "blocked"> {
  let features = "popup,width=960,height=540,left=80,top=80";
  let result: "opened" | "second-screen" | "no-second-screen" | "denied" = "opened";
  if (secondScreen && canUseSecondScreen()) {
    try {
      const details = await (window as unknown as { getScreenDetails: () => Promise<{ screens: ScreenDetailed[]; currentScreen: ScreenDetailed }> }).getScreenDetails();
      const other = details.screens.find((s) => s !== details.currentScreen);
      if (other) {
        features = `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`;
        result = "second-screen";
      } else result = "no-second-screen";
    } catch {
      result = "denied"; // permission refused
    }
  }
  const w = window.open(OUTPUT_URL(), WINDOW_NAME, features);
  if (!w) return "blocked";
  w.focus();
  return result;
}
