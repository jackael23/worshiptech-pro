/**
 * 2026-11-07 (Mira): Appearance popover (header ▸ palette button) — how the APP looks, not the projector.
 *  Mode (Dark / Light / Auto) · Accent color · Background (built-in animated + nature scenes,
 *  or a picture / video — uploads go to the Media tab like everywhere else) · Dim · Blur · Galaw on/off.
 *  Not role="dialog" on purpose: that blocked the Simulator hotkeys before (see README 2026-10-29).
 */
import React, { useEffect, useRef, useState } from "react";
import { Ban, Check, ImagePlus, Loader2, Moon, Monitor, Play, RotateCcw, Sun, X } from "lucide-react";
import { ACCENTS, Appearance, AppearanceMode, DEFAULT_APPEARANCE, DEFAULT_BG, SCENES } from "../lib/appearance";
import { IMAGE_TYPES, MEDIA_LIMITS, MediaItem, VIDEO_TYPES, addImageFile, addVideoFile, listMedia, watchMedia } from "../lib/mediaStore";

interface Props {
  value: Appearance;
  onChange: (next: Appearance) => void;
  onClose: () => void;
}

const tileCls = (selected: boolean) =>
  `group relative block w-full overflow-hidden rounded-md border text-left ${selected ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-line-strong"}`;

const Tick = () => (
  <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
    <Check className="h-3 w-3" />
  </span>
);

const MODES: { id: AppearanceMode; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "dark", label: "Dark", icon: Moon, hint: "Madilim (pang-booth)" },
  { id: "light", label: "Light", icon: Sun, hint: "Maliwanag" },
  { id: "auto", label: "Auto", icon: Monitor, hint: "Sumusunod sa setting ng Windows" },
];

