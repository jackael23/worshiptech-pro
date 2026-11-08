/**
 * 2026-11-08 (Mira): Stage screen (opened at ?output=stage) — the TV that musicians and worship leaders
 * look at during practice and service.
 *  - Current slide with chords above the words (big), next slide's first lines (small), section label,
 *    song key and a clock. Slides without chords show the lyrics only.
 *  - Follows the app through liveChannel, like the projector window (no server, no internet).
 *  - Black / Clear / Logo on the projector do NOT blank this screen (musicians keep their place);
 *    a small tag at the top says what the projector is doing.
 *  - Transpose, text size and chords on/off are saved in this window's browser storage.
 *  - Fullscreen: click or Enter. PgDn, ↑/↓, ←/→, Ctrl+B/C/L pressed here run in the app.
 */
import React, { useEffect, useRef, useState } from "react";
import { Maximize, Maximize2, Minimize2, Minus, Plus, Music2 } from "lucide-react";
import type { LiveState } from "../types";
import { openLiveChannel, isForwardedKey, LiveMessage, OUTPUT_PING_MS } from "../lib/liveChannel";
import { transposeKey } from "../lib/chords";
import { ChordSheet, nextPreview } from "./ChordSheet";

const PREFS_KEY = "wtp.stageScreen.v1";
interface StagePrefs {
  transpose: number; // -11..11 semitones
  size: number; // 0.6..1.8 × base text size
  chords: boolean;
}
const DEFAULT_PREFS: StagePrefs = { transpose: 0, size: 1, chords: true };

function loadPrefs(): StagePrefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    const n = (x: unknown, min: number, max: number, d: number) => (typeof x === "number" && isFinite(x) ? Math.min(max, Math.max(min, x)) : d);
    return { transpose: Math.round(n(v.transpose, -11, 11, 0)), size: n(v.size, 0.6, 1.8, 1), chords: v.chords !== false };
  } catch {
    return DEFAULT_PREFS;
  }
}


