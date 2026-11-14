/**
 * 2026-10-28 (Jarvis): Presentations tab of the simulator's Media Library (PowerPoint upload).
 *  - Import .pptx: text + speaker notes + background of each slide (no exact layout).
 *  - Import images: slides exported from PowerPoint as PNG/JPG — exact look, 1 picture = 1 slide.
 * Saved in this browser only (IndexedDB).
 * 2026-11-03b: saved in PouchDB + optional CouchDB sync (presentationStore.ts / couchSync.ts).
 * 2026-11-14: the list shows PresentationMeta (thumbnail + name); the slides are loaded only on
 *   Add / double-click. Importing several files ends with one summary of all of them.
 */
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, Images, AlertTriangle, Loader2, Presentation as PresentationIcon } from "lucide-react";
import { IMAGE_SLIDE_TYPES } from "../lib/slideImageTypes";
// 2026-11-09: pptxImport (with JSZip) is loaded only when a file is imported.
const loadPptx = () => import("../lib/pptxImport");
import {
  StoredPresentation,
  PresentationMeta,
  PRESENTATION_LIMITS,
  listPresentations,
  loadPresentation,
  savePresentation,
  deletePresentation,
  newPresentationId,
  watchPresentations,
} from "../lib/presentationStore";
import { CouchSyncPanel, autoStartCouchSync } from "./CouchSyncPanel";

interface PresentationLibraryProps {
  searchQuery: string;
  onAddToSchedule: (p: StoredPresentation) => void;
  /** Double-click = add to schedule + LIVE (first slide). */
  onLivePresentation?: (p: StoredPresentation) => void;
}

const smallBtn =
  "tap-target px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all flex items-center gap-1 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed";

