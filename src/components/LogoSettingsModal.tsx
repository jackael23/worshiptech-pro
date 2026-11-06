/**
 * 2026-11-06 (Jarvis): Logo screen settings (Ctrl+L) — the app's default, or the church's own
 * picture / video / built-in background + optional title and subtitle. Preview = the real Live screen.
 * Saved in this browser (lib/logoStore.ts); the picture / video stays in the Media tab.
 */
import React, { useEffect, useMemo, useState } from "react";
import { X, Save, Info } from "lucide-react";
import type { LiveState } from "../types";
import { LOGO_TEXT_MAX, LogoSettings, getLogoSettings, setLogoSettings, withLogo, LogoFrame } from "../lib/logoStore";
import { useSongBackground } from "../lib/songBackground";
import { LiveMainScreen } from "./LiveScreen";
import { BackgroundPicker, SongBgValue } from "./BackgroundPicker";

interface Props {
  /** Current live state — the preview shows it in Logo mode. */
  liveState: LiveState;
  onClose: () => void;
  onSaved?: (ok: boolean) => void;
}

const inputCls =
  "w-full bg-canvas text-fg placeholder:text-fg-subtle px-3 py-2 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export const LogoSettingsModal: React.FC<Props> = ({ liveState, onClose, onSaved }) => {
  const [draft, setDraft] = useState<LogoSettings>(() => ({ ...getLogoSettings() }));
  const bg = useSongBackground(draft.custom ? draft.bgId : undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preview = the real Live screen in Logo mode with this draft (video plays here too).
  const previewState = useMemo(() => {
    const frame: LogoFrame = draft.custom
      ? {
          logoCustom: true,
          logoTitle: draft.title.trim() || undefined,
          logoSubtitle: draft.subtitle.trim() || undefined,
          logoBackground: bg.css || undefined,
          logoVideoId: bg.videoId,
          logoSettings: bg.css ? draft.bgSettings : undefined,
        }
      : {};
    return withLogo({ ...liveState, isLive: true, isLogo: true, isBlackout: false, nurseryAlertActive: false }, frame);
  }, [draft, bg.css, bg.videoId, liveState]);

  const save = () => {
    const ok = setLogoSettings(draft);
    onSaved?.(ok);
    onClose();
  };

  const setBg = (v: SongBgValue) => setDraft((d) => ({ ...d, bgId: v.bgId, bgSettings: v.bgSettings }));

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Logo settings">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-surface w-full sm:w-[96vw] sm:max-w-[1300px] h-[94dvh] sm:h-[88vh] flex flex-col rounded-t-xl sm:rounded-xl shadow-lg border border-line">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h3 className="text-base font-bold text-fg">Logo screen <span className="font-mono text-xs font-normal text-fg-subtle">Ctrl L</span></h3>
          <button type="button" onClick={onClose} className="p-2 -mr-2 rounded-lg text-fg-subtle hover:bg-surface-3" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-4">
          {/* preview */}
          <div className="flex flex-col gap-2 lg:min-h-0">
            <span className="text-xs font-semibold text-fg">Preview (ganito sa projector kapag naka-Logo)</span>
            <div className="rounded-lg border border-line overflow-hidden" data-testid="logo-preview">
              <LiveMainScreen liveState={previewState} fade={false} />
            </div>
            {draft.custom && bg.missing && (
              <p className="notice-warn text-xs">Wala na sa browser na ito ang napiling larawan/video (na-delete o hindi pa nasi-sync). Hangga't hindi ito naaayos, madilim na screen na may title (o ang default na logo kung walang title) ang lalabas.</p>
            )}
            <p className="text-xs text-fg-subtle flex gap-1.5">
              <Info className="w-4 h-4 shrink-0" />
              Naka-save sa browser na ito (setting ng laptop). Ang larawan/video mismo ay nasa Media tab at nasi-sync sa CouchDB kapag naka-login. Sa phone remote, larawan (poster) lang ng video ang makikita.
            </p>
          </div>

          {/* settings */}
          <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <div className="seg grid grid-cols-2" role="group" aria-label="Uri ng logo">
              <button type="button" onClick={() => setDraft((d) => ({ ...d, custom: false }))} aria-pressed={!draft.custom} className="seg-item tap-target">
                Default ng app
              </button>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, custom: true }))} aria-pressed={draft.custom} className="seg-item tap-target" data-testid="logo-custom">
                Sariling logo
              </button>
            </div>

            {draft.custom ? (
              <>
                <label className="block">
                  <span className="text-xs font-semibold text-fg">Title (optional)</span>
                  <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} maxLength={LOGO_TEXT_MAX} className={inputCls} placeholder="hal. pangalan ng simbahan" data-testid="logo-title" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-fg">Subtitle (optional)</span>
                  <input value={draft.subtitle} onChange={(e) => setDraft((d) => ({ ...d, subtitle: e.target.value }))} maxLength={LOGO_TEXT_MAX} className={inputCls} placeholder="hal. Welcome!" data-testid="logo-subtitle" />
                </label>
                <p className="text-xs text-fg-subtle">Kung larawan na ng logo ang gagamitin, iwanang blangko ang title at subtitle para hindi matakpan.</p>
                <BackgroundPicker value={{ bgId: draft.bgId, bgSettings: draft.bgSettings }} onChange={setBg} />
              </>
            ) : (
              <p className="text-xs text-fg-subtle bg-surface-2 border border-line rounded-md p-3">
                Ang dating logo screen ng app ang lalabas. Piliin ang <strong>Sariling logo</strong> para gumamit ng larawan o video ng simbahan ninyo.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-fg border border-line hover:bg-surface-3">
            Cancel
          </button>
          <button type="button" onClick={save} className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent hover:bg-accent-hover text-white flex items-center gap-1.5" data-testid="logo-save">
            <Save className="w-4 h-4" /> Save
          </button>
        </div>
      </div>
    </div>
  );
};
