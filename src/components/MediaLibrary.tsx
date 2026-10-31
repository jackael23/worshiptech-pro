/**
 * 2026-10-29 (Jarvis): Media tab — background pictures.
 *  - Upload images (JPG/PNG/WebP, several at once) → resized + saved in this browser (IndexedDB).
 *  - Click a picture = background of the selected schedule item (shows on Live right away if on air).
 *  - Per item: Dim (0–70%), Fill / Fit, Blur, Remove background.
 *  - Built-in offline backgrounds (CSS, no internet needed).
 */
import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, AlertTriangle, X, Check } from "lucide-react";
import type { BackgroundSettings, ScheduleItem } from "../types";
import { SAMPLE_BACKGROUNDS } from "../data/easyworshipData";
import { IMAGE_TYPES, MEDIA_LIMITS, StoredImage, deleteImage, imageBackground, listImages, readImageFile, saveImage } from "../lib/mediaStore";

export const DEFAULT_BG_SETTINGS: BackgroundSettings = { dim: 0, fit: "cover", blur: 0 };

interface Props {
  searchQuery: string;
  item?: ScheduleItem;
  /** css = new background of the selected item (null = remove it). */
  onApply: (css: string | null) => void;
  onSettings: (next: BackgroundSettings) => void;
}

export const MediaLibrary: React.FC<Props> = ({ searchQuery, item, onApply, onSettings }) => {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    const r = await listImages();
    setImages(r.images);
    setPersistent(r.persistent);
  };
  useEffect(() => {
    refresh();
  }, []);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const room = MEDIA_LIMITS.MAX_IMAGES - images.length;
    if (room <= 0) return setNotice({ text: `Puno na (max ${MEDIA_LIMITS.MAX_IMAGES} larawan). Mag-delete muna.`, tone: "warn" });
    const errors: string[] = [];
    let added = 0;
    let memOnly = false;
    for (const [i, f] of files.slice(0, room).entries()) {
      setBusy(`Pinoproseso ${i + 1}/${Math.min(files.length, room)}…`);
      try {
        const img = await readImageFile(f);
        if (!(await saveImage(img))) memOnly = true;
        added++;
      } catch (err: any) {
        errors.push(err?.message || `"${f.name}": hindi nabasa.`);
      }
    }
    if (files.length > room) errors.push(`${files.length - room} larawan ang hindi naidagdag (max ${MEDIA_LIMITS.MAX_IMAGES}).`);
    setBusy(null);
    await refresh();
    setNotice(
      errors.length
        ? { text: `${added ? `${added} naidagdag. ` : ""}${errors.join(" ")}`, tone: "warn" }
        : { text: `${added} larawan ang naidagdag.${memOnly ? " (Hindi ma-save sa browser — mawawala pagka-reload.)" : ""}`, tone: memOnly ? "warn" : "ok" },
    );
  };

  const handleDelete = async (id: string) => {
    await deleteImage(id);
    setConfirmDelete(null);
    await refresh();
  };

  const q = searchQuery.trim().toLowerCase();
  const shownImages = q ? images.filter((m) => m.name.toLowerCase().includes(q)) : images;
  const shownSamples = q ? SAMPLE_BACKGROUNDS.filter((b) => b.name.toLowerCase().includes(q)) : SAMPLE_BACKGROUNDS;
  const current = item?.background || "";
  const st = item?.bgSettings || DEFAULT_BG_SETTINGS;
  const set = (patch: Partial<BackgroundSettings>) => onSettings({ ...st, ...patch });
  const itemName = item ? item.title.replace(/^\d+\.\s*/, "") : "";

  return (
    <div className="space-y-3">
      {/* upload */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => inputRef.current?.click()} disabled={!!busy} className="btn btn-primary tap-target">
          <ImagePlus className="h-3.5 w-3.5" />
          Upload images
        </button>
        <span className="text-xs text-fg-subtle">JPG, PNG, WebP · pinaliliit sa 1920px</span>
        <input ref={inputRef} type="file" multiple accept={IMAGE_TYPES.join(",")} className="hidden" onChange={handleFiles} data-testid="media-input" />
      </div>
      {busy && (
        <p role="status" className="notice-info flex items-center gap-1.5 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {busy}
        </p>
      )}
      {notice && (
        <p role="status" className={`${notice.tone === "ok" ? "notice-ok" : "notice-warn"} text-xs`}>
          {notice.text}
        </p>
      )}
      {!persistent && (
        <p className="notice-warn flex gap-1.5 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Hindi makapag-save sa browser na ito (private mode?). Mawawala ang mga larawan pagka-reload.
        </p>
      )}

      {/* target item + settings */}
      <div className="space-y-2.5 rounded-lg border border-line bg-surface-2 p-2.5" aria-label="Background ng item">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 truncate text-fg-muted">
            Para sa: <span className="font-medium text-fg">{itemName || "— pumili ng item sa Schedule —"}</span>
          </span>
          {item && current && (
            <button onClick={() => onApply(null)} className="btn btn-ghost btn-sm shrink-0" title="Default na background na lang">
              <X className="h-3.5 w-3.5" /> Alisin
            </button>
          )}
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)_2.5rem] items-center gap-x-2 gap-y-1.5 text-xs">
          <label htmlFor="bg-dim" className="eyebrow">
            Dim
          </label>
          <input id="bg-dim" type="range" min={0} max={70} step={5} value={Math.round(st.dim * 100)} disabled={!item} onChange={(e) => set({ dim: Number(e.target.value) / 100 })} className="h-7 accent-[var(--c-accent)]" />
          <span className="text-right font-mono tabular-nums text-fg" data-testid="bg-dim-value">
            {Math.round(st.dim * 100)}%
          </span>
          <label htmlFor="bg-blur" className="eyebrow">
            Blur
          </label>
          <input id="bg-blur" type="range" min={0} max={20} step={1} value={st.blur} disabled={!item} onChange={(e) => set({ blur: Number(e.target.value) })} className="h-7 accent-[var(--c-accent)]" />
          <span className="text-right font-mono tabular-nums text-fg">{st.blur}</span>
          <span className="eyebrow">Fit</span>
          <div className="seg col-span-2 grid grid-cols-2" role="group" aria-label="Fit">
            <button onClick={() => set({ fit: "cover" })} disabled={!item} aria-pressed={st.fit === "cover"} className="seg-item" title="Puno ang screen (puwedeng maputol ang gilid)">
              Fill
            </button>
            <button onClick={() => set({ fit: "contain" })} disabled={!item} aria-pressed={st.fit === "contain"} className="seg-item" title="Buong larawan (may itim sa gilid)">
              Fit
            </button>
          </div>
        </div>
      </div>

      {/* uploads */}
      <div>
        <div className="eyebrow mb-1.5">
          Mga upload <span className="font-mono font-normal normal-case tracking-normal">{images.length}</span>
        </div>
        {images.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs text-fg-subtle">
            Wala pang larawan. Pindutin ang <strong>Upload images</strong>. Naka-save lang ito sa browser na ito.
          </p>
        ) : shownImages.length === 0 ? (
          <p className="p-1 text-xs text-fg-subtle">Walang tugma sa "{searchQuery}".</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {shownImages.map((m) => {
              const css = imageBackground(m);
              const selected = current === css;
              return (
                <div key={m.id} className={`group relative overflow-hidden rounded-lg border bg-surface-2 ${selected ? "border-accent ring-1 ring-accent" : "border-line"}`}>
                  <button
                    onClick={() => item && onApply(css)}
                    disabled={!item}
                    className="block w-full text-left disabled:cursor-not-allowed"
                    title={item ? `Gawing background ng "${itemName}"` : "Pumili muna ng item sa Schedule"}
                    aria-label={`Background: ${m.name}`}
                    aria-pressed={selected}
                  >
                    <div className="relative aspect-video overflow-hidden bg-black">
                      <img src={m.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                      {selected && (
                        <span className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                    <div className="truncate px-2 py-1.5 pr-8 text-xs font-medium text-fg">{m.name}</div>
                  </button>
                  {confirmDelete === m.id ? (
                    <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-surface p-1">
                      <button onClick={() => handleDelete(m.id)} className="btn btn-danger btn-sm flex-1">
                        Delete
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="btn btn-secondary btn-sm flex-1">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(m.id)}
                      className="absolute bottom-0.5 right-0.5 grid h-7 w-7 place-items-center rounded text-fg-subtle hover:bg-live-soft hover:text-live-text"
                      aria-label={`Delete ${m.name}`}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* built-in */}
      {shownSamples.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5">Kasama sa app (offline)</div>
          <div className="grid grid-cols-3 gap-2">
            {shownSamples.map((b) => {
              const selected = current === b.css;
              return (
                <button
                  key={b.id}
                  onClick={() => item && onApply(b.css)}
                  disabled={!item}
                  aria-label={`Background: ${b.name}`}
                  aria-pressed={selected}
                  className={`overflow-hidden rounded-lg border text-left disabled:cursor-not-allowed ${selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
                >
                  <div className="aspect-video" style={{ background: b.css }} />
                  <div className="truncate bg-surface-2 px-1.5 py-1 text-xs text-fg">{b.name}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
