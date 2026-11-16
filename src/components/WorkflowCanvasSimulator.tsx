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
  Music2,
  ScreenShare,
  Presentation as PresentationIcon,
  Smartphone,
  RefreshCw,
  Type as TypeIcon,
  SwatchBook,
  X,
  Settings2,
  Pencil,
  Megaphone,
  Bell,
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
import { INITIAL_SCHEDULE, SAMPLE_SONGS } from "../data/easyworshipData";
import { getCachedSchedule, loadSchedule, saveSchedule, loadSelectedIndex, saveSelectedIndex } from "../lib/scheduleStore";
import { SongLibrary } from "./SongLibrary";
import { BibleLibrary, Passage } from "./BibleLibrary";
import { PresentationLibrary } from "./PresentationLibrary";
import { SlideScreen } from "./SlideScreen";
import { LiveMainScreen } from "./LiveScreen";
import { StageView, loadStagePrefs, STAGE_PREFS_KEY, StagePrefs } from "./StageScreen";
import { openOutputWindow, canUseSecondScreen, listScreens, loadScreenChoice, ScreenChoice, OutputKind } from "../lib/liveChannel";
import type { StoredPresentation } from "../lib/presentationStore";
import { useRemoteHost, scheduleForRemote, RemoteCmd } from "../lib/remoteLink";
import { loadTextStyle, saveTextStyle, resolveTextStyle, sameStyle } from "../lib/textStyle";
import { TextStyleEditor } from "./TextStyleEditor";
import { MediaLibrary } from "./MediaLibrary";
import { ThemePicker, ThemeScope } from "./ThemePicker";
import { ItemBg, PresentationTheme, ThemeStore, findTheme, loadThemeStore, resolveThemeBg, saveThemeStore, themeFromItem } from "../lib/presentationThemes";
import { isVideoId } from "../lib/mediaStore";
import { useLogoFrame, withLogo } from "../lib/logoStore";
import { LogoSettingsModal } from "./LogoSettingsModal";
import { usePanelLayout, dragColumns, toShares, gridColumns, dragSchedList } from "../lib/panelLayout";
import { ResizeHandle } from "./ResizeHandle";
import { SongEditorModal } from "./SongEditorModal";
import { loadSongsFromDb, reloadSongs, saveSongsDiff, watchSongs } from "../lib/songsDb";
import type { StoredSong, SongDraft } from "../lib/mySongsStore";
import { toSongItem, USER_SONG_BACKGROUND } from "../lib/mySongsStore";
import { resolveSongBackground } from "../lib/songBackground";
import { listBibles, getBible, watchBibles, type WtpBible, type BibleMeta } from "../lib/bibleStore";
import { lookupVerses, passageFor } from "../lib/bibleLookup";
import type { RemoteLibrary } from "../lib/remoteLink";
import { syncScheduleWithSongs, songSlides, retitle, slidesToLyrics, SONG_ID_RE, songBgSig } from "../lib/scheduleSync";

/** 2026-11-05: video background of an item ("vid-…"), unless the slide has its own (PowerPoint) background. */
const videoOf = (item: ScheduleItem | undefined, slide?: SlideContent) =>
  item && !slide?.background && item.background && isVideoId(item.bgMediaId) ? item.bgMediaId : undefined;


// 2026-11-15 (Mira): Stage announcement — quick picks, max length (same as the phone / server), blink switch key
const STAGE_PRESETS = ["Ulitin ang chorus", "Last chorus", "Bridge", "Slow down", "Key up", "Tapusin na"];
const STAGE_MSG_MAX = 200;
const STAGE_BLINK_KEY = "wtp.stageMsgBlink.v1";

interface WorkflowCanvasSimulatorProps {
  version: EasyWorshipVersion;
  liveState: LiveState;
  setLiveState: React.Dispatch<React.SetStateAction<LiveState>>;
  onAskAssistant: (query: string) => void;
  /** 2026-10-28: number of projector output windows connected (?output=main). */
  outputCount?: number;
  /** 2026-11-08: number of Stage screens connected (?output=stage). */
  stageCount?: number;
}