export const StageScreen: React.FC = () => {
  const [state, setState] = useState<LiveState | null>(null);
  const [prefs, setPrefs] = useState<StagePrefs>(loadPrefs);
  const [showUi, setShowUi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clock, setClock] = useState("");
  const idRef = useRef(`stage-${Math.random().toString(36).slice(2, 9)}`);
  const chRef = useRef<ReturnType<typeof openLiveChannel>>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* storage blocked */
    }
  }, [prefs]);

  // channel (Stage screens only listen — they never send their frame back to the app)
  useEffect(() => {
    document.title = "WorshipTech-Pro — Stage screen";
    document.documentElement.dataset.theme = "dark";
    const id = idRef.current;
    const ch = openLiveChannel((m: LiveMessage) => {
      if (m.type === "frame") setState(m.state);
      else if (m.type === "app-hello") ch?.post({ type: "output-hello", id, kind: "stage" });
    });
    chRef.current = ch;
    ch?.post({ type: "output-hello", id, kind: "stage" });
    const ping = setInterval(() => ch?.post({ type: "ping", id, kind: "stage" }), OUTPUT_PING_MS);
    const bye = () => ch?.post({ type: "bye", id });
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      clearInterval(ping);
      window.removeEventListener("pagehide", bye);
      ch?.close();
    };
  }, []);

  // clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);

  // forward hotkeys to the app; Enter = fullscreen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        enterFullscreen();
        return;
      }
      if (!isForwardedKey(e)) return;
      e.preventDefault();
      chRef.current?.post({ type: "key", key: e.key, ctrlKey: e.ctrlKey });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // controls + cursor only while the mouse moves
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setShowUi(true);
      clearTimeout(t);
      t = setTimeout(() => setShowUi(false), 3000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    enterFullscreen(); // works only where the browser policy allows it; otherwise click / Enter
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  function enterFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else enterFullscreen();
  };
  const setP = (p: Partial<StagePrefs>) => setPrefs((prev) => ({ ...prev, ...p }));

  const live = state && state.isLive && (state.currentSlideText || state.currentSlideImage);
  const key = state?.songKey ? transposeKey(state.songKey, prefs.transpose) : "";
  const projector = !state ? "" : state.isBlackout ? "BLACK" : state.isLogo ? "LOGO" : state.isClearText ? "TEXT OFF" : "";
  const next = state ? nextPreview(state) : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={`fixed inset-0 flex flex-col bg-black p-[2.5vmin] font-sans text-white ${showUi ? "" : "cursor-none"}`}
      onClick={enterFullscreen}
      data-testid="stage-screen"
    >
      {/* top bar: section · key · projector status · clock */}
      <div className="flex items-center gap-[2vmin] border-b border-zinc-800 pb-[1.2vmin] font-mono text-[3vmin] text-zinc-400">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-white">{live ? state!.currentSlideLabel || "—" : "STAGE"}</span>
          {key && (
            <span className="ml-[2vmin] text-amber-300">
              Key {key}
              {prefs.transpose ? ` (${prefs.transpose > 0 ? "+" : ""}${prefs.transpose})` : ""}
            </span>
          )}
        </span>
        {projector && <span className="rounded bg-red-900/70 px-[1.2vmin] text-[2.4vmin] font-semibold text-red-100">PROJECTOR: {projector}</span>}
        <span className="rounded bg-zinc-900 px-[1.2vmin] tabular-nums text-white">{clock}</span>
      </div>

      {/* current slide */}
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-hidden py-[2vmin]" style={{ fontSize: `${5.2 * prefs.size}vmin` }}>
        {!state ? (
          <p className="text-center text-[0.5em] text-zinc-500">Naghihintay sa WorshipTech-Pro… Buksan ang Simulator sa kabilang window.</p>
        ) : !live ? (
          <p className="text-center text-[0.6em] text-zinc-500">Standby</p>
        ) : state.currentSlideText ? (
          <ChordSheet
            text={state.currentSlideText}
            chords={state.currentSlideChords}
            transpose={prefs.transpose}
            songKey={state.songKey}
            showChords={prefs.chords}
            className="font-semibold"
          />
        ) : (
          <p className="text-center text-[0.6em] text-zinc-400">(larawan sa projector)</p>
        )}
        {live && state!.currentSlideNotes && (
          <p className="mt-[0.6em] whitespace-pre-line text-[0.5em] text-emerald-300">
            <span className="font-semibold text-sky-400">NOTES: </span>
            {state!.currentSlideNotes}
          </p>
        )}
      </div>

      {/* next slide */}
      <div className="border-t border-zinc-800 pt-[1.2vmin]" style={{ fontSize: `${3 * prefs.size}vmin` }}>
        <span className="font-mono text-[0.8em] font-semibold text-sky-400">NEXT</span>
        {live && next ? (
          <ChordSheet text={next.text} chords={next.chords} transpose={prefs.transpose} songKey={state!.songKey} showChords={prefs.chords} className="text-yellow-200" />
        ) : (
          <span className="ml-[1.5vmin] text-zinc-500">{live ? "(End)" : "—"}</span>
        )}
      </div>

      {!isFullscreen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15">
            <Maximize className="h-4 w-4" />
            I-click o pindutin ang <kbd className="rounded border border-white/30 bg-white/10 px-1.5 font-mono text-xs">Enter</kbd> para fullscreen
          </span>
        </div>
      )}

      {/* controls — only while the mouse moves */}
      <div
        onClick={stop}
        className={`fixed right-3 top-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-900/95 px-2.5 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 transition-opacity duration-300 ${
          showUi ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="inline-flex items-center gap-1.5 pr-1">
          <span className={`h-2 w-2 rounded-full ${state ? "bg-emerald-500" : "bg-zinc-500"}`} />
          {state ? "Stage · naka-sync" : "Hindi pa konektado"}
        </span>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <span className="text-zinc-400">Transpose</span>
        <button onClick={() => setP({ transpose: Math.max(-11, prefs.transpose - 1) })} className="rounded-md p-1 hover:bg-white/10" aria-label="Transpose down" data-testid="stage-transpose-down">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setP({ transpose: 0 })} className="min-w-8 rounded-md px-1 py-0.5 font-mono tabular-nums hover:bg-white/10" title="Balik sa orihinal">
          {prefs.transpose > 0 ? `+${prefs.transpose}` : prefs.transpose}
        </button>
        <button onClick={() => setP({ transpose: Math.min(11, prefs.transpose + 1) })} className="rounded-md p-1 hover:bg-white/10" aria-label="Transpose up" data-testid="stage-transpose-up">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <button onClick={() => setP({ size: Math.max(0.6, +(prefs.size - 0.1).toFixed(2)) })} className="rounded-md px-1.5 py-0.5 hover:bg-white/10" aria-label="Mas maliit na text">
          A−
        </button>
        <button onClick={() => setP({ size: Math.min(1.8, +(prefs.size + 0.1).toFixed(2)) })} className="rounded-md px-1.5 py-0.5 text-sm hover:bg-white/10" aria-label="Mas malaking text">
          A+
        </button>
        <button
          onClick={() => setP({ chords: !prefs.chords })}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${prefs.chords ? "bg-amber-400/20 text-amber-200" : "hover:bg-white/10"}`}
          aria-pressed={prefs.chords}
        >
          <Music2 className="h-3.5 w-3.5" />
          Chords
        </button>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <button onClick={toggleFullscreen} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-medium hover:bg-white/10" title="Fullscreen (o i-click ang screen / Enter). Esc = lumabas">
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
};
