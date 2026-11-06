/**
 * 2026-11-06 (Jarvis): Bulk Add for My Songs.
 *  - "paste" mode: one big text box, many songs separated by "---" (rules in lib/bulkPaste.ts).
 *  - "review" mode: songs read from a folder (Import folder) — no text box, just the preview.
 * Both show a preview first: every song with its status (Bago / Ia-update / Error) and a checkbox,
 * and only the checked songs are saved (through upsertSongs in SongLibrary).
 * 2026-11-06 (b): big projector-size preview of the selected song (desktop: own column; phone: inside
 *   the row), Edit button per song (opens the full Song editor; in paste mode the song is rewritten in
 *   the text box), clicking a slide selects its lines in the box, and a background per song or for all
 *   checked songs at once (picture / video / built-in — saved as an id, see songBackground.ts).
 */
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { X, Save, AlertTriangle, ListPlus, FolderOpen, Info, Pencil, Image as ImageIcon, Check } from "lucide-react";
import { BulkSong, parseBulkText, replaceSongInText, validateDraft } from "../lib/bulkPaste";
import { parseLyricsWithRanges } from "../lib/lyricsParser";
import { planUpsert, SongDraft, StoredSong, UpsertStatus } from "../lib/mySongsStore";
import { sampleBackground } from "../lib/songBackground";
import { SongPreview } from "./SongPreview";
import { SongEditorModal } from "./SongEditorModal";
import { BackgroundPicker, SongBgValue } from "./BackgroundPicker";

interface BulkAddModalProps {
  mode: "paste" | "review";
  /** review mode: songs already read from files. */
  initialSongs?: BulkSong[];
  /** review mode: short note, e.g. "3 file ang nilaktawan (hindi lyrics file)". */
  note?: string;
  currentSongs: StoredSong[];
  onSave: (drafts: SongDraft[]) => void;
  onClose: () => void;
}

const EXAMPLE = `Amazing Grace
Author: John Newton
Key: G

Verse 1
Amazing grace! How sweet the sound
That saved a wretch like me!

Verse 2
'Twas grace that taught my heart to fear,
And grace my fears relieved;
---
Holy, Holy, Holy
Author: Reginald Heber
Key: D

Verse 1
Holy, holy, holy! Lord God Almighty!
Early in the morning our song shall rise to Thee;
`;

const STATUS_BADGE: Record<UpsertStatus | "error", { text: string; cls: string }> = {
  new: { text: "Bago", cls: "bg-ok-soft text-fg border-ok/30" },
  update: { text: "Ia-update", cls: "bg-warn-soft text-warn-text border-warn/30" },
  invalid: { text: "Error", cls: "bg-live-soft text-live-text border-live/30" },
  error: { text: "Error", cls: "bg-live-soft text-live-text border-live/30" },
  full: { text: "Puno na", cls: "bg-live-soft text-live-text border-live/30" },
};

const keyOfDraft = (source: string | undefined, d: { title: string; author: string }) =>
  `${source || ""}|${d.title.trim().toLowerCase()}|${d.author.trim().toLowerCase()}`;
const keyOf = (s: BulkSong) => keyOfDraft(s.source, s.draft);
const bgLabel = (bgId?: string) => (!bgId ? "Default" : sampleBackground(bgId)?.name || (bgId.startsWith("vid-") ? "Video" : "Larawan"));
const isDesktop = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(min-width: 1024px)").matches;
const smallBtn = "tap-target text-xs px-2 py-1 rounded-md border border-line text-fg-muted hover:bg-surface-3 inline-flex items-center gap-1";

