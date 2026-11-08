/**
 * 2026-11-07 (Mira): Presentation themes panel (Simulator ▸ Output toolbar ▸ Theme).
 *  One click = text style + background. Apply to "Itong item" or "Lahat ng schedule"
 *  (Lahat also becomes the default for new songs / verses). Custom themes: save the look of the
 *  selected item, rename, delete. "I-undo" brings back the schedule as it was before "Lahat".
 */
import React, { useState } from "react";
import { Check, Loader2, Pencil, Plus, Star, Trash2, Undo2 } from "lucide-react";
import type { ScheduleItem, SlideContent } from "../types";
import { SlideScreen } from "./SlideScreen";
import { useSongBackground } from "../lib/songBackground";
import { BUILT_IN_THEMES, MAX_CUSTOM_THEMES, PresentationTheme, ThemeStore, previewCss } from "../lib/presentationThemes";

export type ThemeScope = "item" | "all";

interface Props {
  store: ThemeStore;
  currentItem?: ScheduleItem;
  itemLabel: string;
  onApply: (theme: PresentationTheme, scope: ThemeScope) => Promise<string | null>;
  onSaveFromItem: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canUndo: boolean;
  onUndo: () => void;
}

const SAMPLE: SlideContent = { label: "Verse 1", text: "Amazing grace! How sweet the sound\nThat saved a wretch like me!" } as SlideContent;

const ThemePreview: React.FC<{ theme: PresentationTheme }> = ({ theme }) => {
  const media = useSongBackground(theme.background.kind === "media" ? theme.background.id : undefined);
  return (
    <SlideScreen
      slide={SAMPLE}
      background={previewCss(theme, media.css)}
      textScale={6}
      textStyle={{ ...theme.textStyle, forceColor: false }}
      bgSettings={theme.bgSettings}
      ariaHidden
    />
  );
};

