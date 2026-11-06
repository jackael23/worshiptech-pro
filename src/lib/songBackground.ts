/**
 * 2026-11-06 (Jarvis): a My Song's own background.
 * The song stores only an id ("bg-…" built-in, "img-…" picture / "vid-…" video from the Media tab);
 * this turns it into the CSS the slide screens use. Media files stay in the media database
 * (and its CouchDB sync) — they are never copied into the songs database.
 */
import { useEffect, useState } from "react";
import { SAMPLE_BACKGROUNDS } from "../data/easyworshipData";
import { backgroundCss, isVideoId, watchMedia } from "./mediaStore";

export interface ResolvedSongBg {
  /** CSS background (picture, video poster or gradient); null = use the default. */
  css: string | null;
  /** Media upload id ("img-…" / "vid-…") — a "vid-…" id makes the screen play the video. */
  mediaId?: string;
  /** True when the song points to an upload that is not in this browser (deleted / not synced yet). */
  missing: boolean;
}

// Data URLs of big pictures are costly to build, so keep them; cleared when the media database changes.
const cache = new Map<string, string>();
let watching = false;
function watchOnce() {
  if (watching) return;
  watching = true;
  try {
    watchMedia(() => cache.clear());
  } catch {
    watching = false;
  }
}

export const sampleBackground = (id: string) => SAMPLE_BACKGROUNDS.find((b) => b.id === id);

export async function resolveSongBackground(bgId: string | undefined): Promise<ResolvedSongBg> {
  if (!bgId) return { css: null, missing: false };
  if (bgId.startsWith("bg-")) {
    const s = sampleBackground(bgId);
    return s ? { css: s.css, missing: false } : { css: null, missing: true };
  }
  watchOnce();
  const hit = cache.get(bgId);
  if (hit) return { css: hit, mediaId: bgId, missing: false };
  try {
    const css = await backgroundCss(bgId);
    if (!css) return { css: null, missing: true };
    cache.set(bgId, css);
    return { css, mediaId: bgId, missing: false };
  } catch {
    return { css: null, missing: true };
  }
}

/** React hook for previews: the resolved background of a bgId (updates when the media database changes). */
export function useSongBackground(bgId: string | undefined): ResolvedSongBg & { loading: boolean; videoId?: string } {
  const [state, setState] = useState<ResolvedSongBg & { loading: boolean }>({ css: null, missing: false, loading: !!bgId });
  useEffect(() => {
    let alive = true;
    const load = () => {
      setState((s) => ({ ...s, loading: !!bgId }));
      resolveSongBackground(bgId).then((r) => alive && setState({ ...r, loading: false }));
    };
    load();
    let stop = () => undefined as void;
    if (bgId && !bgId.startsWith("bg-")) {
      try {
        stop = watchMedia(() => load());
      } catch {
        /* no media database (private mode) */
      }
    }
    return () => {
      alive = false;
      stop();
    };
  }, [bgId]);
  return { ...state, videoId: state.mediaId && isVideoId(state.mediaId) ? state.mediaId : undefined };
}
