/**
 * 2026-10-20 (Jarvis): add / edit a "My Songs" entry. Lyrics are pasted by the user
 * and split into slides with parseLyrics (live preview below the textarea).
 * 2026-11-06: bigger dialog (almost full screen on desktop) + real 16:9 slide preview
 *   (big selected slide + clickable thumbnails), so whoever adds the song sees how it will look.
 * 2026-11-06 (b): preview uses the projector's text size + Text style; clicking a slide selects its
 *   lines in the lyrics box (and moving the cursor in the box shows that slide); "Background" tab =
 *   the song's own picture / video / built-in background; mode "bulk" = edit one song of Bulk Add.
 * 2026-11-07: `scheduleEdit` = opened from a song in the Schedule. Save updates the My Song (and with it
 *   every copy in the schedule + the live screen), or — "Para sa schedule na ito lang" — only that item.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, Info, Image as ImageIcon, Rows3 } from "lucide-react";
import { parseLyricsWithRanges } from "../lib/lyricsParser";
import { MY_SONGS_LIMITS, SongDraft } from "../lib/mySongsStore";
import { sampleBackground } from "../lib/songBackground";
import { SongPreview } from "./SongPreview";
import { BackgroundPicker, SongBgValue } from "./BackgroundPicker";

interface SongEditorModalProps {
  /** "bulk" = editing one song of the Bulk Add / Import folder preview (not saved to My Songs yet). */
  mode: "new" | "edit" | "bulk";
  initial?: Partial<SongDraft>;
  onSave: (draft: SongDraft, opts?: { scheduleOnly: boolean }) => void;
  onClose: () => void;
  /**
   * 2026-11-07: editing a song from the Schedule. linked = the item follows a My Song (that song can be
   * updated); not linked (sample hymn, or an item already changed for this schedule only) = this item only.
   */
  scheduleEdit?: { linked: boolean };
}

const inputCls =
  "w-full bg-canvas text-fg placeholder:text-fg-subtle px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

const HEADINGS = { new: "New Song (My Songs)", edit: "Edit Song", bulk: "I-edit bago i-save (Bulk Add)" };

