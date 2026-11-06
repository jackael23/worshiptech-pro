/**
 * 2026-10-28 (Jarvis): the LIVE main screen — shared by the Simulator's Live monitor and the
 * projector output window (?output=main), so both always look the same.
 *  - Crossfade (~300 ms) when the slide / Black / Logo / Clear changes.
 *  - 2026-11-05: background and text fade separately, so a video background never restarts.
 *  - 2026-11-06: the Logo screen can be the church's own picture / video + title (lib/logoStore.ts).
 *  - `operator` = small hints for the person running it (BLACK · Ctrl+B, "Select an item…");
 *    never shown on the projector.
 */
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { LiveState, ResolvedTextStyle, BackgroundSettings } from "../types";
import { SlideScreen } from "./SlideScreen";

// 2026-11-05 (Mira): the screen is two crossfading layers — background (picture / video / dim) and
// content (text / picture slide / logo). Changing slides fades only the content, so a video
// background keeps playing instead of starting over on every slide.
interface BgFrame {
  background: string;
  bgSettings?: BackgroundSettings;
  videoId?: string;
}
interface ContentFrame {
  mode: "black" | "logo" | "slide";
  /** 2026-11-06: custom logo — title / subtitle (both optional) instead of the default logo. */
  logo?: { title?: string; subtitle?: string };
  text: string;
  image?: string;
  textColor?: string;
  hideContent: boolean;
  style?: ResolvedTextStyle;
}

function toFrames(s: LiveState, playVideo: boolean): { bg: BgFrame; content: ContentFrame } {
  const mode = s.isBlackout ? "black" : s.isLogo ? "logo" : "slide";
  const customLogo = mode === "logo" && !!s.logoCustom;
  return {
    bg: customLogo
      ? {
          background: s.logoBackground || "#0b1020",
          bgSettings: s.logoSettings,
          videoId: playVideo ? s.logoVideoId : undefined,
        }
      : {
          background: mode === "black" ? "#000" : mode === "logo" ? "#0b1020" : s.backgroundMediaUrl || "#0f172a",
          bgSettings: mode === "slide" ? s.backgroundSettings : undefined,
          videoId: mode === "slide" && playVideo ? s.backgroundVideoId : undefined,
        },
    content: {
      mode,
      text: s.currentSlideText || "",
      image: s.currentSlideImage,
      textColor: s.currentSlideTextColor,
      hideContent: s.isClearText,
      style: s.textStyle,
      logo: customLogo ? { title: s.logoTitle, subtitle: s.logoSubtitle } : undefined,
    },
  };
}

/** Cheap identity (pictures are long data: URLs — use length + tail). */
const tail = (v?: string) => (v ? `${v.length}:${v.slice(-48)}` : "");
// Dim / fit / blur are not in the key: changing them applies at once (no fade), so a video never restarts.
const bgKey = (f: BgFrame) => [tail(f.background), f.videoId || ""].join("|");
const contentKey = (f: ContentFrame) =>
  [f.mode, f.text, tail(f.image), f.textColor || "", f.hideContent ? 1 : 0, JSON.stringify(f.style ?? null), JSON.stringify(f.logo ?? null)].join("|");

const BgView: React.FC<{ frame: BgFrame }> = ({ frame }) => (
  <SlideScreen slide={null} background={frame.background} bgSettings={frame.bgSettings} bgVideoId={frame.videoId} layer="bg" />
);

const ContentView: React.FC<{ frame: ContentFrame; textScale: number }> = ({ frame, textScale }) => (
  <SlideScreen
    slide={frame.mode === "slide" ? { text: frame.text, image: frame.image, textColor: frame.textColor } : null}
    hideContent={frame.hideContent}
    textScale={textScale}
    textStyle={frame.style}
    layer="content"
  >
    {frame.mode === "logo" && frame.logo && (frame.logo.title || frame.logo.subtitle) && (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-[6cqw] text-center [text-shadow:0_0.3cqw_0.9cqw_rgb(0_0_0/0.85)]" data-logo-custom>
        {frame.logo.title && <div className="text-[5cqw] font-bold leading-tight tracking-wide text-white">{frame.logo.title}</div>}
        {frame.logo.subtitle && <div className="mt-[1cqw] text-[2.8cqw] text-zinc-100">{frame.logo.subtitle}</div>}
      </div>
    )}
    {frame.mode === "logo" && !frame.logo && (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="mb-[2cqw] grid h-[12cqw] w-[12cqw] place-items-center rounded-full bg-[#3b82f6] text-[5cqw] font-bold text-white">✝</div>
        <div className="text-[4cqw] font-bold tracking-wide text-white">GRACE CHURCH OF WORSHIP</div>
        <div className="text-[2.6cqw] text-zinc-300">Welcome to His Presence</div>
      </div>
    )}
  </SlideScreen>
);