export const WorkflowCanvasSimulator: React.FC<WorkflowCanvasSimulatorProps> = ({
  version,
  liveState,
  setLiveState,
  onAskAssistant,
  outputCount = 0,
  stageCount = 0,
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
        scheduleRef.current = saved;
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
      // 2026-11-07: songs edited while the Simulator was closed (e.g. CouchDB sync) → catch up now
      if (songsRef.current) applySongs(songsRef.current);
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

  // ---------- 2026-11-07 (Jarvis): song items follow their My Song (lib/scheduleSync.ts) ----------
  // Latest schedule for async callbacks (song DB changes arrive outside React's render).
  const scheduleRef = useRef<ScheduleItem[]>(scheduleItems);
  scheduleRef.current = scheduleItems;
  /** 2026-11-14: latest default-theme background, for song edits that arrive outside React's render. */
  const defaultThemeBgRef = useRef<ItemBg | null>(null);
  /** My Songs as last read from the songs database (null = not read yet / database unavailable). */
  const songsRef = useRef<StoredSong[] | null>(null);
  /** The slide on air follows an edit of its song (same slide number; last slide if it got shorter). */
  const refreshLiveText = (items: ScheduleItem[]) => {
    setLiveState((prev) => {
      const onAir = items.find((i) => i.id === prev.activeScheduleItemId);
      if (!onAir || onAir.slides.length === 0) return prev;
      const idx = Math.min(prev.activeSlideIndex, onAir.slides.length - 1);
      const slide = onAir.slides[idx];
      const nextSlideText = onAir.slides[idx + 1]?.text || onAir.slides[idx + 1]?.label || "";
      // 2026-11-08: chords + key follow the edit too (Stage screen)
      const chords = slide.chords;
      const nextChords = onAir.slides[idx + 1]?.chords;
      if (
        idx === prev.activeSlideIndex &&
        slide.label === prev.currentSlideLabel &&
        slide.text === prev.currentSlideText &&
        nextSlideText === (prev.nextSlideText ?? "") &&
        chords === prev.currentSlideChords &&
        nextChords === prev.nextSlideChords &&
        onAir.songKey === prev.songKey
      )
        return prev;
      return { ...prev, activeSlideIndex: idx, currentSlideLabel: slide.label, currentSlideText: slide.text, nextSlideText, currentSlideChords: chords, nextSlideChords: nextChords, songKey: onAir.songKey };
    });
  };
  /** Puts a changed schedule on screen + saves it + updates the live slide. */
  const commitSchedule = (items: ScheduleItem[]) => {
    scheduleRef.current = items;
    setScheduleItems(items);
    refreshLiveText(items);
  };
  // 2026-11-08: bumps when My Songs change (the phone's Library list follows)
  const [songsTick, setSongsTick] = useState(0);
  const applySongs = (songs: StoredSong[]) => {
    songsRef.current = songs;
    setSongsTick((n) => n + 1);
    if (!scheduleLoaded.current) return; // the saved schedule isn't read yet — done after it loads
    const r = syncScheduleWithSongs(scheduleRef.current, songs);
    if (r.changed) commitSchedule(r.items);
    if (r.bgPending.length) void applySongBackgrounds(r.bgPending, songs);
  };
  /**
   * 2026-11-14: the song's background was changed in My Songs → the schedule item (and the live
   * screen) take the new one. No background on the song any more → the default theme's, or the
   * plain My Songs gradient. A picture / video that isn't in this browser leaves the item as it is.
   */
  const applySongBackgrounds = async (itemIds: string[], songs: StoredSong[]) => {
    const updates = new Map<string, Partial<ScheduleItem>>();
    for (const id of itemIds) {
      const item = scheduleRef.current.find((i) => i.id === id);
      const song = item?.songId ? songs.find((s) => s.id === item.songId) : undefined;
      if (!item || !song) continue;
      const sig = songBgSig(song);
      if (!song.bgId) {
        const d = defaultThemeBgRef.current;
        updates.set(id, d ? { ...bgFields(d), songBg: sig } : { background: USER_SONG_BACKGROUND, bgMediaId: undefined, bgSettings: undefined, songBg: sig });
        continue;
      }
      const r = await resolveSongBackground(song.bgId);
      updates.set(id, r.css ? { background: r.css, bgMediaId: r.mediaId, bgSettings: song.bgSettings, songBg: sig } : { songBg: sig });
    }
    if (updates.size === 0) return;
    // the schedule may have changed while the pictures were loading: apply to the latest one
    const items = scheduleRef.current.map((i) => (updates.has(i.id) ? { ...i, ...updates.get(i.id) } : i));
    commitSchedule(items);
    refreshLiveBackground(items);
  };
  useEffect(() => {
    let alive = true;
    loadSongsFromDb()
      .then(({ songs, available }) => {
        // database blocked (private mode): don't unlink anything based on an empty list
        if (alive && available) applySongs(songs);
      })
      .catch(() => undefined);
    // Song editor, Bulk Add, Import, delete, or CouchDB sync from another device → follow it.
    const stop = watchSongs(() => {
      reloadSongs()
        .then((songs) => alive && applySongs(songs))
        .catch(() => undefined);
    });
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // keep the selected slide inside the item when an edit made it shorter
  const selectedItemSlides = scheduleItems[selectedScheduleIndex]?.slides.length ?? 0;
  useEffect(() => {
    if (selectedItemSlides > 0) setSelectedSlideIndex((i) => Math.min(i, selectedItemSlides - 1));
  }, [selectedItemSlides]);

  // Edit lyrics from the Schedule (✏️ on a song item)
  const [songEdit, setSongEdit] = useState<{ itemId: string; linked: boolean; initial: Partial<SongDraft> } | null>(null);
  const [songEditNotice, setSongEditNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!songEditNotice) return;
    const t = setTimeout(() => setSongEditNotice(null), 5000);
    return () => clearTimeout(t);
  }, [songEditNotice]);
  const openSongEdit = (item: ScheduleItem) => {
    const song = item.songId ? songsRef.current?.find((s) => s.id === item.songId) : undefined;
    setSongEdit(
      song
        ? { itemId: item.id, linked: true, initial: song }
        : { itemId: item.id, linked: false, initial: { title: item.title.replace(/^\d+\.\s*/, ""), lyrics: slidesToLyrics(item.slides) } },
    );
  };
  const handleSongEditSave = (draft: SongDraft, opts?: { scheduleOnly: boolean }) => {
    const edit = songEdit;
    setSongEdit(null);
    if (!edit) return;
    const item = scheduleRef.current.find((i) => i.id === edit.itemId);
    if (!item) return;
    const songId = item.songId;
    const prevSongs = songsRef.current;
    if (edit.linked && !opts?.scheduleOnly && songId && prevSongs?.some((s) => s.id === songId)) {
      // Update the My Song → every copy in the schedule + the live screen follow right away.
      const now = new Date().toISOString();
      const next = prevSongs.map((s) => (s.id === songId ? { ...s, ...draft, updatedAt: now } : s));
      applySongs(next);
      saveSongsDiff(prevSongs, next)
        .then((ok) => setSongEditNotice(ok ? `Na-update ang "${draft.title}" sa My Songs at sa schedule.` : "Nasa schedule na ang pagbabago, pero hindi na-save sa My Songs. Subukan ulit."))
        .catch(() => setSongEditNotice("Nasa schedule na ang pagbabago, pero hindi na-save sa My Songs. Subukan ulit."));
      return;
    }
    // This schedule only: change the item and stop following the song.
    const slides = songSlides(draft.lyrics);
    if (slides.length === 0) return;
    const items = scheduleRef.current.map((i) => {
      if (i.id !== item.id) return i;
      const { songId: _unlink, songBg: _bg, ...rest } = i;
      // 2026-11-14: songUnlinked = never linked back to the My Song automatically (scheduleSync)
      return { ...rest, title: retitle(i.title, draft.title), slides, activeSlideIndex: Math.min(i.activeSlideIndex, slides.length - 1), songUnlinked: true } as ScheduleItem;
    });
    commitSchedule(items);
    setSongEditNotice(`Binago ang "${draft.title}" para sa schedule na ito lang.`);
  };
  const [previewOutputMode, setPreviewOutputMode] = useState<"main" | "foldback" | "ndi">("main");
  const [customAlertInput, setCustomAlertInput] = useState("Nursery: Parent #104 please come to Nursery");
  // 2026-11-16: "+ New song" in the Library card header → opens the editor inside SongLibrary
  const [newSongTick, setNewSongTick] = useState(0);
  // 2026-11-16 (b): bottom strip of the Library card — SongLibrary draws its Import / Bulk Add / … links here on desktop
  const [libFooterEl, setLibFooterEl] = useState<HTMLDivElement | null>(null);
  const [simulatedTime, setSimulatedTime] = useState("");
  // 2026-11-15 (Mira): Stage announcement (musicians only) — draft text, blink switch (remembered),
  // and the Stage window's transpose / size / chords (same browser storage) for the "Stage monitor" preview
  const [stageMsgInput, setStageMsgInput] = useState("");
  const [stageMsgBlink, setStageMsgBlink] = useState(() => {
    try {
      return localStorage.getItem(STAGE_BLINK_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [stagePrefs, setStagePrefs] = useState<StagePrefs>(loadStagePrefs);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STAGE_PREFS_KEY) setStagePrefs(loadStagePrefs());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  // 2026-10-20 (Jarvis): on phones/tablets (< lg) show one panel at a time instead of 3 squeezed panels.
  // 2026-10-28 (Jarvis): projector output window
  const [outputNotice, setOutputNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  // 2026-11-08 (Mira): + Stage screen (musicians, with chords) and picking the screen for each window
  const handleOpenOutput = async (secondScreen: boolean, kind: OutputKind = "main", pickKey?: string) => {
    const r = await openOutputWindow(secondScreen, kind, pickKey);
    if (kind === "stage") {
      const stageMsg: Record<typeof r, { text: string; tone: "ok" | "warn" }> = {
        opened: { text: "Bukas na ang Stage screen. I-drag ito sa TV ng musicians, tapos i-click o Enter para fullscreen.", tone: "ok" },
        "second-screen": { text: "Nasa napiling screen na ang Stage screen. Kung hindi pa fullscreen, i-click ito o pindutin ang Enter.", tone: "ok" },
        "no-second-screen": { text: "Walang nakitang ibang screen — dito binuksan ang Stage screen. Ikabit ang TV at subukan ulit.", tone: "warn" },
        denied: { text: "Hindi pinayagan ang 'window management', kaya dito binuksan. I-drag sa TV, tapos i-click o Enter para fullscreen.", tone: "warn" },
        blocked: { text: "Na-block ng browser ang bagong window. Pindutin ulit ang button (o payagan ang pop-ups para sa site na ito).", tone: "warn" },
      };
      setOutputNotice(stageMsg[r]);
      return;
    }
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
  // 2026-11-08: screens of this computer, for "Piliin ang screen" (null = list not opened)
  const [screens, setScreens] = useState<ScreenChoice[] | null>(null);
  const handleListScreens = async () => {
    const r = await listScreens();
    if (r === "denied") setOutputNotice({ text: "Kailangan ng permiso na 'window management' para makita ang mga screen. Payagan ito sa address bar, tapos subukan ulit.", tone: "warn" });
    else if (r === "unsupported") setOutputNotice({ text: "Chrome o Edge lang ang nakakapili ng screen. I-drag na lang ang window sa tamang screen.", tone: "warn" });
    else setScreens(r);
  };

  const [mobilePanel, setMobilePanel] = useState<"library" | "schedule" | "live">("library");
  const panelVis = (p: "library" | "schedule" | "live") => (mobilePanel === p ? "flex" : "hidden") + " lg:flex";

  // 2026-11-06: desktop panels can be resized by dragging their borders (lib/panelLayout.ts)
  const { layout, setLayout } = usePanelLayout();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const libRef = useRef<HTMLElement | null>(null);
  const schedRef = useRef<HTMLElement | null>(null);
  const outRef = useRef<HTMLElement | null>(null);
  const schedListRef = useRef<HTMLDivElement | null>(null);
  const dragFrom = useRef<{ widths?: [number, number, number]; list?: number; column?: number }>({});
  const [edges, setEdges] = useState<[number, number] | null>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const g = grid.getBoundingClientRect();
      const a = libRef.current?.getBoundingClientRect();
      const b = schedRef.current?.getBoundingClientRect();
      const c = outRef.current?.getBoundingClientRect();
      // 2026-11-15: cards have a gap between them now → the handle sits in the middle of the gap
      if (a && b && c && a.width && b.width) setEdges([(a.right + b.left) / 2 - g.left, (b.right + c.left) / 2 - g.left]);
    };
    const ro = new ResizeObserver(measure);
    [grid, libRef.current, schedRef.current, outRef.current].forEach((el) => el && ro.observe(el));
    measure();
    return () => ro.disconnect();
  }, []);
  const startColumns = () => {
    const w = (el: HTMLElement | null) => el?.getBoundingClientRect().width || 0;
    dragFrom.current = { widths: [w(libRef.current), w(schedRef.current), w(outRef.current)] };
  };
  const moveColumns = (edge: 0 | 1, dx: number) => {
    const from = dragFrom.current.widths;
    if (from) setLayout((l) => ({ ...l, cols: toShares(dragColumns(from, edge, dx)) }));
  };
  const startSchedList = () => {
    dragFrom.current = {
      list: schedListRef.current?.getBoundingClientRect().height || 0,
      column: schedRef.current?.getBoundingClientRect().height || 0,
    };
  };
  const moveSchedList = (dy: number) => {
    const { list, column } = dragFrom.current;
    if (list !== undefined && column) setLayout((l) => ({ ...l, schedList: dragSchedList(list, column, dy) }));
  };

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

  // 2026-11-07 (Mira): Presentation themes — text style + background in one click (lib/presentationThemes.ts).
  const [themeStore, setThemeStore] = useState<ThemeStore>(loadThemeStore);
  const updateThemeStore = (next: ThemeStore) => {
    setThemeStore(next);
    saveThemeStore(next);
  };
  /** Background of the default theme, for new songs / verses (null = keep the old behavior). */
  const [defaultThemeBg, setDefaultThemeBg] = useState<ItemBg | null>(null);
  defaultThemeBgRef.current = defaultThemeBg;
  useEffect(() => {
    const t = findTheme(themeStore, themeStore.defaultId);
    if (!t) return setDefaultThemeBg(null);
    let alive = true;
    resolveThemeBg(t).then((bg) => alive && setDefaultThemeBg(bg));
    return () => {
      alive = false;
    };
  }, [themeStore]);
  const themeUndoRef = useRef<{ items: ScheduleItem[]; global: TextStyle; defaultId: string | null } | null>(null);
  const [canUndoTheme, setCanUndoTheme] = useState(false);
  const bgFields = (bg: ItemBg) => ({ background: bg.background, bgMediaId: bg.bgMediaId, bgSettings: bg.bgSettings });

  const handleApplyTheme = async (theme: PresentationTheme, scope: ThemeScope): Promise<string | null> => {
    const bg = await resolveThemeBg(theme);
    if (!bg) return "Wala sa browser na ito ang larawan/video ng theme (na-delete o hindi pa nasi-sync).";
    if (scope === "item") {
      const target = currentScheduleItem;
      if (!target) return "Pumili muna ng item sa Schedule.";
      const items = scheduleItems.map((i) => (i.id === target.id ? { ...i, textStyle: { ...theme.textStyle }, ...bgFields(bg) } : i));
      setScheduleItems(items);
      refreshLiveStyle(globalStyle, items);
      refreshLiveBackground(items);
      setCanUndoTheme(false);
      return null;
    }
    themeUndoRef.current = { items: scheduleItems, global: globalStyle, defaultId: themeStore.defaultId };
    const nextGlobal = { ...theme.textStyle };
    // every item takes the theme; PowerPoint slides keep their own background (slide.background wins)
    const items = scheduleItems.map((i) => ({ ...i, textStyle: null, ...bgFields(bg) }));
    setGlobalStyle(nextGlobal);
    saveTextStyle(nextGlobal);
    setScheduleItems(items);
    refreshLiveStyle(nextGlobal, items);
    refreshLiveBackground(items);
    updateThemeStore({ ...themeStore, defaultId: theme.id });
    setCanUndoTheme(true);
    return null;
  };
  const handleUndoTheme = () => {
    const u = themeUndoRef.current;
    if (!u) return;
    themeUndoRef.current = null;
    setCanUndoTheme(false);
    setGlobalStyle(u.global);
    saveTextStyle(u.global);
    setScheduleItems(u.items);
    refreshLiveStyle(u.global, u.items);
    refreshLiveBackground(u.items);
    updateThemeStore({ ...themeStore, defaultId: u.defaultId });
  };
  const handleSaveTheme = (name: string) => {
    const t = themeFromItem(name, styleFor(currentScheduleItem), currentScheduleItem);
    updateThemeStore({ ...themeStore, custom: [...themeStore.custom, t] });
  };
  const handleRenameTheme = (id: string, name: string) =>
    updateThemeStore({ ...themeStore, custom: themeStore.custom.map((t) => (t.id === id ? { ...t, name: name.trim().slice(0, 40) } : t)) });
  const handleDeleteTheme = (id: string) =>
    updateThemeStore({ defaultId: themeStore.defaultId === id ? null : themeStore.defaultId, custom: themeStore.custom.filter((t) => t.id !== id) });

  // Helper actions
  const handleAddSongToSchedule = (song: SongItem): ScheduleItem => {
    const newItem: ScheduleItem = {
      id: `sched-${Date.now()}`,
      title: `${scheduleItems.length + 1}. ${song.title}`,
      type: "song",
      slides: song.slides,
      activeSlideIndex: 0,
      background: song.defaultBackground,
      // 2026-11-07: default presentation theme's background, unless the My Song has its own
      ...(defaultThemeBg && !song.bgMediaId && !song.bgId ? bgFields(defaultThemeBg) : {}),
      // 2026-11-06: My Song's own background (picture / video upload + dim / fit / blur)
      ...(song.bgMediaId ? { bgMediaId: song.bgMediaId } : {}),
      ...(song.bgId && song.bgSettings ? { bgSettings: song.bgSettings } : {}),
      // 2026-11-07: remember the My Song, so editing it updates this item (and the live screen)
      ...(song.source === "user" && SONG_ID_RE.test(song.id) ? { songId: song.id, songBg: songBgSig(song) } : {}),
      // 2026-11-08: key for the Stage screen
      ...(song.key ? { songKey: song.key } : {}),
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
      // 2026-11-08: Stage screen (musicians) — chords + key; the projector ignores these
      currentSlideChords: slide.chords,
      nextSlideChords: item.slides[slideIdx + 1]?.chords,
      songKey: item.songKey,
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
      // 2026-11-07: default presentation theme's background
      ...(defaultThemeBg ? bgFields(defaultThemeBg) : {}),
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

  // 2026-11-15 (Mira): announcement on the Stage screen only (the projector ignores these fields)
  const sendStageMessage = (text: string, blink: boolean) => {
    const t = text.trim().slice(0, STAGE_MSG_MAX);
    if (!t) return;
    setLiveState((prev) => ({ ...prev, stageMessageText: t, stageMessageActive: true, stageMessageBlink: blink, stageMessageAt: Date.now() }));
  };
  const hideStageMessage = () => setLiveState((prev) => ({ ...prev, stageMessageActive: false }));
  const toggleStageBlink = () =>
    setStageMsgBlink((b) => {
      try {
        localStorage.setItem(STAGE_BLINK_KEY, b ? "0" : "1");
      } catch {
        /* storage blocked: just don't remember */
      }
      return !b;
    });

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
      case "stage-msg":
        if (cmd.show) sendStageMessage(cmd.text, cmd.blink);
        else hideStageMessage();
        return;
    }
  };
  // ---------- 2026-11-08 (Mira): phone changes the schedule + Bible (Library tab) ----------
  /** Latest handlers, for commands that finish after an await (Bible loads from the database). */
  const latest = useRef({ handleAddPassage, handleLivePassage, handleAddSongToSchedule, goLiveAt });
  latest.current = { handleAddPassage, handleLivePassage, handleAddSongToSchedule, goLiveAt };
  const bibleCache = useRef<WtpBible | null>(null);
  const loadBibleFor = async (id: string): Promise<WtpBible | null> => {
    if (bibleCache.current?.id === id) return bibleCache.current;
    const b = await getBible(id).catch(() => null);
    if (b) bibleCache.current = b;
    return b;
  };
  const findSong = (id: string): SongItem | undefined => {
    const sample = SAMPLE_SONGS.find((s) => s.id === id);
    if (sample) return sample;
    const mine = songsRef.current?.find((s) => s.id === id);
    return mine ? toSongItem(mine) : undefined;
  };
  const handleRemoteScheduleCmd = (cmd: RemoteCmd): boolean => {
    switch (cmd.type) {
      case "add-song": {
        const song = findSong(cmd.songId);
        if (!song || song.slides.length === 0) return true;
        if (!song.bgId) {
          const item = handleAddSongToSchedule(song);
          if (cmd.live) goLiveAt(item, 0);
          return true;
        }
        // 2026-11-14: the My Song's own picture / video background (the phone used to add it without)
        resolveSongBackground(song.bgId).then((r) => {
          const withBg = r.css ? { ...song, defaultBackground: r.css, bgMediaId: r.mediaId } : song;
          const item = latest.current.handleAddSongToSchedule(withBg);
          if (cmd.live) latest.current.goLiveAt(item, 0);
        });
        return true;
      }
      case "remove": {
        const idx = scheduleItems.findIndex((i) => i.id === cmd.itemId);
        if (idx >= 0) handleDeleteScheduleItem(idx);
        return true;
      }
      case "move": {
        const idx = scheduleItems.findIndex((i) => i.id === cmd.itemId);
        if (idx >= 0) handleMoveScheduleItem(idx, cmd.dir);
        return true;
      }
      case "bible-lookup":
        loadBibleFor(cmd.bibleId).then((b) =>
          remote.publishLookup(
            b ? lookupVerses(b, { ref: cmd.ref, book: cmd.book, chapter: cmd.chapter }, cmd.reqId) : { reqId: cmd.reqId, ok: false, error: "Wala ang Bible na ito sa laptop." },
          ),
        );
        return true;
      case "add-verses":
        loadBibleFor(cmd.bibleId).then((b) => {
          const p = b && passageFor(b, cmd.book, cmd.chapter, cmd.verses);
          if (!p) return;
          if (cmd.live) latest.current.handleLivePassage(p);
          else latest.current.handleAddPassage(p);
        });
        return true;
      default:
        return false;
    }
  };
  const remote = useRemoteHost((cmd) => {
    if (!handleRemoteScheduleCmd(cmd)) handleRemoteCmd(cmd);
  });
  // Library for the phones: song titles (Hymns + My Songs, no lyrics) + imported Bibles
  const [bibleList, setBibleList] = useState<BibleMeta[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      listBibles()
        .then(({ bibles }) => {
          if (alive) setBibleList(bibles);
          bibleCache.current = null; // a Bible may have been replaced
        })
        .catch(() => undefined);
    load();
    const stop = watchBibles(load);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  useEffect(() => {
    if (remote.availability !== "ready") return;
    const toEntry = (s: SongItem, mine: boolean): RemoteLibrary["songs"][number] => ({
      id: s.id,
      title: s.title,
      ...(s.author ? { author: s.author } : {}),
      ...(s.key ? { key: s.key } : {}),
      chords: s.slides.some((x) => x.chords),
      mine,
      slides: s.slides.length,
    });
    const mine = (songsRef.current ?? []).map((s) => toEntry(toSongItem(s), true));
    remote.publishLibrary({
      songs: [...mine, ...SAMPLE_SONGS.map((s) => toEntry(s, false))].filter((s) => s.slides > 0),
      bibles: bibleList.map((b) => ({ id: b.id, name: b.name, shortName: b.shortName, language: b.language })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.availability, remote.publishLibrary, songsTick, bibleList]);
  // 2026-10-29: Output toolbar panels (one open at a time; X / Esc / same button closes)
  const [tool, setTool] = useState<null | "projector" | "phone" | "style" | "theme">(null);
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
      } else if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        // 2026-11-07 (Mira, hiling ni Jack): Enter = GO LIVE with the Preview slide (same as Page Down).
        // Not when a button / link / checkbox has focus — there Enter means "press that control".
        const t = e.target as HTMLElement | null;
        if (e.defaultPrevented || t?.closest('button, a[href], [role="button"], [role="tab"], [role="option"], [role="separator"], input, summary')) return;
        e.preventDefault();
        handleGoLive();
      } else if (["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) {
        // a focused control that uses arrows itself (e.g. the panel resize handle) wins
        if (e.defaultPrevented) return;
        e.preventDefault();
        const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
        // 2026-11-07 (Mira, hiling ni Jack): when something is on air, ↑/← = previous and ↓/→ = next
        // LIVE slide (same as the phone remote's Prev/Next; Preview follows). Stops at the item's first/last slide.
        const onAir = liveState.isLive ? scheduleItems.find((i) => i.id === liveState.activeScheduleItemId) : undefined;
        if (onAir) {
          liveAndSelect(onAir.id, liveState.activeSlideIndex + step);
          return;
        }
        // nothing on air: arrows only move the Preview selection (as before)
        if (currentScheduleItem && selectedSlideIndex + step >= 0 && selectedSlideIndex + step < currentScheduleItem.slides.length) {
          setSelectedSlideIndex((prev) => prev + step);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentScheduleItem, selectedSlideIndex, liveState, scheduleItems]);

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
    // 2026-11-15 (Sanctuary): on desktop the shell is see-through and Library / Schedule / Output are 3 separate cards
    <div className="panel sim-shell flex h-full min-h-[30rem] w-full flex-col overflow-hidden">
      {/* ===== Toolbar ===== (desktop: Main/Foldback/NDI + clock moved to the app bar; this row only shows when there is a status badge) */}
      <div
        className={`flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-3 sm:px-4 lg:h-9 lg:border-0 lg:px-1 ${
          outputCount > 0 || (remote.availability === "ready" && !remote.active) || (remote.active && remote.phones > 0) ? "" : "lg:hidden"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Layers className="h-4 w-4 shrink-0 text-accent lg:hidden" />
          <h2 className="section-title lg:hidden">Simulator</h2>
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
          {/* simulated outputs (Main / Foldback / NDI) are shown in the app bar (Header) since 2026-11-15 */}
        </div>
        <div className="flex shrink-0 items-center gap-2 lg:hidden">
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
      <div
        ref={gridRef}
        className={`relative grid min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden lg:gap-4 lg:overflow-visible ${
          layout.cols
            ? "lg:grid-cols-[var(--wtp-cols)]"
            : "lg:grid-cols-[minmax(16rem,0.95fr)_minmax(20rem,1.3fr)_minmax(21rem,1.3fr)] 2xl:grid-cols-[minmax(16rem,0.8fr)_minmax(20rem,1.05fr)_minmax(21rem,1.75fr)]"
        }`}
        style={layout.cols ? ({ "--wtp-cols": gridColumns(layout.cols) } as React.CSSProperties) : undefined}
      >
        {/* 2026-11-06: drag handles on the two column borders (desktop) */}
        {edges &&
          ([0, 1] as const).map((edge) => (
            <ResizeHandle
              key={edge}
              axis="x"
              label={edge === 0 ? "Lapad ng Library / Schedule" : "Lapad ng Schedule / Output"}
              valueNow={layout.cols ? (edge === 0 ? layout.cols[0] : layout.cols[0] + layout.cols[1]) * 100 : undefined}
              className="-translate-x-1/2"
              style={{ left: edges[edge] }}
              onStart={startColumns}
              onMove={(dx) => moveColumns(edge, dx)}
              onReset={() => setLayout((l) => ({ ...l, cols: null }))}
              testId={`resize-col-${edge}`}
            />
          ))}
        {/* ---------- PANEL 1: LIBRARY ---------- */}
        <section ref={libRef} className={`${panelVis("library")} sim-card min-h-0 flex-col overflow-hidden`} aria-label="Library">
          <div className="space-y-2.5 border-b border-line p-3 lg:space-y-3.5 lg:border-0 lg:px-5 lg:pb-2 lg:pt-5">
            {/* 2026-11-16 (Sanctuary): "+ New song" in the card header like the mockup; Ask in Chat = the small icon beside it */}
            <div className="hidden items-center gap-2 lg:flex">
              <span className="section-title mr-auto">Library</span>
              <button onClick={() => onAskAssistant("Paano magdagdag ng bagong kanta sa library?")} className="icon-btn" title="Ask in Chat" aria-label="Ask in Chat">
                <Sparkles />
              </button>
              <button
                onClick={() => {
                  setActiveMediaTab("songs");
                  setNewSongTick(Date.now());
                }}
                className="btn btn-primary h-8"
                data-testid="new-song"
              >
                <Plus className="h-3.5 w-3.5" />
                New song
              </button>
            </div>
            <div className="seg grid w-full grid-cols-4" role="tablist" aria-label="Library">
              {libraryTabs.map(({ id, label, icon: Icon, title }) => (
                <button key={id} role="tab" aria-selected={activeMediaTab === id} onClick={() => setActiveMediaTab(id)} title={title} className="seg-item w-full px-1">
                  <Icon className="h-3.5 w-3.5 shrink-0 lg:hidden" />
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
                className="input h-8 pl-8 text-xs lg:h-10 lg:pl-9 lg:text-sm"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 lg:px-5 lg:pb-3">
            {/* Songs — samples, My Songs, reference (2026-10-20) */}
            {activeMediaTab === "songs" && <SongLibrary searchQuery={searchQuery} onAddToSchedule={handleAddSongToSchedule} onLiveSong={handleLiveSong} newSongTick={newSongTick} footerSlot={libFooterEl} />}

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
          <div ref={setLibFooterEl} className="hidden shrink-0 px-5 pb-4 pt-1 empty:hidden lg:block" data-testid="library-footer" />
        </section>

        {/* ---------- PANEL 2: SCHEDULE + SLIDES ---------- */}
        <section ref={schedRef} className={`${panelVis("schedule")} sim-card min-h-0 flex-col overflow-hidden`} aria-label="Schedule">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-3 lg:h-16 lg:border-0 lg:px-5 lg:pt-1">
            <span className="section-title mr-auto">Schedule</span>
            <span className="text-xs text-fg-subtle">
              {scheduleItems.length} {scheduleItems.length === 1 ? "item" : "items"}
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
          {/* in this panel (not the Output panel), so it also shows on phones where only one panel is visible */}
          {songEdit && (
            <SongEditorModal
              mode="edit"
              initial={songEdit.initial}
              scheduleEdit={{ linked: songEdit.linked }}
              onSave={handleSongEditSave}
              onClose={() => setSongEdit(null)}
            />
          )}
          {songEditNotice && (
            <p role="status" className="shrink-0 border-b border-line bg-ok-soft px-3 py-1.5 text-xs text-fg" data-testid="schedule-notice">
              {songEditNotice}
            </p>
          )}

          {/* schedule items */}
          {/* 2026-10-28: taller list + bigger rows (sabi ni Jack: "lakihan / habaan ang schedule") */}
          <div
            ref={schedListRef}
            className={`max-h-[45%] min-h-[9rem] shrink-0 space-y-1 overflow-y-auto border-b border-line p-2 lg:px-4 lg:pb-3 lg:pt-0 ${layout.schedList ? "lg:h-[var(--wtp-sched-list)] lg:max-h-none" : "lg:max-h-[50%]"}`}
            style={layout.schedList ? ({ "--wtp-sched-list": `${layout.schedList}%` } as React.CSSProperties) : undefined}
            data-testid="schedule-list"
          >
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
                  // 2026-11-16: keyboard — Tab reaches the row (its Edit / Move / Remove then show and are next in Tab order);
                  // Enter / Space selects it. preventDefault keeps the global Enter = GO LIVE shortcut out of it.
                  tabIndex={0}
                  aria-current={isSelected ? "true" : undefined}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                    e.preventDefault();
                    setSelectedScheduleIndex(idx);
                    setSelectedSlideIndex(0);
                  }}
                  title="Double-click = LIVE (unang slide)"
                  className={`group sched-row flex outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[52px] cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 text-[15px] touch-manipulation transition-colors lg:min-h-12 lg:px-3.5 lg:text-sm ${
                    isSelected ? "bg-accent-soft text-fg ring-1 ring-inset ring-accent/40" : "text-fg hover:bg-surface-2"
                  }`}
                >
                  <span className={`w-6 shrink-0 font-mono text-xs tabular-nums ${isSelected ? "text-accent-text" : "text-fg-subtle"}`}>{String(idx + 1).padStart(2, "0")}</span>
                  <TypeIcon className={`h-4 w-4 shrink-0 lg:hidden ${isSelected ? "text-accent-text" : "text-fg-subtle"}`} />
                  <span className={`min-w-0 flex-1 truncate ${isSelected ? "font-semibold" : ""}`}>{cleanTitle(item.title)}</span>
                  {isItemLive && (
                    <span className="badge badge-live-soft">
                      <span className="h-1.5 w-1.5 rounded-full bg-live" />
                      LIVE
                    </span>
                  )}
                  {/* 2026-11-16 (Sanctuary): quiet rows like the mockup — on desktop the Edit / Move / Remove buttons
                      show on the selected row and on hover (phones: always, there is no hover) */}
                  {!isItemLive && !isSelected && (
                    <span className="sched-meta shrink-0 text-xs text-fg-subtle">
                      {item.slides.length} {item.slides.length === 1 ? "slide" : "slides"}
                    </span>
                  )}
                  <div className={`icon-btn-group ${isSelected ? "" : "sched-actions-quiet"}`}>
                    {item.type === "song" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openSongEdit(item);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className="icon-btn icon-btn-edit"
                        title="Edit lyrics"
                        aria-label={`Edit lyrics: ${cleanTitle(item.title)}`}
                        data-testid="schedule-edit"
                      >
                        <Pencil />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveScheduleItem(idx, "up");
                      }}
                      className="icon-btn icon-btn-move"
                      title="Move up"
                      aria-label={`Move ${cleanTitle(item.title)} up`}
                    >
                      <MoveUp />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveScheduleItem(idx, "down");
                      }}
                      className="icon-btn icon-btn-move"
                      title="Move down"
                      aria-label={`Move ${cleanTitle(item.title)} down`}
                    >
                      <MoveDown />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteScheduleItem(idx);
                      }}
                      className="icon-btn icon-btn-danger"
                      title="Remove"
                      aria-label={`Remove ${cleanTitle(item.title)}`}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2026-11-06: drag handle between the schedule list and the slides (desktop) */}
          <div className="relative hidden h-0 lg:block">
            <ResizeHandle
              axis="y"
              label="Taas ng Schedule / Slides"
              valueNow={layout.schedList ?? undefined}
              className="-top-[5px]"
              onStart={startSchedList}
              onMove={moveSchedList}
              onReset={() => setLayout((l) => ({ ...l, schedList: null }))}
              testId="resize-schedule"
            />
          </div>

          {/* slides of the selected item */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-1.5 pt-2.5 lg:px-5 lg:pb-2 lg:pt-4">
              <span className="eyebrow truncate tracking-[0.14em]">
                Slides <span className="ml-1 font-mono font-normal tracking-normal">{currentScheduleItem?.slides?.length || 0}</span>
              </span>
              <span className="hidden items-center gap-1 text-xs text-fg-subtle sm:flex" title="Click = preview • Double-click = LIVE • ↑/↓ slides • Page Down = Go Live">
                <span className="kbd">↑</span>
                <span className="kbd">↓</span>
                select
                <span className="mx-1 text-line-strong">·</span>
                double-click = live
              </span>
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-2.5 overflow-y-auto px-3 pb-3 pt-1 lg:gap-3.5 lg:px-5 lg:pb-5 lg:pt-1.5">
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
        <section ref={outRef} className={`${panelVis("live")} sim-card @container/out relative min-h-0 flex-col overflow-hidden`} aria-label="Output">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3 lg:h-16 lg:border-0 lg:px-5 lg:pt-1">
            {/* 2026-11-07: label hidden on narrow columns so the 4th tool (Theme) + Main/Foldback/NDI still fit */}
            <span className="section-title mr-2 hidden @[26rem]/out:inline">Output</span>
            {([
              ["projector", "Projector output", "Projector", MonitorUp, outputCount > 0 || stageCount > 0],
              ["phone", "Phone remote", "Phone", Smartphone, remote.phones > 0],
              ["style", "Text style", "Text", TypeIcon, false],
              // 2026-11-07: presentation themes (text style + background in one click)
              ["theme", "Presentation themes", "Theme", SwatchBook, false],
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

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 lg:space-y-4 lg:px-5 lg:pb-5 lg:pt-0.5">
            {/* Preview | Live — side by side when wide, Live first when narrow */}
            <div className="grid gap-3 @[40rem]/out:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] @[40rem]/out:items-end">
              {/* 2026-11-16 (Sanctuary): narrow column = small Preview thumbnail with "Next up" beside it (mockup) */}
              <div className="order-2 flex items-center gap-3.5 @[40rem]/out:order-1 @[40rem]/out:flex-col-reverse @[40rem]/out:items-stretch @[40rem]/out:gap-2">
                <div className="w-[38%] max-w-48 shrink-0 overflow-hidden rounded-md ring-1 ring-accent/60 @[40rem]/out:w-auto @[40rem]/out:max-w-none" data-testid="preview-screen">
                  <SlideScreen slide={currentPreviewSlide} background={currentScheduleItem?.background} textScale={6} textStyle={styleFor(currentScheduleItem)} bgSettings={currentScheduleItem?.bgSettings} bgVideoId={videoOf(currentScheduleItem, currentPreviewSlide)} ariaHidden />
                </div>
                <div className="min-w-0 @[40rem]/out:flex @[40rem]/out:items-baseline @[40rem]/out:gap-2">
                  <div className="eyebrow tracking-[0.14em] text-accent-text">Preview · next up</div>
                  {currentPreviewSlide?.label && <div className="mt-1 truncate text-sm text-fg @[40rem]/out:mt-0 @[40rem]/out:text-xs @[40rem]/out:text-fg-muted">{cleanTitle(currentPreviewSlide.label)}</div>}
                </div>
              </div>
              <div className="order-1 @[40rem]/out:order-2">
  {/* LIVE screen */}
              <div>
                {/* 2026-11-16 (Sanctuary): the status sits on the screen ("● ON AIR") like the mockup, not in a row above it */}
                <div className={`relative overflow-hidden rounded-lg ${liveOnAir ? "live-frame" : "ring-1 ring-line"}`} data-testid="live-monitor">
                  {/* 2026-11-16: the output name is written beside the status again (it was only a tooltip that never showed) */}
                  <div className="pointer-events-none absolute left-2.5 right-2.5 top-2.5 z-10 flex items-center gap-1.5">
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.08em] ${
                      liveOnAir ? "bg-live text-white" : "bg-black/60 text-zinc-200"
                    }`}
                    data-testid="live-status"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {liveOnAir && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />}
                      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${liveOnAir ? "bg-white" : "bg-zinc-400"}`} />
                    </span>
                    {liveState.isLive ? liveStateLabel : "Standby"}
                  </span>
                  <span className="truncate rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium leading-none text-zinc-200" data-testid="live-output-label">
                    {previewOutputMode === "main" ? "Main projector" : previewOutputMode === "foldback" ? "Stage monitor" : "OBS stream (NDI)"}
                  </span>
                  </div>
                  {/* MAIN — same component as the projector window (2026-10-28) */}
                  {previewOutputMode === "main" && <LiveMainScreen liveState={shownLive} operator />}

                  {/* FOLDBACK — 2026-11-15 (Mira): the real Stage screen (same component as the TV), plus the DRAFT announcement */}
                  {previewOutputMode === "foldback" && (
                    <div className="relative aspect-video w-full" data-testid="stage-preview">
                      <StageView state={liveState} prefs={stagePrefs} clock={simulatedTime.slice(0, 5)} draft={stageMsgInput} />
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
            <div className="go-row grid grid-cols-[minmax(0,2.2fr)_repeat(3,minmax(0,1fr))_auto] gap-1.5 lg:gap-2">
              <button onClick={handleGoLive} className="btn btn-live btn-lg h-12 w-full">
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
                  aria-label={tool === "projector" ? "Projector output" : tool === "phone" ? "Phone remote" : tool === "theme" ? "Presentation themes" : "Text style"}
                  className="scroll-mt-3 rounded-lg border border-line bg-surface-2 p-3"
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-fg">{tool === "projector" ? "Projector output" : tool === "phone" ? "Phone remote" : tool === "theme" ? "Presentation themes" : "Text style"}</span>
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

                      {/* 2026-11-08 (Mira): Stage screen — TV for musicians / worship leaders: lyrics with chords */}
                      <div className="space-y-1.5 border-t border-line pt-2">
                        <div className="text-xs font-semibold text-fg">Stage screen (musicians · chords)</div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button onClick={() => handleOpenOutput(false, "stage")} className="btn btn-secondary" title="Lyrics na may chords + susunod na slide, para sa TV ng musicians" data-testid="open-stage">
                            <Music2 className="h-3.5 w-3.5" />
                            Open Stage screen
                          </button>
                          {canUseSecondScreen() && (
                            <button onClick={() => handleOpenOutput(true, "stage")} className="btn btn-ghost" title="Chrome/Edge: ilagay agad sa ibang screen (hihingi ng permiso)">
                              <ScreenShare className="h-3.5 w-3.5" />
                              On other screen
                            </button>
                          )}
                        </div>
                        <p className={`inline-flex items-center gap-1.5 text-xs ${stageCount ? "text-fg" : "text-fg-subtle"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${stageCount ? "bg-ok" : "bg-fg-subtle"}`} />
                          {stageCount ? `Stage screen connected${stageCount > 1 ? ` (${stageCount})` : ""}` : "No Stage screen"}
                        </p>
                        <p className="text-xs text-fg-subtle">Hindi nagba-black ang Stage screen kapag Black / Clear sa projector, para tuloy-tuloy ang musicians.</p>
                      </div>

                      {/* 2026-11-08: laptop + projector + TV → choose which screen gets which window (remembered) */}
                      {canUseSecondScreen() && (
                        <div className="space-y-1.5 border-t border-line pt-2">
                          <button onClick={handleListScreens} className="btn btn-ghost" data-testid="pick-screens">
                            <ScreenShare className="h-3.5 w-3.5" />
                            Piliin ang screen
                          </button>
                          {screens && (
                            <ul className="space-y-1">
                              {screens.map((sc) => {
                                const isMain = loadScreenChoice("main") === sc.key;
                                const isStage = loadScreenChoice("stage") === sc.key;
                                return (
                                  <li key={sc.key} className="flex flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs">
                                    <span className="min-w-0 flex-1 truncate text-fg" title={sc.label}>
                                      {sc.label} <span className="text-fg-subtle">· {sc.width}×{sc.height}{sc.isCurrent ? " · ito" : ""}</span>
                                    </span>
                                    <button
                                      onClick={() => handleOpenOutput(true, "main", sc.key).then(() => setScreens((s) => (s ? [...s] : s)))}
                                      className={`btn ${isMain ? "btn-primary" : "btn-ghost"} h-7 px-2 text-xs`}
                                      aria-pressed={isMain}
                                    >
                                      Projector
                                    </button>
                                    <button
                                      onClick={() => handleOpenOutput(true, "stage", sc.key).then(() => setScreens((s) => (s ? [...s] : s)))}
                                      className={`btn ${isStage ? "btn-primary" : "btn-ghost"} h-7 px-2 text-xs`}
                                      aria-pressed={isStage}
                                    >
                                      Stage
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
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

                  {tool === "theme" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-40 shrink-0 overflow-hidden rounded ring-1 ring-live/50" data-testid="theme-live-mini">
                          <LiveMainScreen liveState={shownLive} fade={false} playVideo={false} />
                        </div>
                        <p className="text-xs text-fg-subtle">Live ngayon — makikita mo agad dito kapag ang item na naka-live ang pinalitan.</p>
                      </div>
                      <ThemePicker
                        store={themeStore}
                        currentItem={currentScheduleItem}
                        itemLabel={currentScheduleItem ? cleanTitle(currentScheduleItem.title) : ""}
                        onApply={handleApplyTheme}
                        onSaveFromItem={handleSaveTheme}
                        onRename={handleRenameTheme}
                        onDelete={handleDeleteTheme}
                        canUndo={canUndoTheme}
                        onUndo={handleUndoTheme}
                      />
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

            {/* 2026-11-16 (Sanctuary): Nursery + Stage as two slim bars like the mockup's stage bar (icon · input · button).
                Labels became placeholders; the Stage presets + blink switch show only while its bar is in use. */}
            <div className="space-y-2">
              <div className="msg-bar" data-testid="nursery-bar">
                <Bell className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
                <input
                  id="sim-alert"
                  type="text"
                  value={customAlertInput}
                  onChange={(e) => setCustomAlertInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !liveState.nurseryAlertActive) {
                      e.preventDefault();
                      handleSendNurseryAlert();
                    }
                  }}
                  placeholder="Nursery alert — Parent #104…"
                  aria-label="Nursery alert / message ticker (lalabas sa projector)"
                  className="msg-bar-input"
                />
                <button
                  onClick={handleSendNurseryAlert}
                  disabled={!customAlertInput && !liveState.nurseryAlertActive}
                  className={`btn h-8 shrink-0 px-3 text-xs ${liveState.nurseryAlertActive ? "btn-danger" : "btn-secondary"}`}
                  title="Ipakita sa projector bilang ticker"
                >
                  {liveState.nurseryAlertActive ? "Hide alert" : "Send"}
                </button>
              </div>

              {/* 2026-11-15 (Mira): Stage announcement — Stage screen only, never on the projector */}
              <div className="group/stage" data-testid="stage-announce">
                <div className="msg-bar">
                  <Megaphone className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
                  <input
                    id="stage-msg"
                    type="text"
                    value={stageMsgInput}
                    maxLength={STAGE_MSG_MAX}
                    onChange={(e) => setStageMsgInput(e.target.value)}
                    onFocus={() => setPreviewOutputMode("foldback")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        sendStageMessage(stageMsgInput, stageMsgBlink);
                      }
                    }}
                    placeholder="Stage announcement — Ulitin ang chorus…"
                    aria-label="Stage announcement (musicians lang, wala sa projector)"
                    className="msg-bar-input"
                  />
                  {liveState.stageMessageActive && (
                    <button onClick={hideStageMessage} className="btn btn-ghost h-8 shrink-0 px-2.5 text-xs" data-testid="stage-hide">
                      Hide
                    </button>
                  )}
                  <button
                    onClick={() => sendStageMessage(stageMsgInput, stageMsgBlink)}
                    disabled={!stageMsgInput.trim()}
                    className="btn btn-primary h-8 shrink-0 px-3.5 text-xs font-bold"
                    title="Ipakita sa Stage screen (musicians lang)"
                    data-testid="stage-send"
                  >
                    {liveState.stageMessageActive ? "Update" : "Send"}
                  </button>
                </div>
                {/* presets + blink: only while the Stage bar has focus (mousedown keeps the focus in the input) */}
                <div className="mt-1.5 hidden flex-wrap items-center gap-1 group-focus-within/stage:flex" data-testid="stage-presets">
                  {STAGE_PRESETS.map((p) => (
                    <button
                      key={p}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setStageMsgInput(p);
                        setPreviewOutputMode("foldback");
                      }}
                      aria-pressed={stageMsgInput === p}
                      className={`btn h-7 px-2 text-xs ${stageMsgInput === p ? "bg-accent-soft text-accent-text ring-1 ring-accent/60" : "btn-ghost text-fg-muted"}`}
                    >
                      {p}
                    </button>
                  ))}
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 px-1 text-xs text-fg-muted" onMouseDown={(e) => e.preventDefault()}>
                    <input type="checkbox" checked={stageMsgBlink} onChange={toggleStageBlink} className="h-3.5 w-3.5 accent-[var(--c-accent)]" />
                    Kumislap
                  </label>
                </div>
                {(liveState.stageMessageActive || !stageCount) && (
                  <p className={`mt-1.5 flex items-center gap-1.5 px-1 text-xs ${liveState.stageMessageActive ? "text-warn-text" : "text-fg-subtle"}`} role="status">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${liveState.stageMessageActive ? "bg-warn" : "bg-fg-subtle"}`} />
                    <span className="truncate">
                      {liveState.stageMessageActive ? `Nasa Stage: "${liveState.stageMessageText}"` : "Walang announcement sa Stage"}
                      {!stageCount && " · walang nakabukas na Stage screen"}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