export const BulkAddModal: React.FC<BulkAddModalProps> = ({ mode, initialSongs, note, currentSongs, onSave, onClose }) => {
  const [text, setText] = useState("");
  const deferredText = useDeferredValue(text);
  const [reviewSongs, setReviewSongs] = useState<BulkSong[]>(initialSongs || []);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  /** Background chosen per song (key = source|title|author). */
  const [bgByKey, setBgByKey] = useState<Record<string, SongBgValue>>({});
  const [sel, setSel] = useState(0);
  const [pickedSlide, setPickedSlide] = useState(0);
  const [openRow, setOpenRow] = useState<number | null>(null); // phone: row with its preview open
  const [editing, setEditing] = useState<number | null>(null);
  const [bgAllOpen, setBgAllOpen] = useState(false);
  const [bgAllValue, setBgAllValue] = useState<SongBgValue>({});
  const [notice, setNotice] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(
    () => (mode === "paste" ? parseBulkText(deferredText) : { songs: reviewSongs, error: undefined }),
    [mode, deferredText, reviewSongs],
  );
  const songs = parsed.songs;
  const statuses = useMemo<(UpsertStatus | "error")[]>(() => {
    const plan = planUpsert(currentSongs, songs.map((s) => s.draft));
    return songs.map((s, i) => (s.error ? "error" : plan[i]));
  }, [songs, currentSongs]);

  const bgOf = (s: BulkSong): SongBgValue => bgByKey[keyOf(s)] || { bgId: s.draft.bgId, bgSettings: s.draft.bgSettings };
  const draftWithBg = (s: BulkSong): SongDraft => {
    const bg = bgOf(s);
    return { ...s.draft, bgId: bg.bgId, bgSettings: bg.bgId ? bg.bgSettings : undefined };
  };
  const canSaveAt = (i: number) => statuses[i] === "new" || statuses[i] === "update";
  const isChecked = (i: number) => canSaveAt(i) && !excluded.has(keyOf(songs[i]));
  const selected = songs.filter((_, i) => isChecked(i));
  const count = (st: UpsertStatus | "error") => statuses.filter((x) => x === st).length;
  const errors = count("error") + count("invalid") + count("full");
  const dirty = mode === "paste" && text.trim().length > 0;
  const selIdx = songs.length ? Math.min(sel, songs.length - 1) : -1;
  const selSong = selIdx >= 0 ? songs[selIdx] : null;
  const selSlides = useMemo(() => (selSong ? parseLyricsWithRanges(selSong.draft.lyrics) : []), [selSong]);

  // Esc closes only when nothing was typed and no inner dialog (editor / background) is open.
  const escRef = useRef({ dirty, inner: false });
  escRef.current = { dirty, inner: editing !== null || bgAllOpen };
  useEffect(() => {
    if (mode === "paste") textRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (escRef.current.inner) {
        if (bgAllOpenRef.current) setBgAllOpen(false); // the editor closes itself
        return;
      }
      if (!escRef.current.dirty) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bgAllOpenRef = useRef(bgAllOpen);
  bgAllOpenRef.current = bgAllOpen;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const toggle = (s: BulkSong) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      const k = keyOf(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const setAll = (on: boolean) => setExcluded(on ? new Set() : new Set(songs.map(keyOf)));

  const selectSong = (i: number) => {
    if (i !== sel) setPickedSlide(0);
    setSel(i);
  };

  /** Paste mode: clicking a slide selects its lines in the big text box (desktop only). */
  const pickSlide = (i: number) => {
    setPickedSlide(i);
    const ta = textRef.current;
    const r = selSlides[i];
    if (mode !== "paste" || !ta || !r || !selSong || (selSong.lyricsStart ?? -1) < 0 || text !== deferredText || !isDesktop()) return;
    const start = selSong.lyricsStart! + r.start;
    const end = selSong.lyricsStart! + r.end;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(start, end);
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const line = text.slice(0, start).split("\n").length - 1;
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 3);
  };

  /** Paste mode: the cursor in the text box decides which song + slide the preview shows. */
  const syncFromCaret = () => {
    const ta = textRef.current;
    if (!ta || text !== deferredText || songs.length === 0) return;
    const pos = ta.selectionStart;
    const line = text.slice(0, pos).split("\n").length;
    let i = songs.findIndex((s) => line <= (s.endLine ?? s.line));
    if (i < 0) i = songs.length - 1;
    const s = songs[i];
    let slide = 0;
    if ((s.lyricsStart ?? -1) >= 0 && pos >= s.lyricsStart!) {
      const rel = pos - s.lyricsStart!;
      const ranges = parseLyricsWithRanges(s.draft.lyrics);
      const k = ranges.findIndex((r) => rel <= r.end);
      slide = k < 0 ? Math.max(0, ranges.length - 1) : k;
    }
    if (i !== sel) setSel(i);
    if (slide !== pickedSlide) setPickedSlide(slide);
  };

  /** Edit one song in the full Song editor. */
  const handleEdited = (index: number, d: SongDraft) => {
    const old = songs[index];
    if (!old) return setEditing(null);
    const bg: SongBgValue = { bgId: d.bgId, bgSettings: d.bgId ? d.bgSettings : undefined };
    const plain: SongDraft = { ...d, bgId: undefined, bgSettings: undefined };
    if (mode === "paste") {
      // Locate the song again in the CURRENT text (the preview may lag behind typing).
      const fresh = parseBulkText(text).songs[index];
      if (!fresh || fresh.line !== old.line) {
        setNotice("Nagbago ang text habang nag-e-edit — hindi napalitan. Subukan ulit.");
        return setEditing(null);
      }
      setText(replaceSongInText(text, fresh, plain));
    } else {
      setReviewSongs((list) => list.map((s, i) => (i === index ? { ...s, draft: plain, ...validateDraft(plain) } : s)));
    }
    const oldKey = keyOf(old);
    const newKey = keyOfDraft(old.source, plain);
    setBgByKey((m) => {
      const next = { ...m };
      delete next[oldKey];
      next[newKey] = bg;
      return next;
    });
    setExcluded((prev) => {
      const next = new Set(prev);
      next.delete(oldKey);
      next.delete(newKey);
      return next;
    });
    setNotice(`Na-update ang "${plain.title}" sa listahan (hindi pa naka-save sa My Songs).`);
    setEditing(null);
  };

  const applyBgToChecked = () => {
    setBgByKey((m) => {
      const next = { ...m };
      for (const s of selected) next[keyOf(s)] = bgAllValue.bgId ? bgAllValue : {};
      return next;
    });
    setNotice(`Background "${bgLabel(bgAllValue.bgId)}" para sa ${selected.length} kanta.`);
    setBgAllOpen(false);
  };

  const handleSave = () => {
    if (selected.length === 0) return;
    onSave(selected.map(draftWithBg));
  };

  const updatesSelected = songs.filter((_, i) => isChecked(i) && statuses[i] === "update").length;
  const selBg = selSong ? bgOf(selSong) : {};

  const previewHeader = (s: BulkSong, i: number) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-fg truncate">{s.draft.title || <em className="text-fg-subtle">(walang title)</em>}</div>
        <div className="text-xs text-fg-subtle truncate">
          {s.slideCount} slide{s.slideCount === 1 ? "" : "s"} · Background: {bgLabel(bgOf(s).bgId)}
        </div>
      </div>
      <button type="button" onClick={() => setEditing(i)} className="btn btn-secondary btn-sm tap-target" data-testid="bulk-edit-selected">
        <Pencil className="h-3.5 w-3.5" /> Edit / Background
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === "paste" ? "Bulk Add songs" : "Import folder"}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={() => !dirty && onClose()} />
      <div className="relative bg-surface w-full sm:w-[97vw] sm:max-w-[1600px] h-[94dvh] sm:h-[92vh] flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg flex items-center gap-2">
            {mode === "paste" ? <ListPlus className="w-5 h-5 text-accent-text" /> : <FolderOpen className="w-5 h-5 text-accent-text" />}
            {mode === "paste" ? "Bulk Add (maraming kanta)" : "Import folder"}
          </h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: [text box] | list | big preview (desktop) */}
        <div
          className={`flex-1 min-h-0 grid grid-cols-1 gap-4 p-4 overflow-y-auto lg:overflow-hidden ${
            mode === "paste" ? "lg:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
          }`}
        >
          {mode === "paste" && (
            <div className="flex flex-col lg:min-h-0 gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-fg">I-paste ang mga kanta</span>
                <button type="button" onClick={() => setText((t) => (t.trim() ? t : EXAMPLE))} disabled={!!text.trim()} className={`${smallBtn} disabled:opacity-40`}>
                  Lagyan ng halimbawa
                </button>
              </div>
              <textarea
                ref={textRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onSelect={syncFromCaret}
                spellCheck={false}
                className="flex-1 min-h-[16rem] w-full bg-canvas text-fg placeholder:text-fg-subtle px-3 py-2 rounded-lg border border-line font-mono text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                placeholder={"Title ng kanta\nAuthor: (optional)\nKey: (optional)\n\nVerse 1\nUnang linya...\n\nChorus\nLinya ng chorus...\n---\nSusunod na kanta\n..."}
                data-testid="bulk-text"
              />
              <div className="text-xs text-fg-subtle bg-surface-2 border border-line rounded-md px-2.5 py-2 space-y-0.5">
                <p><strong className="text-fg">Unang linya</strong> = title (o "Title: ..."). Optional sa ilalim: <code>Author:</code> <code>Key:</code> <code>CCLI:</code> <code>Copyright:</code></p>
                <p><strong className="text-fg">Blank line</strong> = bagong slide. "Verse 1", "Chorus", "[Bridge]" = label.</p>
                <p><strong className="text-fg">---</strong> sa sariling linya = susunod na kanta.</p>
              </div>
            </div>
          )}

          {/* List */}
          <div className="flex flex-col lg:min-h-0 gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg" data-testid="bulk-summary">
                Preview: {songs.length} kanta
                {songs.length > 0 && (
                  <span className="font-normal text-fg-subtle">
                    {" "}· {count("new")} bago · {count("update")} ia-update{errors ? ` · ${errors} may error` : ""}
                  </span>
                )}
              </span>
              {songs.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => setAll(true)} className={smallBtn}>Piliin lahat</button>
                  <button type="button" onClick={() => setAll(false)} className={smallBtn}>Alisin lahat</button>
                  <button type="button" onClick={() => { setBgAllValue({}); setBgAllOpen(true); }} disabled={selected.length === 0} className={`${smallBtn} disabled:opacity-40`} data-testid="bulk-bg-all">
                    <ImageIcon className="h-3.5 w-3.5" /> Background (lahat ng napili)
                  </button>
                </span>
              )}
            </div>
            {note && <p className="text-xs text-fg-subtle flex gap-1.5"><Info className="w-4 h-4 shrink-0" />{note}</p>}
            {parsed.error && <p className="text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5">{parsed.error}</p>}
            {notice && <p role="status" className="notice-ok text-xs">{notice}</p>}

            <div className="flex-1 min-h-[12rem] overflow-y-auto space-y-1.5 bg-surface-2 border border-line rounded-lg p-2" data-testid="bulk-list">
              {songs.length === 0 && (
                <p className="text-xs text-fg-subtle p-2">{mode === "paste" ? "Lalabas dito ang mga kanta habang nagpe-paste." : "Walang nabasang kanta sa folder."}</p>
              )}
              {songs.map((s, i) => {
                const st = statuses[i];
                const badge = STATUS_BADGE[st];
                const bg = bgOf(s);
                const active = i === selIdx;
                return (
                  <div key={`${i}|${keyOf(s)}`} className={`bg-surface border rounded-md ${active ? "border-accent" : "border-line"}`} data-testid="bulk-row">
                    <div className="flex items-start gap-2 p-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 w-5 h-5 lg:w-4 lg:h-4 shrink-0 accent-accent"
                        checked={isChecked(i)}
                        disabled={!canSaveAt(i)}
                        onChange={() => toggle(s)}
                        aria-label={`Isama ang ${s.draft.title || `kanta sa linya ${s.line}`}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          selectSong(i);
                          setOpenRow((r) => (r === i ? null : i));
                        }}
                        className="flex-1 min-w-0 text-left"
                        aria-pressed={active}
                        data-testid="bulk-row-select"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-sm text-fg truncate">{s.draft.title || <em className="text-fg-subtle">(walang title)</em>}</span>
                          <span className={`shrink-0 px-1.5 rounded border text-xs font-medium ${badge.cls}`}>{badge.text}</span>
                          {bg.bgId && <ImageIcon className="h-3.5 w-3.5 shrink-0 text-accent-text" aria-label={`May background: ${bgLabel(bg.bgId)}`} />}
                        </div>
                        <div className="text-xs text-fg-subtle truncate">
                          {s.slideCount} slide{s.slideCount === 1 ? "" : "s"}
                          {s.draft.author ? ` · ${s.draft.author}` : ""}
                          {s.draft.key ? ` · Key ${s.draft.key}` : ""}
                          {s.draft.ccli ? ` · CCLI ${s.draft.ccli}` : ""}
                          {s.source ? ` · ${s.source}` : ` · linya ${s.line}`}
                        </div>
                        {(s.error || st === "invalid" || st === "full") && (
                          <div className="text-xs text-live-text flex gap-1 mt-0.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                            {s.error || (st === "full" ? "Puno na ang My Songs." : "Hindi ma-save (kulang ang title o lyrics).")}
                          </div>
                        )}
                        {st === "update" && !s.error && <div className="text-xs text-warn-text mt-0.5">May kaparehong kanta na: papalitan ang lyrics nito.</div>}
                      </button>
                      <button type="button" onClick={() => setEditing(i)} className="p-2 lg:p-1 rounded-md text-fg-subtle hover:text-fg hover:bg-surface-3 shrink-0" title="Edit (lyrics, background)" aria-label={`Edit ${s.draft.title || `kanta sa linya ${s.line}`}`} data-testid="bulk-row-edit">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                    {/* phone: preview inside the row */}
                    {openRow === i && active && s.slideCount > 0 && (
                      <div className="lg:hidden px-2 pb-2">
                        <SongPreview slides={selSlides} picked={pickedSlide} onPick={setPickedSlide} bgId={bg.bgId} bgSettings={bg.bgSettings} layout="strip" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Big preview (desktop) */}
          <div className="hidden lg:flex flex-col min-h-0 gap-2" data-testid="bulk-preview">
            {selSong ? (
              <>
                {previewHeader(selSong, selIdx)}
                <SongPreview slides={selSlides} picked={pickedSlide} onPick={pickSlide} bgId={selBg.bgId} bgSettings={selBg.bgSettings} emptyText="Walang lyrics ang kantang ito." />
              </>
            ) : (
              <div className="aspect-video grid place-items-center rounded-lg border border-dashed border-line-strong bg-surface-2 text-xs text-fg-subtle">
                Pumili ng kanta sa listahan para makita ang slides.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-line">
          {updatesSelected > 0 && <span className="text-xs text-warn-text mr-auto">{updatesSelected} kanta ang papalitan ang lyrics.</span>}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-fg border border-line hover:bg-surface-3">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={selected.length === 0} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-50 flex items-center gap-1.5" data-testid="bulk-save">
            <Save className="w-4 h-4" />
            Save {selected.length} kanta
          </button>
        </div>
      </div>

      {/* Background for all checked songs */}
      {bgAllOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Background ng mga napiling kanta">
          <div className="absolute inset-0 bg-black/60" onClick={() => setBgAllOpen(false)} />
          <div className="relative bg-surface w-full sm:max-w-2xl max-h-[90dvh] flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <h4 className="text-sm font-bold text-fg">Background para sa {selected.length} napiling kanta</h4>
              <button type="button" onClick={() => setBgAllOpen(false)} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selSong && (
                <SongPreview slides={selSlides} picked={pickedSlide} onPick={setPickedSlide} bgId={bgAllValue.bgId} bgSettings={bgAllValue.bgSettings} thumbs={false} />
              )}
              <BackgroundPicker value={bgAllValue} onChange={setBgAllValue} />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-line">
              <button type="button" onClick={() => setBgAllOpen(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-fg border border-line hover:bg-surface-3">
                Cancel
              </button>
              <button type="button" onClick={applyBgToChecked} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white flex items-center gap-1.5" data-testid="bulk-bg-apply">
                <Check className="w-4 h-4" /> Ilapat sa {selected.length} kanta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit one song */}
      {editing !== null && songs[editing] && (
        <SongEditorModal mode="bulk" initial={draftWithBg(songs[editing])} onSave={(d) => handleEdited(editing, d)} onClose={() => setEditing(null)} />
      )}
    </div>
  );
};
