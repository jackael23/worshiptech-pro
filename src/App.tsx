/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { Header, MobileNav, AppTab, Theme } from "./components/Header";
import { ChatAssistant } from "./components/ChatAssistant";
import { WorkflowCanvasSimulator } from "./components/WorkflowCanvasSimulator";
import { VisualGuidesDeck } from "./components/VisualGuidesDeck";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { EasyWorshipVersion, SupportedLanguage, LiveState } from "./types";
import { SAMPLE_SONGS } from "./data/easyworshipData";
import { openLiveChannel, LiveMessage, OUTPUT_TIMEOUT_MS } from "./lib/liveChannel";
import { useLogoFrame, withLogo } from "./lib/logoStore";

// 2026-10-28 (Jarvis): theme (dark by default) — saved in this browser; index.html applies it before first paint.
const THEME_KEY = "wtp-theme";
function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* storage blocked */
  }
  return "dark";
}

export default function App() {
  const [version, setVersion] = useState<EasyWorshipVersion>("EasyWorship 7");
  const [language, setLanguage] = useState<SupportedLanguage>("Tagalog");
  // 2026-10-29 (Jarvis): Simulator opens first (sabi ni Jack); Chat is one click away.
  const [activeTab, setActiveTab] = useState<AppTab>("simulator");
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#111113" : "#ffffff");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage blocked */
    }
  }, [theme]);

  const [liveState, setLiveState] = useState<LiveState>({
    isLive: true,
    isBlackout: false,
    isClearText: false,
    isLogo: false,
    activeScheduleItemId: "sched-2",
    // 2026-10-29 (Jarvis): was 0, but the text below is slide #2 (index 1) — the phone remote's
    // Next/Prev step from this index, so the first Next looked like it did nothing.
    activeSlideIndex: 1,
    currentSlideLabel: SAMPLE_SONGS[0].slides[1].label,
    currentSlideText: SAMPLE_SONGS[0].slides[1].text,
    nextSlideText: SAMPLE_SONGS[0].slides[2].text,
    backgroundMediaUrl: SAMPLE_SONGS[0].defaultBackground,
    ndiActive: true,
    foldbackEnabled: true,
    nurseryAlertText: "",
    nurseryAlertActive: false,
  });

  // 2026-10-28 (Jarvis): projector output windows (?output=main) — see lib/liveChannel.ts
  const initialLiveRef = useRef(liveState); // untouched default = never pushed over what a projector shows
  const liveRef = useRef(liveState);
  liveRef.current = liveState;
  // 2026-11-06: the custom Logo screen is merged in only when a frame is sent (see lib/logoStore.ts)
  const logo = useLogoFrame();
  const logoRef = useRef(logo);
  logoRef.current = logo;
  const [outputCount, setOutputCount] = useState(0);
  const chRef = useRef<ReturnType<typeof openLiveChannel>>(null);

  useEffect(() => {
    const seen = new Map<string, number>();
    const mountedAt = Date.now();
    const ch = openLiveChannel((m: LiveMessage) => {
      if (m.type === "output-hello" || m.type === "ping") {
        const isNew = !seen.has(m.id);
        seen.set(m.id, Date.now());
        setOutputCount(seen.size);
        if (m.type === "output-hello" || isNew) ch?.post({ type: "frame", state: withLogo(liveRef.current, logoRef.current) });
      } else if (m.type === "bye") {
        seen.delete(m.id);
        setOutputCount(seen.size);
      } else if (m.type === "frame-from-output") {
        seen.set(m.id, Date.now());
        setOutputCount(seen.size);
        // after a reload, keep what the projector already shows (only if nothing was changed here yet)
        if (liveRef.current === initialLiveRef.current && Date.now() - mountedAt < 5000) setLiveState(m.state);
      } else if (m.type === "key") {
        // keys pressed in the output window run here (the Simulator listens on window)
        window.dispatchEvent(new KeyboardEvent("keydown", { key: m.key, ctrlKey: m.ctrlKey, bubbles: true }));
      }
    });
    chRef.current = ch;
    ch?.post({ type: "app-hello" });
    const sweep = setInterval(() => {
      const now = Date.now();
      for (const [id, t] of seen) if (now - t > OUTPUT_TIMEOUT_MS) seen.delete(id);
      setOutputCount(seen.size);
    }, 2000);
    return () => {
      clearInterval(sweep);
      ch?.close();
    };
  }, []);

  useEffect(() => {
    if (liveState === initialLiveRef.current) return; // nothing changed yet — don't overwrite the projector
    chRef.current?.post({ type: "frame", state: withLogo(liveState, logo) });
  }, [liveState, logo]);

  const [initialAIQuery, setInitialAIQuery] = useState<string | null>(null);

  const handleAskAssistant = (query: string) => {
    setActiveTab("chat");
    setInitialAIQuery(query);
  };

  const fullBleed = activeTab === "chat" || activeTab === "simulator";

  return (
    // 2026-10-20 (Jarvis): app fills the screen (100dvh); only <main> scrolls.
    // 2026-10-28: design-system shell — app bar on top, bottom nav on phones.
    <div className="h-dvh overflow-hidden bg-canvas text-fg flex flex-col font-sans">
      <Header
        version={version}
        setVersion={setVersion}
        language={language}
        setLanguage={setLanguage}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      />

      <main className="flex-1 min-h-0 overflow-y-auto w-full">
        <div
          className={`mx-auto flex w-full flex-col items-center justify-start p-2 sm:p-4 ${
            activeTab === "simulator" ? "max-w-[1600px]" : "max-w-7xl"
          } ${fullBleed ? "h-full" : "min-h-full"}`}
        >
          {activeTab === "chat" && (
            <ChatAssistant version={version} language={language} onOpenSimulator={() => setActiveTab("simulator")} onOpenGuides={() => setActiveTab("guides")} />
          )}

          {activeTab === "simulator" && (
            <WorkflowCanvasSimulator version={version} liveState={liveState} setLiveState={setLiveState} onAskAssistant={handleAskAssistant} outputCount={outputCount} />
          )}

          {activeTab === "guides" && (
            <VisualGuidesDeck version={version} language={language} onOpenSimulator={() => setActiveTab("simulator")} onAskAI={handleAskAssistant} />
          )}

          {activeTab === "shortcuts" && <ShortcutsPanel version={version} onAskAI={handleAskAssistant} />}
        </div>
      </main>

      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
}
