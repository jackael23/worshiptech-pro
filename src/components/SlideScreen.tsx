/**
 * 2026-10-28 (Jarvis): one 16:9 "projector" screen, used for slide thumbnails, the Preview
 * monitor and the Live output. Text scales with the screen width (container query units),
 * so a thumbnail looks like a small copy of the real screen — like EasyWorship / ProPresenter.
 */
import React, { useEffect, useState } from "react";
import type { SlideContent, ResolvedTextStyle, BackgroundSettings } from "../types";
import { DEFAULT_TEXT_STYLE, fontStack } from "../lib/textStyle";
import { BASE_TEXT_SCALE, fitSlide, useFontsVersion } from "../lib/textFit";
import { getVideoUrl, watchMedia } from "../lib/mediaStore";

/**
 * 2026-11-05 (Mira): object URL of a video background from this browser's media database.
 * Null while loading or when the video is not here (yet) — the poster picture shows instead;
 * tries again when the media database changes (e.g. the video arrives by CouchDB sync).
 */
export function useVideoUrl(id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(null);
    if (!id) return;
    let alive = true;
    const load = () => getVideoUrl(id).then((u) => alive && setUrl(u));
    void load();
    const stop = watchMedia(() => void load());
    return () => {
      alive = false;
      stop();
    };
  }, [id]);
  return url;
}

/** Muted, looping video on the background layer (same dim / fit / blur as a picture). */
export const BackgroundVideo: React.FC<{ id: string; bgSettings?: BackgroundSettings }> = ({ id, bgSettings }) => {
  const url = useVideoUrl(id);
  if (!url) return null;
  return (
    <video
      src={url}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      className={`absolute inset-0 h-full w-full ${bgSettings?.fit === "contain" ? "object-contain" : "object-cover"}`}
      style={{
        filter: bgSettings?.blur ? `blur(${(bgSettings.blur / 19.2).toFixed(3)}cqw)` : undefined,
        transform: bgSettings?.blur && bgSettings.fit !== "contain" ? "scale(1.06)" : undefined,
      }}
      data-slide-video={id}
    />
  );
};

const DEFAULT_BG = "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)";

// 2026-11-25 (Jarvis): auto-fit moved to lib/textFit.ts — measured with the real font + word wrap
// (it used an average letter width), and it now also knows the slide's own size and "same size".

interface SlideScreenProps {
  slide?: (Pick<SlideContent, "text" | "image" | "background" | "textColor"> & { sizeScale?: number }) | null;
  /** Fallback background (schedule item background) when the slide has none. */
  background?: string;
  /** Text size as % of screen width. 2026-11-25: every screen uses BASE_TEXT_SCALE (thumbnails were 6.2). */
  textScale?: number;
  className?: string;
  /** Hide the slide's text/picture (Ctrl+C "clear text"). */
  hideContent?: boolean;
  children?: React.ReactNode;
  ariaHidden?: boolean;
  /** 2026-10-29: font, size, color, alignment… (default = the original look). */
  textStyle?: ResolvedTextStyle;
  /** 2026-10-29: dim / fit / blur of the background. */
  bgSettings?: BackgroundSettings;
  /** 2026-11-05: play this video ("vid-…") over the background picture (its poster). */
  bgVideoId?: string;
  /**
   * 2026-11-05: draw only part of the screen — "bg" = background (+ video + dim), "content" = text /
   * picture only on a transparent screen. LiveScreen uses them so a slide change fades only the
   * text and a video background keeps playing.
   */
  layer?: "all" | "bg" | "content";
}

const DEFAULT_RESOLVED: ResolvedTextStyle = { ...DEFAULT_TEXT_STYLE, forceColor: false };
const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;
const ALIGN_ITEMS = { left: "flex-start", center: "center", right: "flex-end" } as const;

export const SlideScreen: React.FC<SlideScreenProps> = ({ slide, background, textScale = BASE_TEXT_SCALE, className = "", hideContent, children, ariaHidden, textStyle, bgSettings, bgVideoId, layer = "all" }) => {
  const showBg = layer !== "content";
  const showContent = layer !== "bg";
  const bg = slide?.background || background || DEFAULT_BG;
  const st0 = textStyle || DEFAULT_RESOLVED;
  // 2026-11-25: the slide's own size — from the style (Live: filled in for the slide on air) or the slide itself (thumbnails)
  const st = st0.slideScale === undefined && slide?.sizeScale ? { ...st0, slideScale: slide.sizeScale } : st0;
  // color: item's own color > PowerPoint slide color > global color > white
  const slideColor = st.forceColor ? undefined : slide?.textColor;
  const color = slideColor || st.color || "#ffffff";
  useFontsVersion(); // re-measure once a font has loaded
  const fs = slide?.text ? fitSlide(slide.text, textScale, st).fs : 0;
  const shadows = [
    // no dark shadow on a PowerPoint slide's own (usually dark) text color — it smudges
    st.shadow && !slideColor ? "0 0.3cqw 0.8cqw rgb(0 0 0 / 0.85)" : "",
  ].filter(Boolean);
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden ${showBg ? "bg-black" : ""} [container-type:inline-size] ${className}`}
      aria-hidden={ariaHidden || undefined}
    >
      {/* 2026-10-29: background on its own layer, so blur / dim never touch the text */}
      {showBg && <div
        className={`absolute inset-0 ${bgSettings?.fit === "contain" ? "bg-contain! bg-center! bg-no-repeat!" : ""}`}
        style={{
          background: bg,
          filter: bgSettings?.blur ? `blur(${(bgSettings.blur / 19.2).toFixed(3)}cqw)` : undefined,
          transform: bgSettings?.blur && bgSettings.fit !== "contain" ? "scale(1.06)" : undefined, // hide soft blurred edges
        }}
        data-slide-bg
      />}
      {showBg && bgVideoId && !slide?.background && <BackgroundVideo id={bgVideoId} bgSettings={bgSettings} />}
      {showBg && !!bgSettings?.dim && <div className="absolute inset-0 bg-black" style={{ opacity: bgSettings.dim }} data-slide-dim />}
      {showContent && !hideContent && slide?.image && <img src={slide.image} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />}
      {showContent && !hideContent && !slide?.image && slide?.text && (
        <div
          className="absolute inset-0 flex flex-col p-[6cqw]"
          style={{ justifyContent: JUSTIFY[st.valign], alignItems: ALIGN_ITEMS[st.align] }}
          data-slide-text
        >
          <p
            className="max-w-full whitespace-pre-line leading-[1.3]"
            style={{
              fontSize: `${fs.toFixed(2)}cqw`,
              fontFamily: fontStack(st.fontFamily),
              fontWeight: st.bold ? 600 : 400,
              fontStyle: st.italic ? "italic" : "normal",
              textAlign: st.align,
              color,
              textShadow: shadows.length ? shadows.join(", ") : undefined,
              WebkitTextStroke: st.outline ? `${(fs * 0.07).toFixed(3)}cqw #000` : undefined,
              paintOrder: st.outline ? "stroke fill" : undefined,
            }}
          >
            {slide.text}
          </p>
        </div>
      )}
      {showContent && children}
    </div>
  );
};
