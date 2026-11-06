/**
 * 2026-11-06 (Jarvis): picks a My Song's own background (Song editor + Bulk Add).
 *  - None (default) · built-in backgrounds · pictures/videos already in the Media tab · upload new ones here.
 *  - Dim / Blur / Fill-Fit, same as the Media tab.
 * Only the id + settings are saved with the song; the files stay in the Media database (and its CouchDB sync).
 */
import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Check, Play, Ban } from "lucide-react";
import type { BackgroundSettings } from "../types";
import { SAMPLE_BACKGROUNDS } from "../data/easyworshipData";
import { IMAGE_TYPES, VIDEO_TYPES, MEDIA_LIMITS, MediaItem, addImageFile, addVideoFile, listMedia, watchMedia } from "../lib/mediaStore";

export const DEFAULT_SONG_BG_SETTINGS: BackgroundSettings = { dim: 0, fit: "cover", blur: 0 };

export interface SongBgValue {
  bgId?: string;
  bgSettings?: BackgroundSettings;
}

interface Props {
  value: SongBgValue;
  onChange: (next: SongBgValue) => void;
}

const tileCls = (selected: boolean) =>
  `group relative block w-full overflow-hidden rounded-md border text-left ${selected ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-line-strong"}`;

const Tick = () => (
  <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
    <Check className="h-3 w-3" />
  </span>
);

