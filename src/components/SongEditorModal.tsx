/**
 * 2026-10-20 (Jarvis): add / edit a "My Songs" entry. Lyrics are pasted by the user
 * and split into slides with parseLyrics (live preview below the textarea).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Save, Info } from "lucide-react";
import { parseLyrics } from "../lib/lyricsParser";
import { MY_SONGS_LIMITS, SongDraft } from "../lib/mySongsStore";

interface SongEditorModalProps {
  mode: "new" | "edit";
  initial?: Partial<SongDraft>;
  onSave: (draft: SongDraft) => void;
  onClose: () => void;
}

const inputCls =
  "w-full bg-canvas text-fg placeholder:text-fg-subtle px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export const SongEditorModal: React.FC<SongEditorModalProps> = ({ mode, initial, onSave, onClose }) => {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [songKey, setSongKey] = useState(initial?.key ?? "");
  const [ccli, setCcli] = useState(initial?.ccli ?? "");
  const [copyright, setCopyright] = useState(initial?.copyright ?? "");
  const [lyrics, setLyrics] = useState(initial?.lyrics ?? "");
  const [touched, setTouched] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  const slides = useMemo(() => parseLyrics(lyrics), [lyrics]);
  const titleError = !title.trim() ? "Kailangan ang title." : "";
  const lyricsError = slides.length === 0 ? "Mag-paste ng lyrics (blank line = bagong slide)." : "";
  const canSave = !titleError && !lyricsError;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSave) return;
    onSave({ title: title.trim(), author: author.trim(), key: songKey.trim(), ccli: ccli.trim(), copyright: copyright.trim(), lyrics });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={mode === "new" ? "New song" : "Edit song"}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-surface w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg">{mode === "new" ? "New Song (My Songs)" : "Edit Song"}</h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-fg">Title *</span>
              <input ref={firstFieldRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MY_SONGS_LIMITS.MAX_TITLE} className={inputCls} placeholder="hal. What a Beautiful Name" />
              {touched && titleError && <span className="text-xs text-live-text">{titleError}</span>}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block col-span-2">
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
              <label className="block col-span-2">
                <span className="text-xs font-semibold text-fg">Copyright</span>
                <input value={copyright} onChange={(e) => setCopyright(e.target.value)} maxLength={300} className={inputCls} placeholder="hal. © 2016 Hillsong Music Publishing" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-fg">Lyrics *</span>
              <textarea
                ref={lyricsRef}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                maxLength={MY_SONGS_LIMITS.MAX_LYRICS}
                rows={12}
                className={`${inputCls} font-mono text-xs leading-relaxed resize-y`}
                placeholder={"Verse 1\nUnang linya...\nIkalawang linya...\n\nChorus\nLinya ng chorus...\n\n(blank line = bagong slide)"}
              />
              <span className="flex justify-between text-xs text-fg-subtle">
                <span>{touched && lyricsError ? <span className="text-live-text">{lyricsError}</span> : "Blank line = bagong slide. \"Verse 1\", \"Chorus\", \"[Bridge]\" = label."}</span>
                <span>{lyrics.length}/{MY_SONGS_LIMITS.MAX_LYRICS}</span>
              </span>
            </label>
          </div>

          {/* Slide preview */}
          <div className="flex flex-col min-h-0">
            <span className="text-xs font-semibold text-fg mb-1">Preview: {slides.length} slide{slides.length === 1 ? "" : "s"}</span>
            <div className="flex-1 overflow-y-auto space-y-2 bg-surface-2 border border-line rounded-lg p-2 min-h-[8rem] max-h-[50vh]">
              {slides.length === 0 && <p className="text-xs text-fg-subtle p-2">Lalabas dito ang slides habang nagta-type.</p>}
              {slides.map((s, i) => (
                <div key={i} className="bg-surface-2 border border-line rounded-md p-2">
                  <div className="text-xs font-bold text-accent-text">{s.label}</div>
                  <p className="text-xs text-fg-muted whitespace-pre-line line-clamp-4">{s.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-warn-text bg-warn-soft border border-warn/30 rounded-md px-2 py-1.5 flex gap-1.5">
              <Info className="w-4 h-4 shrink-0" />
              <span>Naka-save lang sa browser na ito at hindi ipinapadala kahit saan. Gamitin lang ang lyrics kung may CCLI license ang simbahan ninyo.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-fg border border-line hover:bg-surface-3">
            Cancel
          </button>
          <button type="submit" disabled={touched && !canSave} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white disabled:opacity-50 flex items-center gap-1.5">
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </form>
    </div>
  );
};
