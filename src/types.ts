export type EasyWorshipVersion = "EasyWorship 7" | "EasyWorship 6" | "EasyWorship 2009";

export type SupportedLanguage = "Tagalog" | "English" | "Taglish";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  topicTag?: string;
  suggestedActions?: string[];
}

export type MediaTabType = "songs" | "scriptures" | "media" | "presentations" | "themes" | "audio";

export interface SongItem {
  id: string;
  title: string;
  author?: string;
  key?: string;
  ccli?: string;
  slides: {
    label: string; // e.g. "Verse 1", "Chorus", "Bridge"
    text: string;
  }[];
  defaultBackground?: string;
  /** 2026-10-20: sample = built-in PD hymn, user = My Songs (browser only), reference = title/author only, no lyrics. */
  source?: "sample" | "user" | "reference";
}

export interface ScriptureVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  version: "KJV" | "MBB" | "Tagalog Ang Biblia";
}

export interface MediaAsset {
  id: string;
  name: string;
  type: "video" | "image";
  thumbnail: string;
  isLoop?: boolean;
}

/** 2026-10-28 (Jarvis): one slide of a schedule item. image/background/notes come from PowerPoint imports. */
export interface SlideContent {
  label: string;
  text: string;
  /** Full-slide picture (data: URL) — image slides exported from PowerPoint. */
  image?: string;
  /** CSS background for this slide only (overrides the item background). */
  background?: string;
  /** Text color that reads well on this slide's background. */
  textColor?: string;
  /** Speaker notes (shown on the Foldback / stage screen). */
  notes?: string;
}

/** 2026-10-29 (Jarvis): how slide text looks on the screens (see lib/textStyle.ts). */
export interface TextStyle {
  fontFamily: string;
  /** Size: 0.5–2 × the auto-fit size (text still shrinks when it doesn't fit). 2026-11-05: max was 1.5. */
  scale: number;
  bold: boolean;
  italic: boolean;
  /** #rrggbb, or null = white (or the PowerPoint slide's own color). */
  color: string | null;
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  outline: boolean;
  shadow: boolean;
}

/** The style actually used: forceColor = the item's own color beats a PowerPoint slide's color. */
export interface ResolvedTextStyle extends TextStyle {
  forceColor: boolean;
}

/** 2026-10-29 (Jarvis): how the background picture is shown (per schedule item). */
export interface BackgroundSettings {
  /** 0–0.7: black layer over the picture so white text reads well. */
  dim: number;
  /** cover = fill the screen (edges may be cut), contain = whole picture (black bars). */
  fit: "cover" | "contain";
  /** 0–20: blur, in px on a 1920-wide screen (scales with the screen). */
  blur: number;
}

export interface ScheduleItem {
  id: string;
  title: string;
  type: "song" | "scripture" | "presentation" | "media" | "alert";
  slides: SlideContent[];
  activeSlideIndex: number;
  background?: string;
  notes?: string;
  /** 2026-10-29: this item's own text style (null/undefined = use the global style). */
  textStyle?: TextStyle | null;
  /** 2026-10-29: dim / fit / blur of this item's background. */
  bgSettings?: BackgroundSettings;
  /**
   * 2026-11-05: id of the Media-tab upload used as background ("img-…" picture or "vid-…" video).
   * For a video, `background` holds its poster picture (thumbnails, phone remote, fallback)
   * and the video itself is played from this browser's media database.
   */
  bgMediaId?: string;
}

export interface LiveState {
  isLive: boolean;
  isBlackout: boolean; // Ctrl+B (EW7)
  isClearText: boolean; // Ctrl+C (EW7)
  isLogo: boolean; // Ctrl+L (EW7)
  activeScheduleItemId: string | null;
  activeSlideIndex: number;
  currentSlideText: string;
  currentSlideLabel: string;
  nextSlideText?: string;
  backgroundMediaUrl?: string;
  /** 2026-10-28: image slide on air (PowerPoint picture), its text color and speaker notes. */
  currentSlideImage?: string;
  currentSlideTextColor?: string;
  currentSlideNotes?: string;
  /** 2026-10-29: text style of the slide on air (global or the item's own). */
  textStyle?: ResolvedTextStyle;
  /** 2026-10-29: dim / fit / blur of the background on air. */
  backgroundSettings?: BackgroundSettings;
  /** 2026-11-05: video background on air ("vid-…" media id); backgroundMediaUrl = its poster. */
  backgroundVideoId?: string;
  ndiActive: boolean;
  foldbackEnabled: boolean;
  nurseryAlertText: string;
  nurseryAlertActive: boolean;
}

export interface WorkflowGuide {
  id: string;
  title: string;
  titleTl: string;
  category: "Songs" | "Scripture" | "Streaming" | "Hardware" | "General";
  summary: string;
  summaryTl: string;
  panelsInvolved: string[];
  steps: {
    stepNumber: number;
    title: string;
    titleTl: string;
    panel: "Media Library" | "Service Canvas" | "Preview Window" | "LIVE Output" | "Options Menu";
    description: string;
    descriptionTl: string;
    proTip?: string;
    shortcut?: string;
  }[];
}
