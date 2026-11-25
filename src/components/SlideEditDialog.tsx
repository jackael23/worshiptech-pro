/**
 * 2026-11-25 (Jarvis): edit ONE slide from the Slides panel (✏️ on a slide, or F2).
 * Enter = new line; a blank line (Enter twice) = a new slide. "Hatiin dito" splits at the cursor,
 * "Hatiin sa 2" in the middle. Ctrl+Enter = Save, Esc = Cancel. See lib/slideEdit.ts.
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Scissors, SplitSquareVertical, X } from "lucide-react";
import { canSplit, cleanBlock, countPieces, splitAt, splitInHalf } from "../lib/slideEdit";

interface Props {
  /** e.g. "Slide 3 · Chorus" */
  title: string;
  initial: string;
  /** song = saved on the My Song (all copies follow); item = this schedule item only */
  savesTo: "song" | "item";
  hasChords?: boolean;
  onSave: (block: string) => void;
  onClose: () => void;
}

export const SlideEditDialog: React.FC<Props> = ({ title, initial, savesTo, hasChords, onSave, onClose }) => {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  const pieces = countPieces(text);
  const changed = cleanBlock(text) !== cleanBlock(initial);
  const save = () => pieces > 0 && (changed ? onSave(text) : onClose());
  const hereSplit = () => {
    const t = ref.current;
    const next = splitAt(text, t ? t.selectionStart : text.length);
    setText(next);
    requestAnimationFrame(() => ref.current?.focus());
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Edit slide — ${title}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className="relative flex w-full flex-col rounded-t-xl border border-line bg-surface shadow-lg sm:w-[92vw] sm:max-w-xl sm:rounded-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        }}
        data-testid="slide-edit"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="truncate text-base font-bold text-fg">Edit slide · {title}</h3>
          <button type="button" onClick={onClose} className="-mr-2 rounded-lg p-2 text-fg-subtle hover:bg-surface-3" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-2 p-4">
          <p className="text-xs text-fg-subtle">
            <b className="text-fg-muted">Enter</b> = bagong linya · <b className="text-fg-muted">blankong linya</b> (Enter nang 2 beses) = bagong slide.{" "}
            {savesTo === "song" ? "Mase-save sa kanta (My Songs): susunod ang lahat ng kopya at ang Live." : "Para sa schedule item na ito lang."}
            {hasChords ? " May chords: huwag burahin ang [G] para tama pa rin sa Stage screen." : ""}
          </p>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            spellCheck={false}
            aria-label="Text ng slide"
            className="input min-h-48 w-full resize-y py-2 font-mono text-sm leading-relaxed"
            data-testid="slide-edit-text"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={hereSplit} className="btn btn-secondary btn-sm" title="Bagong slide simula sa cursor" data-testid="slide-split-here">
              <Scissors className="h-3.5 w-3.5" /> Hatiin dito
            </button>
            <button type="button" onClick={() => setText(splitInHalf(text))} disabled={!canSplit(text)} className="btn btn-secondary btn-sm" title="Hatiin sa gitna" data-testid="slide-split-half">
              <SplitSquareVertical className="h-3.5 w-3.5" /> Hatiin sa 2
            </button>
            <span className={`ml-auto text-xs ${pieces === 0 ? "text-warn" : "text-fg-muted"}`} role="status" data-testid="slide-edit-count">
              {pieces === 0 ? "Walang text — hindi mase-save" : pieces === 1 ? "1 slide" : `Magiging ${pieces} slides`}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={pieces === 0} className="btn btn-primary" title="Ctrl+Enter" data-testid="slide-edit-save">
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