export const PresentationLibrary: React.FC<PresentationLibraryProps> = ({ searchQuery, onAddToSchedule, onLivePresentation }) => {
  const [items, setItems] = useState<PresentationMeta[]>([]);
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
    void autoStartCouchSync();
    return watchPresentations(() => void refresh()); // e.g. decks pulled from CouchDB
  }, []);

  useEffect(() => {
    if (!notice || notice.tone === "warn") return; // warnings stay until the next action
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  type Deck = { name: string; kind: "pptx" | "images"; slides: StoredPresentation["slides"]; warnings: string[] };
  /** Saves one deck. Returns what to tell the user (never throws). */
  const store = async (deck: Deck, count: number): Promise<{ ok: boolean; text: string; warn: string[] }> => {
    if (count >= PRESENTATION_LIMITS.MAX_PRESENTATIONS) {
      return { ok: false, text: `Puno na (max ${PRESENTATION_LIMITS.MAX_PRESENTATIONS} presentation). Mag-delete muna.`, warn: [] };
    }
    const p: StoredPresentation = { id: newPresentationId(), name: deck.name, kind: deck.kind, slides: deck.slides, createdAt: new Date().toISOString() };
    const saved = await savePresentation(p);
    const warn = [...deck.warnings];
    if (!saved) warn.push("Hindi na-save sa browser (puno o private mode) — mawawala ito pag-reload.");
    return { ok: true, text: `"${p.name}" (${p.slides.length} slides)`, warn };
  };

  /** 2026-11-14: one message for all files of an import (before, each file overwrote the last one's). */
  const summarize = (added: { text: string; warn: string[] }[], failed: string[]) => {
    const parts: string[] = [];
    if (added.length === 1) parts.push(`Naidagdag ang ${added[0].text}.`);
    else if (added.length > 1) parts.push(`Naidagdag ang ${added.length} presentation: ${added.map((a) => a.text).join(", ")}.`);
    if (failed.length) parts.push(`Hindi nabasa (${failed.length}): ${failed.map((f) => f.replace(/\.+$/, "")).join("; ")}.`);
    const warns = added.flatMap((a) => (added.length > 1 ? a.warn.map((w) => `${a.text.split('" (')[0]}": ${w}`) : a.warn));
    if (warns.length) parts.push(warns.slice(0, 4).join(" ") + (warns.length > 4 ? ` (+${warns.length - 4} pa)` : ""));
    setNotice({ text: parts.join(" "), tone: failed.length || warns.length ? "warn" : "ok" });
  };

  const handlePptx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setNotice(null);
    const added: { text: string; warn: string[] }[] = [];
    const failed: string[] = [];
    let count = items.length;
    for (const [i, f] of files.entries()) {
      setBusy(`Binabasa ang ${f.name}…${files.length > 1 ? ` (${i + 1}/${files.length})` : ""}`);
      try {
        const r = await store(await (await loadPptx()).readPptx(f, f.name), count);
        if (r.ok) {
          added.push(r);
          count++;
        } else failed.push(`${f.name} – ${r.text}`);
      } catch (err: any) {
        failed.push(`${f.name} – ${err?.message || "hindi nabasa."}`);
      }
    }
    await refresh();
    summarize(added, failed);
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
      const r = await store(await (await loadPptx()).readImageSlides(files, name.trim() || suggested), items.length);
      await refresh();
      if (r.ok) summarize([r], []);
      else setNotice({ text: r.text, tone: "warn" });
    } catch (err: any) {
      setNotice({ text: err?.message || "Hindi nabasa ang mga larawan.", tone: "warn" });
    }
    setBusy(null);
  };

  /** Loads the whole deck (slides + pictures) for Add / LIVE. */
  const withSlides = async (meta: PresentationMeta, use: (p: StoredPresentation) => void) => {
    const full = await loadPresentation(meta.id);
    if (full) use(full);
    else setNotice({ text: `Hindi mabuksan ang "${meta.name}" (na-delete o hindi pa tapos mag-sync).`, tone: "warn" });
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
    (p) => !q || p.name.toLowerCase().includes(q) || p.searchText.includes(q),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => pptxRef.current?.click()}
          disabled={!!busy}
          className={`${smallBtn} bg-accent hover:bg-accent-hover text-white border-accent`}
          title="PowerPoint (.pptx): kukunin ang text, notes, background at malalaking larawan ng bawat slide"
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

      <CouchSyncPanel />

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
            <strong>Import .pptx</strong> — text, speaker notes at background ng bawat slide, pati ang larawang halos sakop ang buong slide (announcement, poster). Hindi kasama ang maliliit na larawan, shapes at eksaktong ayos.
          </p>
          <p>
            <strong>Import images</strong> — sa PowerPoint: <em>File → Save As → PNG → All Slides</em>, tapos piliin lahat ng PNG. Eksakto ang itsura.
          </p>
          <p className="text-fg-subtle">Naka-save sa browser na ito (at sa CouchDB mo kapag naka-on ang sync). Hindi suportado ang lumang .ppt.</p>
        </div>
      )}
      {items.length > 0 && rows.length === 0 && <p className="text-xs text-fg-subtle p-2">Walang tugma sa "{searchQuery}".</p>}

      {rows.map((p) => {
        const first = p.thumb;
        return (
          <div
            key={p.id}
            onDoubleClick={(e) => {
              if (!onLivePresentation || (e.target as HTMLElement).closest("button")) return;
              void withSlides(p, onLivePresentation);
            }}
            title="Double-click = Add + LIVE"
            className="bg-surface-2 hover:bg-surface-3 border border-line rounded-lg p-2 transition-all text-xs shadow-xs cursor-pointer select-none touch-manipulation flex items-center gap-2"
          >
            {/* thumbnail of the first slide */}
            <div
              className="w-16 aspect-video rounded border border-line overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: first.background || "#0f172a" }}
              aria-hidden
            >
              {first.image && !first.text ? (
                <img src={first.image} alt="" className="w-full h-full object-contain" />
              ) : (
                <span
                  className="w-full h-full grid place-items-center text-xs leading-tight px-1 text-center font-semibold bg-center bg-cover"
                  style={{ color: first.textColor || "#fff", backgroundImage: first.image ? `url("${first.image}")` : undefined }}
                >
                  <span className="truncate max-w-full">{first.text || <PresentationIcon className="w-4 h-4" />}</span>
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-fg truncate">{p.name}</div>
              <div className="text-xs text-fg-subtle flex items-center gap-1.5 mt-0.5">
                <span className="px-1.5 rounded bg-surface-3 border border-line font-medium">{p.kind === "pptx" ? "PPTX" : "Images"}</span>
                <span>{p.slideCount} slides</span>
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
                  <button onClick={() => void withSlides(p, onAddToSchedule)} className={`${smallBtn} bg-accent-soft hover:bg-accent/20 text-accent-text border-accent/30`} title="Add to Service Schedule">
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