/** Keeps the last frame + the new one while the new one fades in (~320 ms). */
function useCrossfade<F>(key: string, frame: F, fade: boolean) {
  const nextId = useRef(1);
  const [layers, setLayers] = useState<{ id: number; key: string; frame: F }[]>([{ id: 0, key, frame }]);
  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.key === key) return prev;
      const layer = { id: nextId.current++, key, frame };
      return fade ? [top, layer] : [layer];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fade]);
  const done = () => setLayers((prev) => prev.slice(-1));
  return { layers, done };
}

/**
 * 2026-11-05 (Mira): base text size of the Live / projector screen, in % of screen width — the same
 * as the Preview (6), so what you see in Preview is what goes on the projector. It was 3.9, so the
 * projector text was ~35% smaller than the Preview. Auto-fit still shrinks long verses to fit.
 */
export const LIVE_TEXT_SCALE = 6;

interface LiveMainScreenProps {
  liveState: LiveState;
  /** Simulator only: small operator hints (never on the projector). */
  operator?: boolean;
  fade?: boolean;
  textScale?: number;
  /** 2026-11-05: false = show a video background's poster only (small copies of the screen). */
  playVideo?: boolean;
}

export const LiveMainScreen: React.FC<LiveMainScreenProps> = ({ liveState, operator = false, fade = true, textScale = LIVE_TEXT_SCALE, playVideo = true }) => {
  const { bg: bgFrame, content: frame } = toFrames(liveState, playVideo);
  const bg = useCrossfade(bgKey(bgFrame), bgFrame, fade);
  const content = useCrossfade(contentKey(frame), frame, fade);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black [container-type:inline-size]" data-testid="live-main">
      {bg.layers.map((l, i) => {
        const isNew = i === bg.layers.length - 1 && bg.layers.length > 1;
        return (
          <div key={`bg-${l.id}`} className={`absolute inset-0 ${isNew ? "animate-[wtp-fade_320ms_ease-out_both]" : ""}`} onAnimationEnd={isNew ? bg.done : undefined}>
            <BgView frame={i === bg.layers.length - 1 ? { ...l.frame, bgSettings: bgFrame.bgSettings } : l.frame} />
          </div>
        );
      })}
      {content.layers.map((l, i) => {
        const fading = content.layers.length > 1;
        const isNew = i === content.layers.length - 1 && fading;
        const anim = !fading ? "" : isNew ? "animate-[wtp-fade_320ms_ease-out_both]" : "animate-[wtp-fade-out_320ms_ease-out_both]";
        return (
          <div key={`c-${l.id}`} className={`absolute inset-0 ${anim}`} onAnimationEnd={isNew ? content.done : undefined}>
            <ContentView frame={l.frame} textScale={textScale} />
          </div>
        );
      })}

      {operator && liveState.isBlackout && <div className="absolute bottom-2 left-2 font-mono text-xs text-zinc-500">BLACK · Ctrl+B</div>}
      {operator && !liveState.isBlackout && !liveState.isLogo && liveState.isClearText && (
        <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 font-mono text-xs text-zinc-300">TEXT OFF · Ctrl+C</div>
      )}
      {operator && frame.mode === "slide" && !frame.text && !frame.image && !liveState.activeScheduleItemId && (
        <div className="absolute inset-0 grid place-items-center text-xs text-zinc-400">Select an item and click Go LIVE</div>
      )}
      {liveState.nurseryAlertActive && !liveState.isBlackout && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-[1.2cqw] bg-[#dc2626] px-[2.5cqw] py-[1.2cqw] text-[2.6cqw] font-semibold text-white">
          <AlertTriangle className="h-[3cqw] w-[3cqw] shrink-0" />
          <span className="truncate">{liveState.nurseryAlertText}</span>
        </div>
      )}
    </div>
  );
};
