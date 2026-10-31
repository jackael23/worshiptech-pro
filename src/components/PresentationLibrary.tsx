/**
 * 2026-10-28 (Jarvis): Presentations tab of the simulator's Media Library (PowerPoint upload).
 *  - Import .pptx: text + speaker notes + background of each slide (no exact layout).
 *  - Import images: slides exported from PowerPoint as PNG/JPG — exact look, 1 picture = 1 slide.
 * Saved in this browser only (IndexedDB).
 */
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, Images, AlertTriangle, Loader2, Presentation as PresentationIcon } from "lucide-react";
import { readPptx, readImageSlides, IMAGE_SLIDE_TYPES } from "../lib/pptxImport";
import {
  StoredPresentation,
  PRESENTATION_LIMITS,
  listPresentations,
  savePresentation,
  deletePresentation,
  newPresentationId,
} from "../lib/presentationStore";

interface PresentationLibraryProps {
  searchQuery: string;
  onAddToSchedule: (p: StoredPresentation) => void;
  /** Double-click = add to schedule + LIVE (first slide). */
  onLivePresentation?: (p: StoredPresentation) => void;
}

const smallBtn =
  "tap-target px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed";

export const PresentationLibrary: React.FC<PresentationLibraryProps> = ({ searchQuery, onAddToSchedule, onLivePresentation }) => {
  const [items, setItems] = useState<StoredPresentation[]>([]);
  const [storageOk, setStorageOk] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const pptxRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const r = await listPresentations();
    setItems(r.presentations);
    setStorageOk(r.persistent);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!notice || notice.tone === "warn") return; // warnings stay until the next action
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const store = async (deck: { name: string; kind: "pptx" | "images"; slides: StoredPresentation["slides"]; warnings: string[] }) => {
    if (items.length >= PRESENTATION_LIMITS.MAX_PRESENTATIONS) {
      setNotice({ text: `Puno na (max ${PRESENTATION_LIMITS.MAX_PRESENTATIONS} presentation). Mag-delete muna.`, tone: "warn" });
      return;
    }
    const p: StoredPresentation = { id: newPresentationId(), name: deck.name, kind: deck.kind, slides: deck.slides, createdAt: new Date().toISOString() };
    const saved = await savePresentation(p);
    await refresh();
    const msgs = [`Naidagdag ang "${p.name}" (${p.slides.length} slides).`, ...deck.warnings];
    if (!saved) msgs.push("Hindi na-save sa browser (puno o private mode) — mawawala ito pag-reload.");
    setNotice({ text: msgs.join(" "), tone: deck.warnings.length || !saved ? "warn" : "ok" });
  };

  const handlePptx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setNotice(null);
    for (const f of files) {
      setBusy(`Binabasa ang ${f.name}…`);
      try {
        await store(await readPptx(f, f.name));
      } catch (err: any) {
        setNotice({ text: `${f.name}: ${err?.message || "hindi nabasa."}`, tone: "warn" });
      }
    }
    setBusy(null);
  };

  const handleImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    const suggested = `Mga larawan (${files.length}) — ${new Date().toLocaleDateString()}`;
    const name = window.prompt("Pangalan ng presentation:", suggested);
    if (name === null) return; // cancelled
    setNotice(null);
    setBusy(`Binabasa ang ${files.length} larawan…`);
    try {
      await store(await readImageSlides(files, name.trim() || suggested));
    } catch (err: any) {
      setNotice({ text: err?.message || "Hindi nabasa ang mga larawan.", tone: "warn" });
    }
    setBusy(null);
  };

  const handleDelete = async (id: string) => {
    const p = items.find((x) => x.id === id);
    await deletePresentation(id);
    setConfirmDeleteId(null);
    await refresh();
    if (p) setNotice({ text: `Na-delete ang "${p.name}".`, tone: "ok" });
  };

  const q = searchQuery.trim().toLowerCase();
  const rows = items.filter(
    (p) => !q || p.name.toLowerCase().includes(q) || p.slides.some((s) => s.text.toLowerCase().includes(q) || s.label.toLowerCase().includes(q)),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => pptxRef.current?.click()}
          disabled={!!busy}
          className={`${smallBtn} bg-accent hover:bg-accent-hover text-white border-accent`}
          title="PowerPoint (.pptx): kukunin ang text, notes at background ng bawat slide"
        >
          <Upload className="w-3.5 h-3.5" />
          Import .pptx
        </button>
        <button
          onClick={() => imagesRef.current?.click()}
          disabled={!!busy}
          className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line`}
          title="Mga slide na in-export bilang PNG/JPG (PowerPoint: File → Save As → PNG → All Slides). Eksakto ang itsura."
        >
          <Images className="w-3.5 h-3.5" />
          Import images
        </button>
        <input ref={pptxRef} type="file" multiple accept=".pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation" className="hidden" onChange={handlePptx} data-testid="pptx-input" />
        <input ref={imagesRef} type="file" multiple accept={IMAGE_SLIDE_TYPES.join(",")} className="hidden" onChange={handleImages} data-testid="images-input" />
      </div>

      {busy && (
        <p role="status" className="text-xs text-accent-text bg-accent-soft border border-accent/30 rounded-md px-2 py-1.5 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {busy}
        </p>
      )}
      {!storageOk && (
        <p className="text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5 flex gap-1.5">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Hindi makapag-save sa browser na ito (private mode?). Mawawala ang presentations pag-reload.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className={`text-xs rounded-md px-2 py-1.5 border ${
            notice.tone === "ok" ? "text-fg bg-ok-soft border-ok/30" : "text-warn-text bg-warn-soft border-warn/30"
          }`}
        >
          {notice.text}
        </p>
      )}

      {items.length === 0 && !busy && (
        <div className="text-xs text-fg-muted bg-surface-2 border border-dashed border-line-strong rounded-lg p-3 space-y-1.5">
          <p>Wala pang presentation. Dalawang paraan:</p>
          <p>
            <strong>Import .pptx</strong> — text, speaker notes at background ng bawat slide. Hindi kasama ang mga larawan, shapes at eksaktong ayos.
          </p>
          <p>
            <strong>Import images</strong> — sa PowerPoint: <em>File → Save As → PNG → All Slides</em>, tapos piliin lahat ng PNG. Eksakto ang itsura.
          </p>
          <p className="text-fg-subtle">Dito lang sa browser na ito naka-save. Hindi suportado ang lumang .ppt.</p>
        </div>
      )}
      {items.length > 0 && rows.length === 0 && <p className="text-xs text-fg-subtle p-2">Walang tugma sa "{searchQuery}".</p>}

      {rows.map((p) => {
        const first = p.slides[0];
        return (
          <div
            key={p.id}
            onDoubleClick={(e) => {
              if (!onLivePresentation || (e.target as HTMLElement).closest("button")) return;
              onLivePresentation(p);
            }}
            title="Double-click = Add + LIVE"
            className="bg-surface-2 hover:bg-surface-3 border border-line rounded-lg p-2 transition-all text-xs shadow-xs cursor-pointer select-none touch-manipulation flex items-center gap-2"
          >
            {/* thumbnail of the first slide */}
            <div
              className="w-16 aspect-video rounded border border-line overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: first?.background || "#0f172a" }}
              aria-hidden
            >
              {first?.image ? (
                <img src={first.image} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs leading-tight px-1 truncate max-w-full text-center font-semibold" style={{ color: first?.textColor || "#fff" }}>
                  {first?.text.split("\n")[0] || <PresentationIcon className="w-4 h-4" />}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-fg truncate">{p.name}</div>
              <div className="text-xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                <span className="px-1.5 rounded bg-surface-3 border border-line font-medium">{p.kind === "pptx" ? "PPTX" : "Images"}</span>
                <span>{p.slides.length} slides</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {confirmDeleteId === p.id ? (
                <>
                  <button onClick={() => handleDelete(p.id)} className={`${smallBtn} bg-live hover:brightness-110 text-white border-live`}>
                    Delete
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className={`${smallBtn} bg-surface-2 hover:bg-surface-3 text-fg border-line`}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setConfirmDeleteId(p.id)}
                    className="p-2.5 lg:p-1.5 rounded-md text-fg-subtle hover:text-live-text hover:bg-live-soft"
                    title="Delete"
                    aria-label={`Delete ${p.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => onAddToSchedule(p)} className={`${smallBtn} bg-accent-soft hover:bg-accent/20 text-accent-text border-accent/30`} title="Add to Service Schedule">
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