export const BackgroundPicker: React.FC<Props> = ({ value, onChange }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const st = value.bgSettings || DEFAULT_SONG_BG_SETTINGS;

  const refresh = async () => {
    try {
      setMedia((await listMedia()).items);
    } catch {
      setMedia([]);
    }
  };
  useEffect(() => {
    void refresh();
    try {
      return watchMedia(() => void refresh());
    } catch {
      return undefined;
    }
  }, []);

  const pick = (bgId?: string) => onChange(bgId ? { bgId, bgSettings: value.bgSettings || DEFAULT_SONG_BG_SETTINGS } : {});
  const set = (patch: Partial<BackgroundSettings>) => onChange({ ...value, bgSettings: { ...st, ...patch } });

  // Upload here = same as the Media tab (same limits); the new upload becomes the song's background.
  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const video = f.type.startsWith("video/") || /\.(mp4|webm)$/i.test(f.name);
    const count = media.filter((m) => m.kind === (video ? "video" : "image")).length;
    if (count >= (video ? MEDIA_LIMITS.MAX_VIDEOS : MEDIA_LIMITS.MAX_IMAGES)) {
      setNotice(`Puno na ang ${video ? "videos" : "larawan"} sa Media tab (max ${video ? MEDIA_LIMITS.MAX_VIDEOS : MEDIA_LIMITS.MAX_IMAGES}). Mag-delete muna doon.`);
      return;
    }
    setNotice(null);
    setBusy(video ? "Ina-upload ang video (sandali lang)…" : "Ina-upload ang larawan…");
    try {
      const id = await (video ? addVideoFile(f) : addImageFile(f));
      await refresh();
      pick(id);
    } catch (err: any) {
      setNotice(err?.message || `"${f.name}": hindi nabasa.`);
    } finally {
      setBusy(null);
    }
  };

  const missing = !!value.bgId && !value.bgId.startsWith("bg-") && media.length > 0 && !media.some((m) => m.id === value.bgId);

  return (
    <div className="space-y-3" data-testid="bg-picker">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy} className="btn btn-primary btn-sm tap-target">
          <ImagePlus className="h-3.5 w-3.5" />
          Upload larawan / video
        </button>
        <span className="text-xs text-fg-subtle">JPG, PNG, WebP · MP4, WebM (max 200 MB) — mapupunta rin sa Media tab</span>
        <input ref={inputRef} type="file" accept={[...IMAGE_TYPES, ...VIDEO_TYPES, ".mp4", ".webm"].join(",")} className="hidden" onChange={handleFiles} data-testid="bg-upload" />
      </div>
      {busy && (
        <p role="status" className="notice-info flex items-center gap-1.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {busy}
        </p>
      )}
      {notice && <p className="notice-warn text-xs">{notice}</p>}
      {missing && <p className="notice-warn text-xs">Wala na sa browser na ito ang napiling background (na-delete o hindi pa nasi-sync). Default ang lalabas.</p>}

      {/* Dim / Blur / Fit */}
      {value.bgId && (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-2 gap-y-1.5 rounded-lg border border-line bg-surface-2 p-2.5 text-xs">
          <label htmlFor="song-bg-dim" className="eyebrow">Dim</label>
          <input id="song-bg-dim" type="range" min={0} max={70} step={5} value={Math.round(st.dim * 100)} onChange={(e) => set({ dim: Number(e.target.value) / 100 })} className="h-7 accent-[var(--c-accent)]" />
          <span className="text-right font-mono tabular-nums text-fg">{Math.round(st.dim * 100)}%</span>
          <label htmlFor="song-bg-blur" className="eyebrow">Blur</label>
          <input id="song-bg-blur" type="range" min={0} max={20} step={1} value={st.blur} onChange={(e) => set({ blur: Number(e.target.value) })} className="h-7 accent-[var(--c-accent)]" />
          <span className="text-right font-mono tabular-nums text-fg">{st.blur}</span>
          <span className="eyebrow">Fit</span>
          <div className="seg col-span-2 grid grid-cols-2" role="group" aria-label="Fit">
            <button type="button" onClick={() => set({ fit: "cover" })} aria-pressed={st.fit === "cover"} className="seg-item" title="Puno ang screen (puwedeng maputol ang gilid)">Fill</button>
            <button type="button" onClick={() => set({ fit: "contain" })} aria-pressed={st.fit === "contain"} className="seg-item" title="Buong larawan (may itim sa gilid)">Fit</button>
          </div>
        </div>
      )}

      {/* none + built-in */}
      <div>
        <div className="eyebrow mb-1.5">Kasama sa app</div>
        <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
          <button type="button" onClick={() => pick(undefined)} className={tileCls(!value.bgId)} aria-pressed={!value.bgId} aria-label="Walang background (default)">
            <div className="grid aspect-video place-items-center bg-surface-2 text-fg-subtle">
              <Ban className="h-5 w-5" />
            </div>
            <div className="truncate px-1.5 py-1 text-xs text-fg">Default</div>
            {!value.bgId && <Tick />}
          </button>
          {SAMPLE_BACKGROUNDS.map((b) => (
            <button type="button" key={b.id} onClick={() => pick(b.id)} className={tileCls(value.bgId === b.id)} aria-pressed={value.bgId === b.id} aria-label={`Background: ${b.name}`}>
              <div className="aspect-video" style={{ background: b.css }} />
              <div className="truncate px-1.5 py-1 text-xs text-fg">{b.name}</div>
              {value.bgId === b.id && <Tick />}
            </button>
          ))}
        </div>
      </div>

      {/* uploads */}
      <div>
        <div className="eyebrow mb-1.5">
          Mula sa Media tab <span className="font-mono font-normal normal-case tracking-normal">{media.length}</span>
        </div>
        {media.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs text-fg-subtle">Wala pang larawan o video. Pindutin ang <strong>Upload larawan / video</strong>.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-2">
            {media.map((m) => (
              <button type="button" key={m.id} onClick={() => pick(m.id)} className={tileCls(value.bgId === m.id)} aria-pressed={value.bgId === m.id} aria-label={`Background: ${m.name}${m.kind === "video" ? " (video)" : ""}`} data-media-kind={m.kind}>
                <div className="relative aspect-video overflow-hidden bg-black">
                  {m.thumbUrl ? <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full place-items-center text-xs text-zinc-500">nagsi-sync…</div>}
                  {m.kind === "video" && (
                    <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 font-mono text-[11px] text-white">
                      <Play className="h-2.5 w-2.5 fill-current" /> video
                    </span>
                  )}
                </div>
                <div className="truncate px-1.5 py-1 text-xs text-fg">{m.name}</div>
                {value.bgId === m.id && <Tick />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