export const AppearancePanel: React.FC<Props> = ({ value, onChange, onClose }) => {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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

  // Esc or a click outside closes it (the palette button toggles it itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (boxRef.current?.contains(t) || t?.closest("[data-appearance-toggle]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const set = (patch: Partial<Appearance>) => onChange({ ...value, ...patch });
  const setBg = (patch: Partial<Appearance["bg"]>) => onChange({ ...value, bg: { ...value.bg, ...patch } });
  const pickBg = (id: string) => setBg({ id });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      pickBg(id);
    } catch (err: any) {
      setNotice(err?.message || `"${f.name}": hindi nabasa.`);
    } finally {
      setBusy(null);
    }
  };

  const hasBg = !!value.bg.id;
  const isMediaBg = hasBg && !value.bg.id.startsWith("scene-");
  const missing = isMediaBg && media.length > 0 && !media.some((m) => m.id === value.bg.id);
  const animated = SCENES.filter((s) => s.kind === "animated");
  const nature = SCENES.filter((s) => s.kind === "nature");

  const sceneTile = (s: (typeof SCENES)[number]) => (
    <button type="button" key={s.id} onClick={() => pickBg(s.id)} className={tileCls(value.bg.id === s.id)} aria-pressed={value.bg.id === s.id} aria-label={`Background: ${s.name}`}>
      <div className="aspect-video" style={{ background: s.thumb }} />
      <div className="truncate px-1.5 py-1 text-xs text-fg">{s.name}</div>
      {value.bg.id === s.id && <Tick />}
    </button>
  );

  return (
    <div
      ref={boxRef}
      aria-label="Appearance"
      data-testid="appearance-panel"
      className="panel absolute right-2 top-[calc(100%+0.25rem)] z-[60] flex max-h-[min(80dvh,44rem)] w-[min(24rem,calc(100vw-1rem))] flex-col overflow-hidden bg-[var(--c-surface-solid)]! shadow-2xl sm:right-5"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold text-fg">Appearance</div>
          <div className="text-xs text-fg-subtle">Itsura ng app (hindi ng projector)</div>
        </div>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-icon tap-target" aria-label="Isara ang Appearance">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {/* Mode */}
        <section>
          <div className="eyebrow mb-1.5">Mode</div>
          <div className="seg grid w-full grid-cols-3" role="group" aria-label="Mode">
            {MODES.map(({ id, label, icon: Icon, hint }) => (
              <button type="button" key={id} onClick={() => set({ mode: id })} aria-pressed={value.mode === id} className="seg-item" title={hint}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Accent */}
        <section>
          <div className="eyebrow mb-1.5">Kulay (accent)</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Accent color">
            {ACCENTS.map((a) => {
              const on = value.accent === a.id;
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => set({ accent: a.id })}
                  aria-pressed={on}
                  aria-label={`Accent: ${a.name}`}
                  title={a.name}
                  className={`grid h-9 w-9 place-items-center rounded-full ring-offset-2 ring-offset-[var(--c-surface-solid)] transition-shadow max-lg:h-11 max-lg:w-11 ${on ? "ring-2 ring-fg" : "hover:ring-2 hover:ring-line-strong"}`}
                  style={{ background: a.swatch }}
                >
                  {on && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Background */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="eyebrow">Background ng app</div>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy} className="btn btn-secondary btn-sm tap-target">
              <ImagePlus className="h-3.5 w-3.5" />
              Upload
            </button>
            <input ref={inputRef} type="file" accept={[...IMAGE_TYPES, ...VIDEO_TYPES, ".mp4", ".webm"].join(",")} className="hidden" onChange={handleFile} data-testid="appearance-upload" />
          </div>
          {busy && (
            <p role="status" className="notice-info flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </p>
          )}
          {notice && <p className="notice-warn">{notice}</p>}
          {missing && <p className="notice-warn">Wala na sa browser na ito ang napiling larawan/video (na-delete o hindi pa nasi-sync).</p>}

          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => pickBg("")} className={tileCls(!hasBg)} aria-pressed={!hasBg} aria-label="Walang background (plain)">
              <div className="grid aspect-video place-items-center bg-surface-2 text-fg-subtle">
                <Ban className="h-5 w-5" />
              </div>
              <div className="truncate px-1.5 py-1 text-xs text-fg">Plain</div>
              {!hasBg && <Tick />}
            </button>
            {animated.map(sceneTile)}
          </div>
          <div className="eyebrow pt-1">Nature</div>
          <div className="grid grid-cols-3 gap-2">{nature.map(sceneTile)}</div>

          <div className="eyebrow pt-1">
            Mula sa Media tab <span className="font-mono font-normal normal-case tracking-normal">{media.length}</span>
          </div>
          {media.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs text-fg-subtle">
              Wala pang larawan o video. Pindutin ang <strong>Upload</strong> para gamitin ang sarili mong litrato (hal. bundok, dagat, simbahan).
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {media.map((m) => (
                <button type="button" key={m.id} onClick={() => pickBg(m.id)} className={tileCls(value.bg.id === m.id)} aria-pressed={value.bg.id === m.id} aria-label={`Background: ${m.name}${m.kind === "video" ? " (video)" : ""}`}>
                  <div className="relative aspect-video overflow-hidden bg-black">
                    {m.thumbUrl ? <img src={m.thumbUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="grid h-full place-items-center text-xs text-zinc-400">nagsi-sync…</div>}
                    {m.kind === "video" && (
                      <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 font-mono text-[11px] text-white">
                        <Play className="h-2.5 w-2.5 fill-current" /> video
                      </span>
                    )}
                  </div>
                  <div className="truncate px-1.5 py-1 text-xs text-fg">{m.name}</div>
                  {value.bg.id === m.id && <Tick />}
                </button>
              ))}
            </div>
          )}

          {hasBg && (
            <div className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-2 gap-y-1.5 rounded-lg border border-line bg-surface-2 p-2.5 text-xs">
              <label htmlFor="app-bg-dim" className="eyebrow" title="Mas mataas = mas malinaw basahin ang mga panel">
                Dim
              </label>
              <input id="app-bg-dim" type="range" min={0} max={80} step={5} value={Math.round(value.bg.dim * 100)} onChange={(e) => setBg({ dim: Number(e.target.value) / 100 })} className="h-7 accent-[var(--c-accent)]" />
              <span className="text-right font-mono tabular-nums text-fg">{Math.round(value.bg.dim * 100)}%</span>
              {isMediaBg && (
                <>
                  <label htmlFor="app-bg-blur" className="eyebrow">
                    Blur
                  </label>
                  <input id="app-bg-blur" type="range" min={0} max={20} step={1} value={value.bg.blur} onChange={(e) => setBg({ blur: Number(e.target.value) })} className="h-7 accent-[var(--c-accent)]" />
                  <span className="text-right font-mono tabular-nums text-fg">{value.bg.blur}</span>
                </>
              )}
              <span className="eyebrow">Galaw</span>
              <div className="seg col-span-2 grid grid-cols-2" role="group" aria-label="Galaw ng background">
                <button type="button" onClick={() => set({ motion: true })} aria-pressed={value.motion} className="seg-item">
                  On
                </button>
                <button type="button" onClick={() => set({ motion: false })} aria-pressed={!value.motion} className="seg-item" title="Patigilin ang animation (hal. kung bumabagal ang laptop)">
                  Off
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <span className="text-xs text-fg-subtle">Naka-save sa browser na ito</span>
        <button type="button" onClick={() => onChange({ ...DEFAULT_APPEARANCE, bg: { ...DEFAULT_BG } })} className="btn btn-ghost btn-sm tap-target">
          <RotateCcw className="h-3.5 w-3.5" />
          Ibalik sa default
        </button>
      </div>
    </div>
  );
};
