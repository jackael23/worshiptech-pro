import React, { useState, useEffect, useRef } from "react";
import {
  FileMusic,
  BookOpen,
  Image as ImageIcon,
  Tv,
  Radio,
  Play,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Search,
  AlertTriangle,
  Sliders,
  Sparkles,
  Send,
  Layers,
  MonitorUp,
  ScreenShare,
  Presentation as PresentationIcon,
  Smartphone,
  RefreshCw,
  Type as TypeIcon,
  X,
  Settings2,
} from "lucide-react";
import {
  MediaTabType,
  SongItem,
  ScheduleItem,
  LiveState,
  EasyWorshipVersion,
  TextStyle,
  BackgroundSettings,
  SlideContent,
} from "../types";
import { INITIAL_SCHEDULE } from "../data/easyworshipData";
import { getCachedSchedule, loadSchedule, saveSchedule, loadSelectedIndex, saveSelectedIndex } from "../lib/scheduleStore";
import { SongLibrary } from "./SongLibrary";
import { BibleLibrary, Passage } from "./BibleLibrary";
import { PresentationLibrary } from "./PresentationLibrary";
import { SlideScreen } from "./SlideScreen";
import { LiveMainScreen } from "./LiveScreen";
import { openOutputWindow, canUseSecondScreen } from "../lib/liveChannel";
import type { StoredPresentation } from "../lib/presentationStore";
import { useRemoteHost, scheduleForRemote, RemoteCmd } from "../lib/remoteLink";
import { loadTextStyle, saveTextStyle, resolveTextStyle, sameStyle } from "../lib/textStyle";
import { TextStyleEditor } from "./TextStyleEditor";
import { MediaLibrary } from "./MediaLibrary";
import { isVideoId } from "../lib/mediaStore";
import { useLogoFrame, withLogo } from "../lib/logoStore";
import { LogoSettingsModal } from "./LogoSettingsModal";

/** 2026-11-05: video background of an item ("vid-…"), unless the slide has its own (PowerPoint) background. */
const videoOf = (item: ScheduleItem | undefined, slide?: SlideContent) =>
  item && !slide?.background && item.background && isVideoId(item.bgMediaId) ? item.bgMediaId : undefined;

interface WorkflowCanvasSimulatorProps {
  version: EasyWorshipVersion;
  liveState: LiveState;
  setLiveState: React.Dispatch<React.SetStateAction<LiveState>>;
  onAskAssistant: (query: string) => void;
  /** 2026-10-28: number of projector output windows connected (?output=main). */
  outputCount?: number;
}

