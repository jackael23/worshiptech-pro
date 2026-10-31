/**
 * 2026-10-28 (Jarvis): the LIVE main screen — shared by the Simulator's Live monitor and the
 * projector output window (?output=main), so both always look the same.
 *  - Crossfade (~300 ms) when the slide / Black / Logo / Clear changes.
 *  - `operator` = small hints for the person running it (BLACK · Ctrl+B, "Select an item…");
 *    never shown on the projector.
 */
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { LiveState, ResolvedTextStyle, BackgroundSettings } from "../types";
import { SlideScreen } from "./SlideScreen";

interface Frame {
  mode: "black" | "logo" | "slide";
  text: string;
  image?: string;
  textColor?: string;
  background?: string;
  hideContent: boolean;
  style?: ResolvedTextStyle;
  bgSettings?: BackgroundSettings;
}

function toFrame(s: LiveState): Frame {
  const mode = s.isBlackout ? "black" : s.isLogo ? "logo" : "slide";
  return {
    mode,
    text: s.currentSlideText || "",
    image: s.currentSlideImage,
    textColor: s.currentSlideTextColor,
    background: mode === "black" ? "#000" : mode === "logo" ? "#0b1020" : s.backgroundMediaUrl || "#0f172a",
    hideContent: s.isClearText,
    style: s.textStyle,
    bgSettings: mode === "slide" ? s.backgroundSettings : undefined,
  };
}

/** Cheap identity for a frame (images are long data: URLs — use length + tail). */
function frameKey(f: Frame) {
  const img = f.image ? `${f.image.length}:${f.image.slice(-48)}` : "";
  return [f.mode, f.text, img, f.textColor || "", f.background || "", f.hideContent ? 1 : 0, JSON.stringify(f.style ?? null), JSON.stringify(f.bgSettings ?? null)].join("|");
}

const FrameView: React.FC<{ frame: Frame; textScale: number }> = ({ frame, textScale }) => (
  <SlideScreen
    slide={frame.mode === "slide" ? { text: frame.text, image: frame.image, textColor: frame.textColor } : null}
    background={frame.background}
    hideContent={frame.hideContent}
    textScale={textScale}
    textStyle={frame.style}
    bgSettings={frame.bgSettings}
  >
    {frame.mode === "logo" && (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="mb-[2cqw] grid h-[12cqw] w-[12cqw] place-items-center rounded-full bg-[#3b82f6] text-[5cqw] font-bold text-white">✝</div>
        <div className="text-[4cqw] font-bold tracking-wide text-white">THE LIFE OF TRUTH CHURCH</div>
        <div className="text-[2.6cqw] text-zinc-300">Welcome to His Presence</div>
      </div>
    )}
  </SlideScreen>
);

interface LiveMainScreenProps {
  liveState: LiveState;
  /** Simulator only: small operator hints (never on the projector). */
  operator?: boolean;
  fade?: boolean;
  textScale?: number;
}

export const LiveMainScreen: React.FC<LiveMainScreenProps> = ({ liveState, operator = false, fade = true, textScale = 3.9 }) => {
  const frame = toFrame(liveState);
  const key = frameKey(frame);
  const nextId = useRef(1);
  const [layers, setLayers] = useState<{ id: number; key: string; frame: Frame }[]>([{ id: 0, key, frame }]);

  useEffect(() => {
    setLayers((prev) => {
      const top = prev[prev.length - 1];
      if (top.key === key) return prev;
      const layer = { id: nextId.current++, key, frame };
      return fade ? [top, layer] : [layer];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fade]);

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-black [container-type:inline-size]">
      {layers.map((l, i) => {
        const isNew = i === layers.length - 1 && layers.length > 1;
        return (
          <div
            key={l.id}
            className={`absolute inset-0 ${isNew ? "animate-[wtp-fade_320ms_ease-out_both]" : ""}`}
            onAnimationEnd={isNew ? () => setLayers((prev) => prev.slice(-1)) : undefined}
          >
            <FrameView frame={l.frame} textScale={textScale} />
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
