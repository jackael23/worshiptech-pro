/**
 * 2026-11-06 (Jarvis): big 16:9 preview of one slide + clickable thumbnails, with the song's own
 * background (picture / playing video / built-in). Shared by the Song editor and Bulk Add.
 */
import React, { useMemo } from "react";
import type { BackgroundSettings } from "../types";
import type { ParsedSlide } from "../lib/lyricsParser";
import { USER_SONG_BACKGROUND } from "../lib/mySongsStore";
import { useSongBackground } from "../lib/songBackground";
import { SlideScreen } from "./SlideScreen";
import { LIVE_TEXT_SCALE } from "./LiveScreen";
import { loadTextStyle, resolveTextStyle } from "../lib/textStyle";

interface Props {
  slides: ParsedSlide[];
  /** index of the slide on the big screen (clamped). */
  picked: number;
  onPick: (index: number) => void;
  bgId?: string;
  bgSettings?: BackgroundSettings;
  /** "grid" = thumbnails in rows (editor), "strip" = one scrolling row (Bulk Add). */
  layout?: "grid" | "strip";
  emptyText?: string;
  /** false = big screen only. */
  thumbs?: boolean;
}

export const SongPreview: React.FC<Props> = ({ slides, picked, onPick, bgId, bgSettings, layout = "grid", emptyText, thumbs = true }) => {
  const bg = useSongBackground(bgId);
  // Same text size + style as the projector (LIVE_TEXT_SCALE + the saved Text style), so the preview is true to life.
  const textStyle = useMemo(() => resolveTextStyle(loadTextStyle()), []);
  const css = bg.css || USER_SONG_BACKGROUND;
  const settings = bg.css ? bgSettings : undefined;
  const idx = slides.length ? Math.min(Math.max(picked, 0), slides.length - 1) : -1;
  const current = idx >= 0 ? slides[idx] : null;

  return (
    <div className={`flex flex-col gap-2 min-h-0 ${layout === "grid" && thumbs ? "flex-1" : ""}`}>
      {current ? (
        <SlideScreen slide={current} background={css} bgSettings={settings} bgVideoId={bg.videoId} textScale={LIVE_TEXT_SCALE} textStyle={textStyle} className="rounded-lg border border-line shrink-0" ariaHidden />
      ) : (
        <div className="aspect-video shrink-0 grid place-items-center rounded-lg border border-dashed border-line-strong bg-surface-2 text-xs text-fg-subtle p-4 text-center" style={bg.css ? { background: css } : undefined}>
          <span className="rounded bg-black/40 px-2 py-1 text-white/90">{emptyText || "Lalabas dito ang slide (16:9, gaya sa projector) habang nagta-type."}</span>
        </div>
      )}
      {bg.missing && <p className="notice-warn text-xs shrink-0">Wala na sa browser na ito ang background ng kantang ito (na-delete o hindi pa nasi-sync). Default ang lalabas.</p>}

      {thumbs && slides.length > 0 && (
        <div
          className={
            layout === "grid"
              ? "flex-1 min-h-[8rem] overflow-y-auto bg-surface-2 border border-line rounded-lg p-2"
              : "shrink-0 overflow-x-auto bg-surface-2 border border-line rounded-lg p-2"
          }
          data-testid="slide-thumbs"
        >
          <div className={layout === "grid" ? "grid grid-cols-2 xl:grid-cols-3 gap-2" : "flex gap-2"}>
            {slides.map((sl, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPick(i)}
                className={`text-left min-w-0 rounded-md p-1 border transition-colors ${layout === "strip" ? "w-48 shrink-0" : ""} ${i === idx ? "border-accent ring-2 ring-accent/30 bg-accent-soft" : "border-transparent hover:bg-surface-3"}`}
                aria-label={`Silipin ang slide ${i + 1}: ${sl.label}`}
                aria-pressed={i === idx}
              >
                <div className="text-xs font-semibold text-accent-text truncate mb-0.5">
                  {i + 1}. {sl.label}
                </div>
                {/* thumbnails show the picture / video poster only (no video playing in every thumbnail) */}
                <SlideScreen slide={sl} background={css} bgSettings={settings} textScale={LIVE_TEXT_SCALE} textStyle={textStyle} className="rounded border border-line" ariaHidden />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
