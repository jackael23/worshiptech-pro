/**
 * 2026-10-28 (Jarvis): one 16:9 "projector" screen, used for slide thumbnails, the Preview
 * monitor and the Live output. Text scales with the screen width (container query units),
 * so a thumbnail looks like a small copy of the real screen — like EasyWorship / ProPresenter.
 */
import React from "react";
import type { SlideContent, ResolvedTextStyle, BackgroundSettings } from "../types";
import { DEFAULT_TEXT_STYLE, fontStack, fontWidth } from "../lib/textStyle";

const DEFAULT_BG = "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)";

/**
 * Auto-fit like EasyWorship: shrink the font (in % of screen width) until the text fits the 16:9 screen.
 * 2026-10-29: `glyph` = average character width of the chosen font (em); bold/italic make it a bit wider.
 */
function fitTextScale(text: string, max: number, glyph = 0.5): number {
  const PAD = 6; // % of width on each side
  const width = 100 - PAD * 2;
  const height = 56.25 - PAD * 2; // 16:9
  const lines = text.split("\n");
  for (let fs = max; fs > 1.6; fs -= 0.2) {
    const perLine = width / (fs * glyph);
    const wrapped = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
    if (wrapped * fs * 1.3 <= height) return fs;
  }
  return 1.6;
}

interface SlideScreenProps {
  slide?: Pick<SlideContent, "text" | "image" | "background" | "textColor"> | null;
  /** Fallback background (schedule item background) when the slide has none. */
  background?: string;
  /** Text size as % of screen width. */
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
}

const DEFAULT_RESOLVED: ResolvedTextStyle = { ...DEFAULT_TEXT_STYLE, forceColor: false };
const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;
const ALIGN_ITEMS = { left: "flex-start", center: "center", right: "flex-end" } as const;

export const SlideScreen: React.FC<SlideScreenProps> = ({ slide, background, textScale = 4.4, className = "", hideContent, children, ariaHidden, textStyle, bgSettings }) => {
  const bg = slide?.background || background || DEFAULT_BG;
  const st = textStyle || DEFAULT_RESOLVED;
  // color: item's own color > PowerPoint slide color > global color > white
  const slideColor = st.forceColor ? undefined : slide?.textColor;
  const color = slideColor || st.color || "#ffffff";
  const glyph = fontWidth(st.fontFamily) * (st.bold ? 1.04 : 1) * (st.italic ? 1.02 : 1);
  const fs = slide?.text ? fitTextScale(slide.text, textScale * st.scale, glyph) : 0;
  const shadows = [
    // no dark shadow on a PowerPoint slide's own (usually dark) text color — it smudges
    st.shadow && !slideColor ? "0 0.3cqw 0.8cqw rgb(0 0 0 / 0.85)" : "",
  ].filter(Boolean);
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-black [container-type:inline-size] ${className}`}
      aria-hidden={ariaHidden || undefined}
    >
      {/* 2026-10-29: background on its own layer, so blur / dim never touch the text */}
      <div
        className={`absolute inset-0 ${bgSettings?.fit === "contain" ? "bg-contain! bg-center! bg-no-repeat!" : ""}`}
        style={{
          background: bg,
          filter: bgSettings?.blur ? `blur(${(bgSettings.blur / 19.2).toFixed(3)}cqw)` : undefined,
          transform: bgSettings?.blur && bgSettings.fit !== "contain" ? "scale(1.06)" : undefined, // hide soft blurred edges
        }}
        data-slide-bg
      />
      {!!bgSettings?.dim && <div className="absolute inset-0 bg-black" style={{ opacity: bgSettings.dim }} data-slide-dim />}
      {!hideContent && slide?.image && <img src={slide.image} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />}
      {!hideContent && !slide?.image && slide?.text && (
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
      {children}
    </div>
  );
};