export const WorkflowCanvasSimulator: React.FC<WorkflowCanvasSimulatorProps> = ({
  version,
  liveState,
  setLiveState,
  onAskAssistant,
  outputCount = 0,
}) => {
  // Simulator Local States
  const [activeMediaTab, setActiveMediaTab] = useState<MediaTabType>("songs");
  const [searchQuery, setSearchQuery] = useState("");
  // 2026-11-03c (Jarvis): the schedule is kept (browser database) until the user changes/removes items.
  // The sample schedule shows only on the very first run. See lib/scheduleStore.ts.
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>(() => getCachedSchedule() ?? INITIAL_SCHEDULE);
  const [selectedScheduleIndex, setSelectedScheduleIndex] = useState<number>(() => {
    const cached = getCachedSchedule();
    return cached ? Math.min(loadSelectedIndex(), cached.length - 1) : 0;
  });
  const scheduleLoaded = useRef(getCachedSchedule() !== null);
  useEffect(() => {
    if (scheduleLoaded.current) return;
    let alive = true;
    loadSchedule().then((saved) => {
      if (!alive) return;
      if (saved && saved.length > 0) {
        setScheduleItems(saved);
        setSelectedScheduleIndex(Math.min(loadSelectedIndex(), saved.length - 1));
        setSelectedSlideIndex(0);
        // The app opens with a demo slide "on air" (sample schedule). If that item isn't in the
        // saved schedule, show Standby instead of a slide that isn't there.
        setLiveState((prev) =>
          prev.activeScheduleItemId && !saved.some((i) => i.id === prev.activeScheduleItemId)
            ? { ...prev, isLive: false, activeScheduleItemId: null, currentSlideText: "", currentSlideLabel: "", nextSlideText: undefined }
            : prev,
        );
      }
      scheduleLoaded.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    // don't overwrite the saved schedule with the sample before it has been read
    if (scheduleLoaded.current) saveSchedule(scheduleItems);
  }, [scheduleItems]);
  useEffect(() => {
    if (scheduleLoaded.current) saveSelectedIndex(selectedScheduleIndex);
  }, [selectedScheduleIndex]);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState<number>(0);
  const [previewOutputMode, setPreviewOutputMode] = useState<"main" | "foldback" | "ndi">("main");
  const [customAlertInput, setCustomAlertInput] = useState("Nursery: Parent #104 please come to Nursery");
  const [simulatedTime, setSimulatedTime] = useState("");
  // 2026-10-20 (Jarvis): on phones/tablets (< lg) show one panel at a time instead of 3 squeezed panels.
  // 2026-10-28 (Jarvis): projector output window
  const [outputNotice, setOutputNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const handleOpenOutput = async (secondScreen: boolean) => {
    const r = await openOutputWindow(secondScreen);
    const msg: Record<typeof r, { text: string; tone: "ok" | "warn" }> = {
      opened: { text: "Bukas na ang output window. I-drag ito sa projector, tapos i-click ito o pindutin ang Enter para fullscreen.", tone: "ok" },
      "second-screen": { text: "Nasa second screen na ang output. Kung hindi pa fullscreen, pindutin ang Enter (o i-click ang projector).", tone: "ok" },
      "no-second-screen": { text: "Walang nakitang second screen — sa screen na ito binuksan. Ikabit ang projector at subukan ulit.", tone: "warn" },
      denied: { text: "Hindi pinayagan ang 'window management', kaya dito binuksan. I-drag sa projector, tapos i-click o Enter para fullscreen.", tone: "warn" },
      blocked: { text: "Na-block ng browser ang bagong window. Pindutin ulit ang button (o payagan ang pop-ups para sa site na ito).", tone: "warn" },
    };
    setOutputNotice(msg[r]);
  };
  useEffect(() => {
    if (!outputNotice) return;
    const t = setTimeout(() => setOutputNotice(null), 8000);
    return () => clearTimeout(t);
  }, [outputNotice]);

  const [mobilePanel, setMobilePanel] = useState<"library" | "schedule" | "live">("library");
  const panelVis = (p: "library" | "schedule" | "live") => (mobilePanel === p ? "flex" : "hidden") + " lg:flex";

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setSimulatedTime(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);


  // Selected schedule item & slide
  const currentScheduleItem = scheduleItems[selectedScheduleIndex] || scheduleItems[0];
  const currentPreviewSlide = currentScheduleItem?.slides?.[selectedSlideIndex] || currentScheduleItem?.slides?.[0];

  // 2026-10-29 (Jarvis): text style — global (saved in this browser) + optional per schedule item.
  const [globalStyle, setGlobalStyle] = useState<TextStyle>(loadTextStyle);
  const [styleTarget, setStyleTarget] = useState<"global" | "item">("global");
  const styleFor = (item?: ScheduleItem) => resolveTextStyle(globalStyle, item?.textStyle);
  /** Re-applies the style to the slide on air (only when it actually changes). */
  const refreshLiveStyle = (global: TextStyle, items: ScheduleItem[]) => {
    setLiveState((prev) => {
      const onAir = items.find((i) => i.id === prev.activeScheduleItemId);
      const ts = resolveTextStyle(global, onAir?.textStyle);
      return sameStyle(prev.textStyle, ts) ? prev : { ...prev, textStyle: ts };
    });
  };
  const handleGlobalStyle = (next: TextStyle) => {
    setGlobalStyle(next);
    saveTextStyle(next);
    refreshLiveStyle(next, scheduleItems);
  };
  // 2026-10-29 (Jarvis): background picture + dim/fit/blur of an item — on air right away if it is live.
  const refreshLiveBackground = (items: ScheduleItem[]) => {
    setLiveState((prev) => {
      const onAir = items.find((i) => i.id === prev.activeScheduleItemId);
      if (!onAir) return prev;
      const slide = onAir.slides[prev.activeSlideIndex];
      const bg = slide?.background || onAir.background || "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)";
      const video = videoOf(onAir, slide);
      if (bg === prev.backgroundMediaUrl && video === prev.backgroundVideoId && JSON.stringify(onAir.bgSettings ?? null) === JSON.stringify(prev.backgroundSettings ?? null)) return prev;
      return { ...prev, backgroundMediaUrl: bg, backgroundVideoId: video, backgroundSettings: onAir.bgSettings };
    });
  };
  const handleItemBackground = (itemId: string, css: string | null, mediaId?: string) => {
    // 2026-11-05: bgMediaId = which upload (a "vid-…" id makes it a video background)
    const items = scheduleItems.map((i) => (i.id === itemId ? { ...i, background: css || undefined, bgMediaId: (css && mediaId) || undefined } : i));
    setScheduleItems(items);
    refreshLiveBackground(items);
  };
  const handleItemBgSettings = (itemId: string, next: BackgroundSettings) => {
    const items = scheduleItems.map((i) => (i.id === itemId ? { ...i, bgSettings: next } : i));
    setScheduleItems(items);
    refreshLiveBackground(items);
  };
  const handleItemStyle = (itemId: string, next: TextStyle | null) => {
    const items = scheduleItems.map((i) => (i.id === itemId ? { ...i, textStyle: next } : i));
    setScheduleItems(items);
    refreshLiveStyle(globalStyle, items);
  };

  // Helper actions
  const handleAddSongToSchedule = (song: SongItem): ScheduleItem => {
    const newItem: ScheduleItem = {
      id: `sched-${Date.now()}`,
      title: `${scheduleItems.length + 1}. ${song.title}`,
      type: "song",
      slides: song.slides,
      activeSlideIndex: 0,
      background: song.defaultBackground,
      // 2026-11-06: My Song's own background (picture / video upload + dim / fit / blur)
      ...(song.bgMediaId ? { bgMediaId: song.bgMediaId } : {}),
      ...(song.bgId && song.bgSettings ? { bgSettings: song.bgSettings } : {}),
    };
    setScheduleItems((prev) => [...prev, newItem]);
    setSelectedScheduleIndex(scheduleItems.length);
    setSelectedSlideIndex(0);
    return newItem;
  };

  // 2026-10-20 (Jarvis): put a specific slide of a schedule item on air (used by GO LIVE / Page Down
  // and by double-click on a slide, a schedule item, or a song in the library).
  const goLiveAt = (item: ScheduleItem | undefined, slideIdx: number) => {
    const slide = item?.slides?.[slideIdx];
    if (!item || !slide) return;
    setLiveState((prev) => ({
      ...prev,
      isLive: true,
      isBlackout: false,
      isClearText: false,
      isLogo: false,
      activeScheduleItemId: item.id,
      activeSlideIndex: slideIdx,
      currentSlideLabel: slide.label,
      currentSlideText: slide.text,
      nextSlideText: item.slides[slideIdx + 1]?.text || item.slides[slideIdx + 1]?.label || "",
      // 2026-10-28: PowerPoint slides carry their own background / picture / notes.
      backgroundMediaUrl: slide.background || item.background || "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
      currentSlideImage: slide.image,
      currentSlideTextColor: slide.textColor,
      currentSlideNotes: slide.notes,
      textStyle: styleFor(item),
      backgroundSettings: item.bgSettings,
      backgroundVideoId: videoOf(item, slide),
    }));
  };

  /** Double-click a song in the library: add it to the schedule and go live with its first slide. */
  const handleLiveSong = (song: SongItem) => {
    const item = handleAddSongToSchedule(song);
    goLiveAt(item, 0);
  };

  // 2026-10-20 (Jarvis): scripture comes in as a passage (1+ verses → 1 slide per verse),
  // from built-in samples or an imported full Bible (BibleLibrary).
  const handleAddPassage = (p: Passage): ScheduleItem => {
    const newItem: ScheduleItem = {
      id: `sched-${Date.now()}`,
      title: `${scheduleItems.length + 1}. ${p.title}`,
      type: "scripture",
      slides: p.slides,
      activeSlideIndex: 0,
      background: "linear-gradient(135deg, #0284c7 0%, #082f49 100%)",
    };
    setScheduleItems((prev) => [...prev, newItem]);
    setSelectedScheduleIndex(scheduleItems.length);
    setSelectedSlideIndex(0);
    return newItem;
  };

  // 2026-10-29 (Jarvis): through goLiveAt (same screen as before) so the live item is known —
  // the phone remote's Next/Prev need it to step through the verses.
  const handleLivePassage = (p: Passage) => {
    goLiveAt(handleAddPassage(p), 0);
  };

  // 2026-10-28 (Jarvis): PowerPoint deck (Presentations tab) → schedule item, 1 PPT slide = 1 slide.
  const handleAddPresentation = (p: StoredPresentation): ScheduleItem => {
    const newItem: ScheduleItem = {
      id: `sched-${Date.now()}`,
      title: `${scheduleItems.length + 1}. ${p.name}`,
      type: "presentation",
      slides: p.slides,
      activeSlideIndex: 0,
    };
    setScheduleItems((prev) => [...prev, newItem]);
    setSelectedScheduleIndex(scheduleItems.length);
    setSelectedSlideIndex(0);
    return newItem;
  };

  const handleLivePresentation = (p: StoredPresentation) => {
    goLiveAt(handleAddPresentation(p), 0);
  };

  const handleGoLive = () => {
    if (!currentScheduleItem || !currentPreviewSlide) return;
    goLiveAt(currentScheduleItem, selectedSlideIndex);
  };

  const handleToggleBlack = () => {
    setLiveState((prev) => ({ ...prev, isBlackout: !prev.isBlackout }));
  };

  const handleToggleClear = () => {
    setLiveState((prev) => ({ ...prev, isClearText: !prev.isClearText }));
  };

  const handleToggleLogo = () => {
    setLiveState((prev) => ({ ...prev, isLogo: !prev.isLogo }));
  };

  const handleSendNurseryAlert = () => {
    if (!customAlertInput) return;
    setLiveState((prev) => ({
      ...prev,
      nurseryAlertText: customAlertInput,
      nurseryAlertActive: !prev.nurseryAlertActive,
    }));
  };

  const handleMoveScheduleItem = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === scheduleItems.length - 1)) return;
    const newItems = [...scheduleItems];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setScheduleItems(newItems);
    setSelectedScheduleIndex(targetIndex);
  };

  const handleDeleteScheduleItem = (index: number) => {
    if (scheduleItems.length <= 1) return;
    const newItems = scheduleItems.filter((_, i) => i !== index);
    setScheduleItems(newItems);
    setSelectedScheduleIndex(Math.max(0, index - 1));
    setSelectedSlideIndex(0);
  };

  // ---------- 2026-10-29 (Jarvis): phone remote (same WiFi; see lib/remoteLink.ts) ----------
  /** Puts a slide on air and makes the laptop's Schedule/Preview follow it. */
  const liveAndSelect = (itemId: string, slideIdx: number) => {
    const idx = scheduleItems.findIndex((i) => i.id === itemId);
    const item = scheduleItems[idx];
    if (!item || !item.slides[slideIdx]) return;
    setSelectedScheduleIndex(idx);
    setSelectedSlideIndex(slideIdx);
    goLiveAt(item, slideIdx);
  };
  const handleRemoteCmd = (cmd: RemoteCmd) => {
    switch (cmd.type) {
      case "black":
        return handleToggleBlack();
      case "clear":
        return handleToggleClear();
      case "logo":
        return handleToggleLogo();
      case "golive":
        return handleGoLive();
      case "next":
      case "prev": {
        const step = cmd.type === "next" ? 1 : -1;
        const onAir = scheduleItems.find((i) => i.id === liveState.activeScheduleItemId);
        if (onAir) return liveAndSelect(onAir.id, liveState.activeSlideIndex + step);
        // nothing on air yet: Next = put the laptop's preview slide on air
        if (step === 1) handleGoLive();
        return;
      }
      case "live":
        return liveAndSelect(cmd.itemId, cmd.slide);
      case "select": {
        const idx = scheduleItems.findIndex((i) => i.id === cmd.itemId);
        if (idx < 0 || !scheduleItems[idx].slides[cmd.slide]) return;
        setSelectedScheduleIndex(idx);
        setSelectedSlideIndex(cmd.slide);
        return;
      }
      case "alert":
        if (cmd.text.trim()) setCustomAlertInput(cmd.text);
        setLiveState((prev) => ({
          ...prev,
          nurseryAlertText: cmd.text.trim() ? cmd.text : prev.nurseryAlertText,
          nurseryAlertActive: cmd.show && !!(cmd.text.trim() || prev.nurseryAlertText),
        }));
        return;
    }
  };
  const remote = useRemoteHost(handleRemoteCmd);
  // 2026-10-29: Output toolbar panels (one open at a time; X / Esc / same button closes)
  const [tool, setTool] = useState<null | "projector" | "phone" | "style">(null);
  // 2026-11-06: custom Logo screen (picture / video + title) — merged into what the screens show
  const logo = useLogoFrame();
  const shownLive = withLogo(liveState, logo);
  const [logoOpen, setLogoOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!tool) return;
    popoverRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTool(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool]);

  useEffect(() => {
    if (remote.availability !== "ready") return;
    const onAir = scheduleItems.find((i) => i.id === liveState.activeScheduleItemId);
    const nextSlide = onAir?.slides[liveState.activeSlideIndex + 1];
    remote.publish({
      live: shownLive,
      next: nextSlide
        ? {
            label: nextSlide.label,
            text: nextSlide.text,
            image: nextSlide.image,
            background: nextSlide.background || onAir?.background,
            textColor: nextSlide.textColor,
            textStyle: styleFor(onAir),
            bgSettings: onAir?.bgSettings,
          }
        : null,
      selected: { itemId: currentScheduleItem?.id ?? null, slide: selectedSlideIndex },
      schedule: scheduleForRemote(scheduleItems),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.availability, remote.publish, liveState, logo, scheduleItems, currentScheduleItem?.id, selectedSlideIndex]);

  // Keyboard shortcut simulation handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      // 2026-10-29: SELECT too (font list) — ↑/↓ there must not change slides
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      // Don't drive the live output while a dialog (e.g. Song editor) is open.
      if (document.querySelector('[role="dialog"]')) return;

      // 2026-10-20 (Jarvis): same keys as real EasyWorship 7 (see EW_KEYS).
      const k = e.key.toLowerCase();
      if (e.ctrlKey && k === "b") {
        e.preventDefault();
        handleToggleBlack();
      } else if (e.ctrlKey && k === "c") {
        // Let normal copy work when the user has selected text.
        if (window.getSelection()?.toString()) return;
        e.preventDefault();
        handleToggleClear();
      } else if (e.ctrlKey && k === "l") {
        e.preventDefault();
        handleToggleLogo();
      } else if (e.key === "PageDown") {
        e.preventDefault();
        handleGoLive();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (currentScheduleItem && selectedSlideIndex < currentScheduleItem.slides.length - 1) {
          setSelectedSlideIndex((prev) => prev + 1);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (selectedSlideIndex > 0) {
          setSelectedSlideIndex((prev) => prev - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentScheduleItem, selectedSlideIndex]);

  // 2026-10-28 (Jarvis): redesign — titles are stored as "3. Song"; the list shows its own number.
  const cleanTitle = (t: string) => t.replace(/^\d+\.\s*/, "");
  const typeIcon = (type: ScheduleItem["type"]) =>
    type === "song" ? FileMusic : type === "scripture" ? BookOpen : type === "presentation" ? PresentationIcon : type === "media" ? ImageIcon : AlertTriangle;
  const liveOnAir = liveState.isLive && !liveState.isBlackout;
  const liveStateLabel = liveState.isBlackout ? "Black" : liveState.isLogo ? "Logo" : liveState.isClearText ? "Text off" : "On air";
  const libraryTabs: { id: MediaTabType; label: string; icon: React.ElementType; title?: string }[] = [
    { id: "songs", label: "Songs", icon: FileMusic },
    { id: "scriptures", label: "Bibles", icon: BookOpen },
    { id: "media", label: "Media", icon: ImageIcon },
    { id: "presentations", label: "PPT", icon: PresentationIcon, title: "Presentations (PowerPoint)" },
  ];

  return (
    <div className="panel flex h-full min-h-[30rem] w-full flex-col overflow-hidden">
      {/* ===== Toolbar ===== */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Layers className="h-4 w-4 shrink-0 text-accent" />
          <h2 className="text-sm font-semibold text-fg">Simulator</h2>
          {outputCount > 0 && (
            <span
              className="badge border-transparent bg-ok-soft text-fg"
              title="May nakakonektang output window."
            >
              <span className="h-1.5 w-1.5 rounded-full bg-ok" />
              Output connected{outputCount > 1 ? ` (${outputCount})` : ""}
            </span>
          )}
          {remote.availability === "ready" && !remote.active && (
            <button
              onClick={() => remote.takeOver()}
              className="badge border-transparent bg-warn-soft text-fg"
              title="May ibang Simulator tab na sinusunod ng phone. I-click para dito na sumunod ang phone."
              data-testid="remote-takeover"
            >
              <Smartphone className="h-3 w-3" />
              Phone: ibang tab · Gamitin dito
            </button>
          )}
          {remote.active && remote.phones > 0 && (
            <span className="badge border-transparent bg-ok-soft text-fg" title="May nakakonektang phone remote">
              <Smartphone className="h-3 w-3" />
              Phone{remote.phones > 1 ? ` (${remote.phones})` : ""}
            </span>
          )}
          {/* simulated outputs (not real connections) */}
          <div className="ml-2 hidden items-center gap-3 border-l border-line pl-3 text-xs text-fg-muted xl:flex" title="Simulated outputs">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${liveOnAir ? "bg-live" : "bg-fg-subtle"}`} />
              Main
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${liveState.foldbackEnabled ? "bg-ok" : "bg-fg-subtle"}`} />
              Foldback
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${liveState.ndiActive ? "bg-ok" : "bg-fg-subtle"}`} />
              NDI
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-xs tabular-nums text-fg-subtle sm:inline">{simulatedTime}</span>
          <button onClick={() => onAskAssistant("Paano magdagdag ng bagong kanta sa library?")} className="btn btn-ghost tap-target">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="hidden sm:inline">Ask in Chat</span>
            <span className="sm:hidden">Chat</span>
          </button>
        </div>
      </div>

      {/* ===== Mobile panel switcher (< lg) ===== */}
      <div className="shrink-0 border-b border-line p-2 lg:hidden">
        <div className="seg grid w-full grid-cols-3" role="tablist" aria-label="Simulator panels">
          {([
            ["library", "Library", FileMusic],
            ["schedule", "Schedule", Sliders],
            ["live", "Live", Tv],
          ] as const).map(([id, text, Icon]) => (
            <button key={id} role="tab" aria-selected={mobilePanel === id} onClick={() => setMobilePanel(id)} className="seg-item w-full">
              <Icon className="h-4 w-4" />
              {text}
              {id === "live" && liveOnAir && <span className="h-2 w-2 rounded-full bg-live" aria-label="on air" />}
            </button>
          ))}
        </div>
      </div>
      {/* Mobile: what is on screen right now (tap to open the Live panel) */}
      {mobilePanel !== "live" && liveState.isLive && (
        <button
          onClick={() => setMobilePanel("live")}
          className="flex min-h-[44px] shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3 py-2 text-left text-xs lg:hidden"
        >
          <span className="badge badge-live shrink-0">{liveState.isBlackout ? "BLACK" : liveState.isLogo ? "LOGO" : "LIVE"}</span>
          <span className="flex-1 truncate text-fg-muted">
            <strong className="font-semibold text-fg">{liveState.currentSlideLabel}</strong> {liveState.currentSlideText.split("\n")[0]}
          </span>
          <span className="shrink-0 text-fg-subtle">Tingnan ›</span>
        </button>
      )}

      {/* ===== 3 panels ===== */}
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden lg:grid-cols-[minmax(16rem,0.95fr)_minmax(20rem,1.3fr)_minmax(21rem,1.3fr)] 2xl:grid-cols-[minmax(16rem,0.8fr)_minmax(20rem,1.05fr)_minmax(21rem,1.75fr)]">
        {/* ---------- PANEL 1: LIBRARY ---------- */}
        <section className={`${panelVis("library")} min-h-0 flex-col overflow-hidden lg:border-r lg:border-line`} aria-label="Library">
          <div className="space-y-2.5 border-b border-line p-3">
            <div className="hidden items-center justify-between lg:flex">
              <span className="eyebrow">Library</span>
            </div>
            <div className="seg grid w-full grid-cols-4" role="tablist" aria-label="Library">
              {libraryTabs.map(({ id, label, icon: Icon, title }) => (
                <button key={id} role="tab" aria-selected={activeMediaTab === id} onClick={() => setActiveMediaTab(id)} title={title} className="seg-item w-full px-1">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeMediaTab === "songs"
                    ? "Search song title (e.g. Amazing Grace)..."
                    : activeMediaTab === "scriptures"
                    ? "Reference o salita (hal. Juan 3:16, Awit 23)..."
                    : activeMediaTab === "presentations"
                    ? "Hanapin ang presentation o salita sa slide..."
                    : "Hanapin ang larawan o background…"
                }
                className="input h-8 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {/* Songs — samples, My Songs, reference (2026-10-20) */}
            {activeMediaTab === "songs" && <SongLibrary searchQuery={searchQuery} onAddToSchedule={handleAddSongToSchedule} onLiveSong={handleLiveSong} />}

            {/* Scripture — samples + imported full Bibles (2026-10-20) */}
            {activeMediaTab === "scriptures" && <BibleLibrary searchQuery={searchQuery} onAddPassage={handleAddPassage} onLivePassage={handleLivePassage} />}

            {/* PowerPoint decks (2026-10-28) */}
            {activeMediaTab === "presentations" && (
              <PresentationLibrary searchQuery={searchQuery} onAddToSchedule={handleAddPresentation} onLivePresentation={handleLivePresentation} />
            )}

            {/* Backgrounds */}
            {/* Media — uploaded background pictures + built-in offline backgrounds (2026-10-29) */}
            {activeMediaTab === "media" && (
              <MediaLibrary
                searchQuery={searchQuery}
                item={currentScheduleItem}
                onApply={(css, mediaId) => currentScheduleItem && handleItemBackground(currentScheduleItem.id, css, mediaId)}
                onSettings={(next) => currentScheduleItem && handleItemBgSettings(currentScheduleItem.id, next)}
              />
            )}
          </div>
        </section>

        {/* ---------- PANEL 2: SCHEDULE + SLIDES ---------- */}
        <section className={`${panelVis("schedule")} min-h-0 flex-col overflow-hidden lg:border-r lg:border-line`} aria-label="Schedule">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-3">
            <span className="eyebrow">
              Schedule <span className="ml-1 font-mono font-normal normal-case tracking-normal">{scheduleItems.length}</span>
            </span>
            <button
              onClick={() => {
                const title = prompt("Enter custom schedule item title:");
                if (title) {
                  setScheduleItems((prev) => [
                    ...prev,
                    {
                      id: `sched-${Date.now()}`,
                      title: `${prev.length + 1}. ${title}`,
                      type: "presentation",
                      activeSlideIndex: 0,
                      slides: [{ label: "Slide 1", text: title }],
                    },
                  ]);
                }
              }}
              className="btn btn-ghost btn-sm touch-44 lg:min-h-0 lg:min-w-0"
              title="Add custom item"
            >
              <Plus className="h-3.5 w-3.5" />
              Item
            </button>
          </div>

          {/* schedule items */}
          {/* 2026-10-28: taller list + bigger rows (sabi ni Jack: "lakihan / habaan ang schedule") */}
          <div className="max-h-[45%] min-h-[9rem] shrink-0 space-y-1 overflow-y-auto border-b border-line p-2 lg:max-h-[50%]">
            {scheduleItems.map((item, idx) => {
              const isSelected = selectedScheduleIndex === idx;
              const isItemLive = liveState.isLive && liveState.activeScheduleItemId === item.id;
              const TypeIcon = typeIcon(item.type);
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedScheduleIndex(idx);
                    setSelectedSlideIndex(0);
                  }}
                  onDoubleClick={() => {
                    setSelectedScheduleIndex(idx);
                    setSelectedSlideIndex(0);
                    goLiveAt(item, 0);
                  }}
                  title="Double-click = LIVE (unang slide)"
                  className={`group flex min-h-[48px] cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 text-[15px] touch-manipulation transition-colors lg:min-h-11 ${
                    isSelected ? "bg-accent-soft text-fg ring-1 ring-inset ring-accent/50" : "text-fg-muted hover:bg-surface-3 hover:text-fg"
                  }`}
                >
                  <span className="w-6 shrink-0 text-right font-mono text-sm tabular-nums text-fg-subtle">{String(idx + 1).padStart(2, "0")}</span>
                  <TypeIcon className={`h-4 w-4 shrink-0 ${isSelected ? "text-accent-text" : "text-fg-subtle"}`} />
                  <span className={`min-w-0 flex-1 truncate ${isSelected ? "font-medium" : ""}`}>{cleanTitle(item.title)}</span>
                  {isItemLive && <span className="badge badge-live px-1 py-0 leading-4">LIVE</span>}
                  <div className={`flex shrink-0 items-center ${isSelected ? "" : "lg:opacity-0 lg:group-hover:opacity-100"}`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveScheduleItem(idx, "up");
                      }}
                      className="touch-44 grid place-items-center rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg lg:min-h-0 lg:min-w-0"
                      title="Move up"
                      aria-label={`Move ${cleanTitle(item.title)} up`}
                    >
                      <MoveUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveScheduleItem(idx, "down");
                      }}
                      className="touch-44 grid place-items-center rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg lg:min-h-0 lg:min-w-0"
                      title="Move down"
                      aria-label={`Move ${cleanTitle(item.title)} down`}
                    >
                      <MoveDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScheduleItem(idx);
                      }}
                      className="touch-44 grid place-items-center rounded p-1 text-fg-subtle hover:bg-live-soft hover:text-live-text lg:min-h-0 lg:min-w-0"
                      title="Remove"
                      aria-label={`Remove ${cleanTitle(item.title)}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* slides of the selected item */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
              <span className="eyebrow truncate">
                Slides <span className="ml-1 font-mono font-normal normal-case tracking-normal">{currentScheduleItem?.slides?.length || 0}</span>
              </span>
              <span className="hidden items-center gap-1 text-xs text-fg-subtle sm:flex" title="Click = preview • Double-click = LIVE • ↑/↓ slides • Page Down = Go Live">
                <span className="kbd">↑</span>
                <span className="kbd">↓</span>
                select
                <span className="mx-1 text-line-strong">·</span>
                double-click = live
              </span>
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto px-3 pb-3 pt-1">
              {currentScheduleItem?.slides?.map((slide, sIdx) => {
                const isSlideSelected = selectedSlideIndex === sIdx;
                const isSlideLive = liveState.isLive && liveState.activeScheduleItemId === currentScheduleItem.id && liveState.activeSlideIndex === sIdx;
                return (
                  <div
                    key={sIdx}
                    onClick={() => setSelectedSlideIndex(sIdx)}
                    onDoubleClick={() => {
                      setSelectedSlideIndex(sIdx);
                      goLiveAt(currentScheduleItem, sIdx);
                    }}
                    title="Double-click = LIVE"
                    className="group cursor-pointer select-none touch-manipulation"
                  >
                    <div
                      className={`overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition-shadow ${
                        isSlideLive ? "ring-2 ring-live" : isSlideSelected ? "ring-2 ring-accent" : "ring-1 ring-line group-hover:ring-line-strong"
                      }`}
                    >
                      <SlideScreen slide={slide} background={currentScheduleItem.background} textScale={6.2} textStyle={styleFor(currentScheduleItem)} bgSettings={currentScheduleItem.bgSettings} ariaHidden />
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                      <span className="font-mono text-xs tabular-nums text-fg-subtle">{sIdx + 1}</span>
                      <span className={`min-w-0 flex-1 truncate text-xs ${isSlideSelected ? "font-medium text-fg" : "text-fg-muted"}`}>{cleanTitle(slide.label)}</span>
                      {isSlideLive && <span className="badge badge-live px-1 py-0 leading-4">LIVE</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- PANEL 3: OUTPUT ---------- */}
        {/* 2026-10-29 (Jarvis): setup tools (projector / phone / text style) moved into a compact
            toolbar with popovers, so Preview + Live + GO LIVE stay on screen. Preview | Live sit
            side by side when the column is wide enough (like EasyWorship / ProPresenter). */}
        <section className={`${panelVis("live")} @container/out relative min-h-0 flex-col overflow-hidden`} aria-label="Output">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
            <span className="eyebrow mr-1">Output</span>
            {([
              ["projector", "Projector output", "Projector", MonitorUp, outputCount > 0],
              ["phone", "Phone remote", "Phone", Smartphone, remote.phones > 0],
              ["style", "Text style", "Text", TypeIcon, false],
            ] as const).map(([id, label, short, Icon, on]) => (
              <button
                key={id}
                onClick={() => setTool((t) => (t === id ? null : id))}
                aria-label={label}
                aria-expanded={tool === id}
                title={id === "style" ? `Text style — ${globalStyle.fontFamily} · ${Math.round(globalStyle.scale * 100)}%${currentScheduleItem?.textStyle ? " (may sariling style ang item)" : ""}` : label}
                className={`btn btn-ghost relative h-8 px-2 ${tool === id ? "bg-surface-3 text-fg" : "text-fg-muted"}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden @[34rem]/out:inline">{short}</span>
                {id === "style" && (
                  <span className="sr-only" data-testid="ts-summary">
                    {globalStyle.fontFamily} · {Math.round(globalStyle.scale * 100)}%{currentScheduleItem?.textStyle ? " · may sariling style ang item" : ""}
                  </span>
                )}
                {on && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />}
              </button>
            ))}
            <div className="seg ml-auto" role="tablist" aria-label="Output screen">
              {([
                ["main", "Main"],
                ["foldback", "Foldback"],
                ["ndi", "NDI"],
              ] as const).map(([id, text]) => (
                <button key={id} role="tab" aria-selected={previewOutputMode === id} onClick={() => setPreviewOutputMode(id)} className="seg-item h-6 px-2">
                  {text}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {/* Preview | Live — side by side when wide, Live first when narrow */}
            <div className="grid gap-3 @[40rem]/out:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] @[40rem]/out:items-end">
              <div className="order-2 @[40rem]/out:order-1">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs">
                  <span className="font-medium text-fg-muted">Preview</span>
                  {currentPreviewSlide?.label && <span className="truncate text-fg-subtle">· {currentPreviewSlide.label}</span>}
                </div>
                <div className="max-w-[60%] overflow-hidden rounded-md ring-1 ring-accent/50 @[40rem]/out:max-w-none" data-testid="preview-screen">
                  <SlideScreen slide={currentPreviewSlide} background={currentScheduleItem?.background} textScale={6} textStyle={styleFor(currentScheduleItem)} bgSettings={currentScheduleItem?.bgSettings} bgVideoId={videoOf(currentScheduleItem, currentPreviewSlide)} ariaHidden />
                </div>
              </div>
              <div className="order-1 @[40rem]/out:order-2">
  {/* LIVE screen */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-2 font-medium text-fg">
                    <span className="relative flex h-2 w-2">
                      {liveOnAir && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-60" />}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${liveOnAir ? "bg-live" : "bg-fg-subtle"}`} />
                    </span>
                    Live
                    <span className="text-fg-subtle">
                      · {previewOutputMode === "main" ? "Main projector" : previewOutputMode === "foldback" ? "Stage monitor" : "OBS stream (NDI)"}
                    </span>
                  </span>
                  <span className={`badge ${liveState.isBlackout ? "" : liveState.isLive ? "badge-live" : ""}`}>{liveState.isLive ? liveStateLabel : "Standby"}</span>
                </div>

                <div className={`overflow-hidden rounded-lg ring-1 ${liveOnAir ? "ring-live/60" : "ring-line"}`} data-testid="live-monitor">
                  {/* MAIN — same component as the projector window (2026-10-28) */}
                  {previewOutputMode === "main" && <LiveMainScreen liveState={shownLive} operator />}

                  {/* FOLDBACK (stage confidence monitor) */}
                  {previewOutputMode === "foldback" && (
                    <div className="relative flex aspect-video w-full flex-col justify-between bg-black p-[3cqw] font-sans [container-type:inline-size]">
                      {liveState.isBlackout ? (
                        <div className="m-auto font-mono text-xs text-zinc-500">BLACK · Ctrl+B</div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-[1.5cqw] font-mono text-[2.6cqw] text-zinc-400">
                            <span>STAGE · {liveState.currentSlideLabel || "—"}</span>
                            <span className="rounded bg-zinc-900 px-[1.5cqw] text-white tabular-nums">{simulatedTime}</span>
                          </div>
                          <div className="my-auto whitespace-pre-line text-[4.4cqw] font-semibold leading-tight text-white line-clamp-6">
                            {liveState.currentSlideText || (liveState.currentSlideImage ? "(larawan sa screen)" : "No active lyrics")}
                          </div>
                          {/* 2026-10-28: speaker notes from PowerPoint (stage screen only) */}
                          {liveState.currentSlideNotes && (
                            <div className="mb-[1cqw] whitespace-pre-line text-[2.8cqw] text-emerald-300 line-clamp-2">
                              <span className="font-semibold text-sky-400">NOTES: </span>
                              {liveState.currentSlideNotes}
                            </div>
                          )}
                          <div className="truncate border-t border-zinc-800 pt-[1.5cqw] text-[2.8cqw]">
                            <span className="font-semibold text-sky-400">NEXT: </span>
                            <span className="text-yellow-300">{liveState.nextSlideText ? liveState.nextSlideText.split("\n")[0] : "(End of song)"}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* NDI lower third */}
                  {previewOutputMode === "ndi" && (
                    <div
                      className="relative flex aspect-video w-full flex-col justify-end p-[2.5cqw] [container-type:inline-size]"
                      style={{ background: "repeating-conic-gradient(#1f1f23 0% 25%, #17171a 0% 50%) 50% / 24px 24px" }}
                    >
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-zinc-300">
                        <Radio className="h-3 w-3" /> Transparent (alpha)
                      </span>
                      {!liveState.isBlackout && !liveState.isLogo && !liveState.isClearText && liveState.currentSlideText && (
                        <div className="mx-auto w-full max-w-[90%] rounded-[1cqw] border border-white/10 bg-black/85 px-[3cqw] py-[2cqw] text-left">
                          <div className="text-[2.4cqw] font-semibold uppercase tracking-wider text-sky-400">{liveState.currentSlideLabel}</div>
                          <p className="whitespace-pre-line text-[3.2cqw] font-semibold leading-tight text-white line-clamp-3">{liveState.currentSlideText}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              </div>
            </div>

            {/* GO LIVE + Black / Clear / Logo in one row */}
            <div className="grid grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_auto] gap-1.5">
              <button onClick={handleGoLive} className="btn btn-primary btn-lg h-12 w-full">
                <Play className="h-4 w-4 fill-current" />
                GO LIVE
                <span className="ml-1 hidden h-5 items-center rounded border border-white/25 bg-white/15 px-1 font-mono text-xs font-normal leading-none @[26rem]/out:inline-flex">PgDn</span>
              </button>
              <button
                onClick={handleToggleBlack}
                aria-pressed={liveState.isBlackout}
                className={`btn h-12 flex-col gap-0.5 ${liveState.isBlackout ? "bg-fg text-canvas" : "btn-secondary"}`}
              >
                Black <span className="font-mono text-xs opacity-70">Ctrl B</span>
              </button>
              <button
                onClick={handleToggleClear}
                aria-pressed={liveState.isClearText}
                className={`btn h-12 flex-col gap-0.5 ${liveState.isClearText ? "bg-warn-soft text-warn-text ring-1 ring-warn/60" : "btn-secondary"}`}
              >
                Clear <span className="font-mono text-xs opacity-70">Ctrl C</span>
              </button>
              <button
                onClick={handleToggleLogo}
                aria-pressed={liveState.isLogo}
                className={`btn h-12 flex-col gap-0.5 ${liveState.isLogo ? "bg-accent-soft text-accent-text ring-1 ring-accent/60" : "btn-secondary"}`}
              >
                Logo <span className="font-mono text-xs opacity-70">Ctrl L</span>
              </button>
              {/* 2026-11-06: Logo settings (picture / video / title) */}
              <button
                onClick={() => setLogoOpen(true)}
                className={`btn btn-secondary h-12 w-10 px-0 ${logo.logoCustom ? "text-accent-text" : ""}`}
                title="Logo settings: larawan / video / title"
                aria-label="Logo settings"
                data-testid="logo-settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </div>
            {logoOpen && <LogoSettingsModal liveState={liveState} onClose={() => setLogoOpen(false)} />}

            {/* 2026-10-29: tool panel (projector / phone / text style) — below the controls so Live stays visible */}
              {tool && (
                <div
                  ref={popoverRef}
                  role="region"
                  aria-label={tool === "projector" ? "Projector output" : tool === "phone" ? "Phone remote" : "Text style"}
                  className="scroll-mt-3 rounded-lg border border-line bg-surface-2 p-3"
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-fg">{tool === "projector" ? "Projector output" : tool === "phone" ? "Phone remote" : "Text style"}</span>
                    <button onClick={() => setTool(null)} className="btn btn-ghost btn-icon h-7 w-7" aria-label="Isara">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {tool === "projector" && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={() => handleOpenOutput(false)} className="btn btn-secondary" title="Buksan ang LIVE screen sa hiwalay na window (para sa projector)">
                          <MonitorUp className="h-3.5 w-3.5" />
                          Open output window
                        </button>
                        {canUseSecondScreen() && (
                          <button onClick={() => handleOpenOutput(true)} className="btn btn-ghost" title="Chrome/Edge: ilagay agad sa second screen (hihingi ng permiso)">
                            <ScreenShare className="h-3.5 w-3.5" />
                            On 2nd screen
                          </button>
                        )}
                      </div>
                      <p className={`inline-flex items-center gap-1.5 text-xs ${outputCount ? "text-fg" : "text-fg-subtle"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${outputCount ? "bg-ok" : "bg-fg-subtle"}`} />
                        {outputCount ? `Projector connected${outputCount > 1 ? ` (${outputCount})` : ""}` : "No output window"}
                      </p>
                      {outputNotice && <p role="status" className={outputNotice.tone === "ok" ? "notice-ok" : "notice-warn"}>{outputNotice.text}</p>}
                    </div>
                  )}

                  {tool === "phone" && (
                    <div className="space-y-2 text-xs text-fg-muted">
                      <p className={`inline-flex items-center gap-1.5 ${remote.phones ? "text-fg" : "text-fg-subtle"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${remote.phones ? "bg-ok" : "bg-fg-subtle"}`} />
                        {remote.phones ? `Phone connected${remote.phones > 1 ? ` (${remote.phones})` : ""}` : "No phone"}
                      </p>

                      {remote.availability === "ready" && !remote.active && (
                        <div role="status" className="notice-warn space-y-1.5">
                          <p>Ibang Simulator tab ang sinusunod ng phone ngayon, kaya iba ang schedule na nakikita roon.</p>
                          <button onClick={() => remote.takeOver()} className="btn btn-sm">Gamitin ang tab na ito</button>
                        </div>
                      )}
                      {remote.availability === "ready" ? (
                        <div className="space-y-2.5">
                          <div className="flex items-end justify-between gap-2">
                            <div>
                              <div className="eyebrow mb-1">PIN</div>
                              <div className="font-mono text-2xl font-semibold tracking-[0.25em] text-fg" data-testid="remote-pin">
                                {remote.pin}
                              </div>
                            </div>
                            <button onClick={() => remote.newPin()} className="btn btn-ghost btn-sm" title="Bagong PIN — mala-logout ang lahat ng phone">
                              <RefreshCw className="h-3.5 w-3.5" />
                              New PIN
                            </button>
                          </div>
                          <div>
                            <div className="mb-1">Buksan sa phone (dapat parehong WiFi ng laptop):</div>
                            {remote.urls.length ? (
                              <ul className="space-y-1">
                                {remote.urls.map((u) => (
                                  <li key={u} className="select-all break-all rounded bg-surface px-2 py-1 font-mono text-sm text-fg">
                                    {u}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="notice-warn">Walang nakitang network. Ikonekta ang laptop sa WiFi.</p>
                            )}
                            {remote.urls.length > 1 && <p className="mt-1">Kung marami: piliin ang address ng WiFi (madalas 192.168.x.x).</p>}
                          </div>
                          <p>
                            Hindi bumubukas sa phone? Sa Windows, payagan ang <span className="text-fg">Node.js</span> sa <span className="text-fg">Private network</span> (Windows
                            Firewall), at dapat "Private" ang WiFi network ng laptop.
                          </p>
                        </div>
                      ) : remote.availability === "not-local" ? (
                        <p className="notice-warn">Para makita ang PIN, buksan ang app sa laptop gamit ang http://localhost:3000.</p>
                      ) : remote.availability === "checking" ? (
                        <p>Sinusuri…</p>
                      ) : (
                        <p className="notice-warn">
                          Gumagana lang ang phone remote kapag naka-run ang app sa laptop (<span className="font-mono">npm run dev</span> o{" "}
                          <span className="font-mono">npm start</span>), hindi sa web.app na version.
                        </p>
                      )}
                    </div>
                  )}

                  {tool === "style" && <div className="space-y-3">
                    {/* small copy of the Live screen, so changes are visible while the big one is scrolled away */}
                    <div className="flex items-center gap-3">
                      <div className="w-40 shrink-0 overflow-hidden rounded ring-1 ring-live/50" data-testid="style-live-mini">
                        <LiveMainScreen liveState={shownLive} fade={false} playVideo={false} />
                      </div>
                      <p className="text-xs text-fg-subtle">Live ngayon — dito mo makikita agad ang binabago mo.</p>
                    </div>
                      <div className="seg grid w-full grid-cols-2" role="tablist" aria-label="Saan i-apply">
                        <button role="tab" aria-selected={styleTarget === "global"} onClick={() => setStyleTarget("global")} className="seg-item">
                          Global (lahat)
                        </button>
                        <button
                          role="tab"
                          aria-selected={styleTarget === "item"}
                          onClick={() => setStyleTarget("item")}
                          className="seg-item min-w-0"
                          title={currentScheduleItem ? cleanTitle(currentScheduleItem.title) : ""}
                        >
                          <span className="truncate">Itong item{currentScheduleItem ? `: ${cleanTitle(currentScheduleItem.title)}` : ""}</span>
                        </button>
                      </div>
                      {styleTarget === "global" ? (
                        <>
                          <p className="text-xs text-fg-subtle">Para sa lahat ng slide, maliban sa item na may sariling style.</p>
                          <TextStyleEditor value={globalStyle} onChange={handleGlobalStyle} />
                        </>
                      ) : !currentScheduleItem ? (
                        <p className="text-xs text-fg-subtle">Pumili muna ng item sa Schedule.</p>
                      ) : currentScheduleItem.textStyle ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-fg-subtle">Sariling style ng item na ito lang.</p>
                            <button onClick={() => handleItemStyle(currentScheduleItem.id, null)} className="btn btn-ghost btn-sm">
                              Ibalik sa global
                            </button>
                          </div>
                          <TextStyleEditor value={currentScheduleItem.textStyle} onChange={(next) => handleItemStyle(currentScheduleItem.id, next)} />
                        </>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-fg-subtle">Ginagamit ng item na ito ang global na style.</p>
                          <button onClick={() => handleItemStyle(currentScheduleItem.id, { ...globalStyle })} className="btn btn-secondary">
                            Gumawa ng sariling style para sa item na ito
                          </button>
                        </div>
                      )}
                  </div>}
                </div>
              )}

            {/* Alert ticker */}
            <div className="border-t border-line pt-3">
              <label htmlFor="sim-alert" className="eyebrow mb-1.5 block">
                Nursery alert / message ticker
              </label>
              <div className="flex gap-1.5">
                <input
                  id="sim-alert"
                  type="text"
                  value={customAlertInput}
                  onChange={(e) => setCustomAlertInput(e.target.value)}
                  placeholder="Enter alert message (e.g. Parent #104)..."
                  className="input h-8 flex-1 text-xs"
                />
                <button onClick={handleSendNurseryAlert} className={`btn ${liveState.nurseryAlertActive ? "btn-danger" : "btn-secondary"}`}>
                  {liveState.nurseryAlertActive ? "Hide alert" : "Send alert"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