export const ThemePicker: React.FC<Props> = ({ store, currentItem, itemLabel, onApply, onSaveFromItem, onRename, onDelete, canUndo, onUndo }) => {
  const [scope, setScope] = useState<ThemeScope>("item");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [naming, setNaming] = useState<string | null>(null); // new theme name being typed
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const apply = async (t: PresentationTheme) => {
    if (scope === "item" && !currentItem) {
      setNotice({ kind: "warn", text: "Pumili muna ng item sa Schedule." });
      return;
    }
    setBusy(t.id);
    setNotice(null);
    const err = await onApply(t, scope);
    setBusy(null);
    setNotice(err ? { kind: "warn", text: err } : { kind: "ok", text: scope === "all" ? `"${t.name}" — nasa lahat ng schedule na, at default na rin para sa bagong kanta at verse.` : `"${t.name}" — nasa ${itemLabel || "item"} na.` });
  };

  const card = (t: PresentationTheme) => {
    const isDefault = store.defaultId === t.id;
    return (
      <div key={t.id} className="min-w-0" data-theme-id={t.id}>
        <button
          type="button"
          onClick={() => void apply(t)}
          disabled={!!busy}
          aria-label={`Theme: ${t.name}`}
          className="group relative block w-full overflow-hidden rounded-md border border-line text-left hover:border-accent focus-visible:border-accent disabled:opacity-60"
        >
          <ThemePreview theme={t} />
          {busy === t.id && (
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
            </span>
          )}
          {isDefault && (
            <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-accent px-1 py-0.5 text-[11px] font-semibold text-white">
              <Star className="h-2.5 w-2.5 fill-current" /> Default
            </span>
          )}
        </button>
        {renaming?.id === t.id ? (
          <form
            className="mt-1 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.name.trim()) onRename(t.id, renaming.name);
              setRenaming(null);
            }}
          >
            <input autoFocus value={renaming.name} maxLength={40} onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} className="input h-8 text-xs" aria-label="Bagong pangalan ng theme" />
            <button type="submit" className="btn btn-primary btn-sm btn-icon" aria-label="I-save ang pangalan">
              <Check className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : confirmDel === t.id ? (
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg-muted">Burahin?</span>
            <button type="button" onClick={() => (onDelete(t.id), setConfirmDel(null))} className="btn btn-danger btn-sm">
              Oo
            </button>
            <button type="button" onClick={() => setConfirmDel(null)} className="btn btn-ghost btn-sm">
              Hindi
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate text-xs text-fg">{t.name}</span>
            {!t.builtIn && (
              <>
                <button type="button" onClick={() => setRenaming({ id: t.id, name: t.name })} className="btn btn-ghost btn-sm btn-icon tap-target" aria-label={`Palitan ang pangalan: ${t.name}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setConfirmDel(t.id)} className="btn btn-ghost btn-sm btn-icon tap-target" aria-label={`Burahin: ${t.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="theme-picker">
      <div className="seg grid w-full grid-cols-2" role="tablist" aria-label="Saan i-apply ang theme">
        <button role="tab" aria-selected={scope === "item"} onClick={() => setScope("item")} className="seg-item min-w-0" title={itemLabel}>
          <span className="truncate">Itong item{itemLabel ? `: ${itemLabel}` : ""}</span>
        </button>
        <button role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")} className="seg-item">
          Lahat ng schedule
        </button>
      </div>
      <p className="text-xs text-fg-subtle">
        {scope === "item"
          ? "I-click ang theme: font, kulay at background ng item na ito lang ang papalitan."
          : "I-click ang theme: papalitan ang itsura ng lahat ng item (pati ang may sariling style), at magiging default ito ng bagong kanta at verse. Hindi ginagalaw ang sariling background ng PowerPoint slides."}
      </p>

      {notice && (
        <div className={`${notice.kind === "ok" ? "notice-ok" : "notice-warn"} flex items-center justify-between gap-2`} role="status">
          <span>{notice.text}</span>
          {notice.kind === "ok" && canUndo && (
            <button type="button" onClick={() => (onUndo(), setNotice({ kind: "ok", text: "Naibalik ang dating itsura." }))} className="btn btn-secondary btn-sm shrink-0">
              <Undo2 className="h-3.5 w-3.5" />
              I-undo
            </button>
          )}
        </div>
      )}

      <div>
        <div className="eyebrow mb-1.5">Kasama sa app</div>
        <div className="grid grid-cols-2 gap-2 @[30rem]/out:grid-cols-3">{BUILT_IN_THEMES.map(card)}</div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="eyebrow">
            Aking themes <span className="font-mono font-normal normal-case tracking-normal">{store.custom.length}</span>
          </div>
          {naming === null && (
            <button
              type="button"
              onClick={() => setNaming(itemLabel ? `${itemLabel} look` : "Aking theme")}
              disabled={!currentItem || store.custom.length >= MAX_CUSTOM_THEMES}
              className="btn btn-secondary btn-sm tap-target"
              title={store.custom.length >= MAX_CUSTOM_THEMES ? `Max ${MAX_CUSTOM_THEMES} — magbura muna` : "I-save ang font, kulay at background ng napiling item"}
            >
              <Plus className="h-3.5 w-3.5" />
              I-save ang itsura ng item
            </button>
          )}
        </div>
        {naming !== null && (
          <form
            className="mb-2 flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              onSaveFromItem(naming);
              setNaming(null);
              setNotice({ kind: "ok", text: "Na-save ang theme." });
            }}
          >
            <input autoFocus value={naming} maxLength={40} onChange={(e) => setNaming(e.target.value)} className="input h-9" aria-label="Pangalan ng bagong theme" placeholder="Pangalan ng theme" />
            <button type="submit" className="btn btn-primary h-9" disabled={!naming.trim()}>
              I-save
            </button>
            <button type="button" onClick={() => setNaming(null)} className="btn btn-ghost h-9">
              Cancel
            </button>
          </form>
        )}
        {store.custom.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-3 text-xs text-fg-subtle">
            Wala pa. Ayusin ang Text style at background ng isang item, tapos pindutin ang <strong>I-save ang itsura ng item</strong>.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 @[30rem]/out:grid-cols-3">{store.custom.map(card)}</div>
        )}
      </div>
    </div>
  );
};
