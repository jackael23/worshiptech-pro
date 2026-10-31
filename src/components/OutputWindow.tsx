/**
 * 2026-10-28 (Jarvis): projector / second-monitor window (opened at ?output=main).
 *  - Shows only the LIVE screen, 16:9, centered on black; follows the app through liveChannel.
 *  - Keeps the last slide if the app reloads or closes (never blanks the projector by itself).
 *  - Fullscreen: tries automatically on open (works only where the browser policy
 *    AutomaticFullscreenAllowedForUrls allows this site); otherwise one click or Enter.
 *  - Cursor + small controls appear only when the mouse moves.
 *  - PgDn, ↑/↓, Ctrl+B/C/L pressed here are sent to the app.
 */
import React, { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Maximize } from "lucide-react";
import type { LiveState } from "../types";
import { LiveMainScreen } from "./LiveScreen";
import { openLiveChannel, isForwardedKey, LiveMessage, OUTPUT_PING_MS } from "../lib/liveChannel";

export const OutputWindow: React.FC = () => {
  const [state, setState] = useState<LiveState | null>(null);
  const [showUi, setShowUi] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stateRef = useRef<LiveState | null>(null);
  stateRef.current = state;
  const idRef = useRef(`out-${Math.random().toString(36).slice(2, 9)}`);
  const chRef = useRef<ReturnType<typeof openLiveChannel>>(null);

  // channel
  useEffect(() => {
    document.title = "WorshipTech-Pro — Output";
    document.documentElement.dataset.theme = "dark";
    const id = idRef.current;
    const ch = openLiveChannel((m: LiveMessage) => {
      if (m.type === "frame") {
        setState(m.state);
      } else if (m.type === "app-hello" && stateRef.current) {
        // the app reloaded: tell it what the projector is showing, so it can keep it
        ch?.post({ type: "frame-from-output", id, state: stateRef.current });
      }
    });
    chRef.current = ch;
    ch?.post({ type: "output-hello", id });
    const ping = setInterval(() => ch?.post({ type: "ping", id }), OUTPUT_PING_MS);
    const bye = () => ch?.post({ type: "bye", id });
    window.addEventListener("pagehide", bye);
    return () => {
      bye();
      clearInterval(ping);
      window.removeEventListener("pagehide", bye);
      ch?.close();
    };
  }, []);

  // forward hotkeys to the app
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isForwardedKey(e)) return;
      e.preventDefault();
      chRef.current?.post({ type: "key", key: e.key, ctrlKey: e.ctrlKey });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // hide cursor + controls after 2.5 s without mouse movement
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setShowUi(true);
      clearTimeout(t);
      t = setTimeout(() => setShowUi(false), 2500);
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
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const enterFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else enterFullscreen();
  };

  // 2026-10-28: try fullscreen right away. Browsers only allow this without a click when the
  // AutomaticFullscreenAllowedForUrls policy lists this site (Chrome 128+ / Edge 132+); otherwise it
  // fails quietly and the "Enter / click" hint below is shown.
  useEffect(() => {
    enterFullscreen();
    const onEnter = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        enterFullscreen();
      }
    };
    window.addEventListener("keydown", onEnter);
    return () => window.removeEventListener("keydown", onEnter);
  }, []);

  return (
    <div
      className={`fixed inset-0 grid place-items-center bg-black ${showUi ? "" : "cursor-none"}`}
      onClick={enterFullscreen}
      data-testid="output-window"
    >
      {/* 16:9 box that fits the window (letterboxed) */}
      <div style={{ width: "min(100vw, calc(100vh * 16 / 9))" }}>
        {state ? (
          <LiveMainScreen liveState={state} textScale={3.9} />
        ) : (
          <div className="grid aspect-video w-full place-items-center bg-black text-sm text-zinc-500">
            Naghihintay sa WorshipTech-Pro… Buksan ang Simulator sa kabilang window.
          </div>
        )}
      </div>

      {/* one-time hint until fullscreen (one click or Enter) */}
      {!isFullscreen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center" data-testid="fullscreen-hint">
          <span className="inline-flex items-center gap-2 rounded-full bg-zinc-900/90 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15">
            <Maximize className="h-4 w-4" />
            I-click o pindutin ang <kbd className="rounded border border-white/30 bg-white/10 px-1.5 font-mono text-xs">Enter</kbd> para fullscreen
          </span>
        </div>
      )}

      {/* operator controls — only while the mouse moves */}
      <div
        className={`fixed right-3 top-3 flex items-center gap-2 rounded-lg bg-zinc-900/90 px-2.5 py-1.5 text-xs text-zinc-200 ring-1 ring-white/10 transition-opacity duration-300 ${
          showUi ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${state ? "bg-emerald-500" : "bg-zinc-500"}`} />
          {state ? "Output · naka-sync" : "Hindi pa konektado"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium hover:bg-white/10"
          title="Fullscreen (o i-click ang screen / Enter). Esc = lumabas"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>
    </div>
  );
};