export const SongEditorModal: React.FC<SongEditorModalProps> = ({ mode, initial, onSave, onClose, scheduleEdit }) => {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [songKey, setSongKey] = useState(initial?.key ?? "");
  const [ccli, setCcli] = useState(initial?.ccli ?? "");
  const [copyright, setCopyright] = useState(initial?.copyright ?? "");
  const [lyrics, setLyrics] = useState(initial?.lyrics ?? "");
  const [bg, setBg] = useState<SongBgValue>({ bgId: initial?.bgId, bgSettings: initial?.bgSettings });
  const [tab, setTab] = useState<"slides" | "background">("slides");
  const [touched, setTouched] = useState(false);
  const [scheduleOnly, setScheduleOnly] = useState(!!scheduleEdit && !scheduleEdit.linked);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  const slides = useMemo(() => parseLyricsWithRanges(lyrics), [lyrics]);
  const [picked, setPicked] = useState(0);
  const titleError = !title.trim() ? "Kailangan ang title." : "";
  const lyricsError = slides.length === 0 ? "Mag-paste ng lyrics (blank line = bagong slide)." : "";
  const canSave = !titleError && !lyricsError;
  const bgName = !bg.bgId ? "Default" : sampleBackground(bg.bgId)?.name || (bg.bgId.startsWith("vid-") ? "Video" : "Larawan");

  useEffect(() => {
    // Prefilled title (from a reference song) → jump straight to the lyrics box.
    (initial?.title ? lyricsRef.current : firstFieldRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Cursor / selection moved in the lyrics box → show that slide on the big preview. */
  const syncPickedFromCaret = () => {
    const ta = lyricsRef.current;
    if (!ta || slides.length === 0) return;
    const pos = ta.selectionStart;
    let i = slides.findIndex((s) => pos <= s.end);
    if (i < 0) i = slides.length - 1;
    if (i !== picked) setPicked(i);
  };

  /** Thumbnail clicked → big preview + select that slide's lines in the lyrics box (desktop). */
  const pickSlide = (i: number) => {
    setPicked(i);
    const ta = lyricsRef.current;
    const s = slides[i];
    if (!ta || !s) return;
    // On phones, focusing the box would open the keyboard and hide the preview — only on desktop.
    if (typeof window !== "undefined" && window.matchMedia && !window.matchMedia("(min-width: 1024px)").matches) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(s.start, s.end);
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
    const line = lyrics.slice(0, s.start).split("\n").length - 1;
    ta.scrollTop = Math.max(0, line * lineHeight - ta.clientHeight / 3);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSave) return;
    const draft: SongDraft = {
      title: title.trim(),
      author: author.trim(),
      key: songKey.trim(),
      ccli: ccli.trim(),
      copyright: copyright.trim(),
      lyrics,
      bgId: bg.bgId,
      bgSettings: bg.bgId ? bg.bgSettings : undefined,
    };
    if (scheduleEdit) onSave(draft, { scheduleOnly });
    else onSave(draft);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === "new" ? "New song" : "Edit song"}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-surface w-full sm:w-[96vw] sm:max-w-[1400px] h-[94dvh] sm:h-[92vh] flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg">{scheduleEdit ? "Edit lyrics (Schedule)" : HEADINGS[mode]}</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — wide two-column layout; each column scrolls on its own on desktop */}
        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-4">
          <div className="flex flex-col gap-3 lg:min-h-0">
            <label className="block">
              <span className="text-xs font-semibold text-fg">Title *</span>
              <input ref={firstFieldRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MY_SONGS_LIMITS.MAX_TITLE} className={inputCls} placeholder="hal. What a Beautiful Name" />
              {touched && titleError && <span className="text-xs text-live-text">{titleError}</span>}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_6rem_8rem] gap-2">
              <label className="block col-span-2 sm:col-span-1">
                <span className="text-xs font-semibold text-fg">Author / Artist</span>
                <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={MY_SONGS_LIMITS.MAX_FIELD} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-fg">Key</span>
                <input value={songKey} onChange={(e) => setSongKey(e.target.value)} maxLength={8} className={inputCls} placeholder="hal. D" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-fg">CCLI #</span>
                <input value={ccli} onChange={(e) => setCcli(e.target.value)} maxLength={MY_SONGS_LIMITS.MAX_FIELD} className={inputCls} inputMode="numeric" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-fg">Copyright</span>
              <input value={copyright} onChange={(e) => setCopyright(e.target.value)} maxLength={300} className={inputCls} placeholder="hal. © 2016 Hillsong Music Publishing" />
            </label>
            <label className="flex flex-col flex-1 lg:min-h-0">
              <span className="text-xs font-semibold text-fg">Lyrics *</span>
              <textarea
                ref={lyricsRef}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                onSelect={syncPickedFromCaret}
                maxLength={MY_SONGS_LIMITS.MAX_LYRICS}
                spellCheck={false}
                className={`${inputCls} flex-1 min-h-[18rem] font-mono text-sm leading-relaxed resize-none`}
                placeholder={"Verse 1\nUnang linya...\nIkalawang linya...\n\nChorus\nLinya ng chorus...\n\n(blank line = bagong slide)"}
                data-testid="lyrics-input"
              />
              <span className="flex justify-between gap-2 text-xs text-fg-subtle mt-0.5">
                <span>{touched && lyricsError ? <span className="text-live-text">{lyricsError}</span> : "Blank line = bagong slide. \"Verse 1\", \"Chorus\", \"[Bridge]\" = label. I-click ang slide sa kanan para piliin ang mga linya nito."}</span>
                <span className="shrink-0">{lyrics.length}/{MY_SONGS_LIMITS.MAX_LYRICS}</span>
              </span>
            </label>
          </div>

          {/* Preview: big slide (projector size) + Slides / Background tabs */}
          <div className="flex flex-col lg:min-h-0 gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-fg">
                Preview: {slides.length} slide{slides.length === 1 ? "" : "s"}
                {slides.length > 0 && (
                  <span className="font-normal text-fg-subtle">
                    {" "}· {Math.min(picked, slides.length - 1) + 1}/{slides.length} {slides[Math.min(picked, slides.length - 1)].label}
                  </span>
                )}
              </span>
              {/* 2026-11-07: from the Schedule = lyrics only (the item's background is set in the Media tab) */}
              {!scheduleEdit && (
              <div className="seg grid grid-cols-2" role="group" aria-label="Preview">
                <button type="button" onClick={() => setTab("slides")} aria-pressed={tab === "slides"} className="seg-item tap-target">
                  <Rows3 className="h-3.5 w-3.5" /> Slides
                </button>
                <button type="button" onClick={() => setTab("background")} aria-pressed={tab === "background"} className="seg-item tap-target" data-testid="tab-background">
                  <ImageIcon className="h-3.5 w-3.5" /> Background: {bgName}
                </button>
              </div>
              )}
            </div>
            {tab === "slides" ? (
              <SongPreview slides={slides} picked={picked} onPick={pickSlide} bgId={bg.bgId} bgSettings={bg.bgSettings} />
            ) : (
              <div className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
                {/* smaller screen here, so the background choices below have room */}
                <div className="mx-auto w-full lg:max-w-[calc(30vh*16/9)] shrink-0">
                  <SongPreview slides={slides} picked={picked} onPick={setPicked} bgId={bg.bgId} bgSettings={bg.bgSettings} thumbs={false} emptyText="Ganito ang background. Mag-type ng lyrics para makita ang text." />
                </div>
                <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                  <BackgroundPicker value={bg} onChange={setBg} />
                </div>
              </div>
            )}
            <p className="text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5 flex gap-1.5 shrink-0">
              <Info className="w-4 h-4 shrink-0" />
              <span>Naka-save sa browser na ito (at sa sarili mong CouchDB kapag naka-on ang sync); hindi ipinapadala sa AI o sa ibang server. Gamitin lang ang lyrics kung may CCLI license ang simbahan ninyo.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-line">
          {scheduleEdit && (
            <label className="mr-auto flex min-h-11 items-center gap-2 text-sm text-fg" title={scheduleEdit.linked ? undefined : "Sample hymn o kopyang binago na para sa schedule na ito"}>
              <input
                type="checkbox"
                checked={scheduleOnly}
                disabled={!scheduleEdit.linked}
                onChange={(e) => setScheduleOnly(e.target.checked)}
                className="h-4 w-4 accent-accent"
                data-testid="schedule-only"
              />
              <span>
                Para sa schedule na ito lang
                <span className="block text-xs text-fg-subtle">
                  {!scheduleEdit.linked
                    ? "Hindi ito naka-link sa My Songs, kaya dito lang magbabago."
                    : scheduleOnly
                      ? "Hindi na susunod ang item na ito sa mga edit ng My Song."
                      : "Mababago ang My Song at lahat ng kopya nito sa schedule (pati ang LIVE)."}
                </span>
              </span>
            </label>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-fg border border-line hover:bg-surface-3">
            Cancel
          </button>
          <button type="submit" disabled={touched && !canSave} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-50 flex items-center gap-1.5" data-testid="editor-save">
            <Save className="w-4 h-4" />
            {mode === "bulk" ? "OK" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
};
