/**
 * 2026-10-29 (Jarvis): controls for the slide text style (font, size, bold/italic, color,
 * alignment, outline/shadow). Every change applies right away (Live, projector, phone).
 */
import React, { useEffect, useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, Minus, Plus, RotateCcw, AlertTriangle } from "lucide-react";
import type { TextStyle } from "../types";
import { DEFAULT_TEXT_STYLE, FONT_PRESETS, SCALE_MAX, SCALE_MIN, cleanFontName, isFontAvailable, sanitizeTextStyle } from "../lib/textStyle";

interface Props {
  value: TextStyle;
  onChange: (next: TextStyle) => void;
}

const CUSTOM = "__custom__";

export const TextStyleEditor: React.FC<Props> = ({ value, onChange }) => {
  const set = (patch: Partial<TextStyle>) => onChange(sanitizeTextStyle({ ...value, ...patch }));
  const isPreset = FONT_PRESETS.some((f) => f.name === value.fontFamily);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [customName, setCustomName] = useState(isPreset ? "" : value.fontFamily);
  useEffect(() => {
    // switching between Global / item: show that style's font
    const preset = FONT_PRESETS.some((f) => f.name === value.fontFamily);
    setCustomMode(!preset);
    if (!preset) setCustomName(value.fontFamily);
  }, [value.fontFamily]);

  const fontMissing = !isFontAvailable(value.fontFamily);
  const pct = Math.round(value.scale * 100);
  const stepScale = (d: number) => set({ scale: Math.round((value.scale + d) * 100) / 100 });
  const toggle = (on: boolean) => `btn btn-sm touch-44 lg:min-h-0 lg:min-w-0 ${on ? "bg-accent-soft text-accent-text ring-1 ring-accent/60" : "btn-secondary"}`;
  const applyCustom = () => {
    const clean = cleanFontName(customName);
    if (clean) set({ fontFamily: clean });
  };

  return (
    <div className="space-y-3" data-testid="text-style-editor">
      {/* font */}
      <div>
        <label htmlFor="ts-font" className="eyebrow mb-1 block">
          Font
        </label>
        <select
          id="ts-font"
          value={customMode ? CUSTOM : value.fontFamily}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustomMode(true);
              return;
            }
            setCustomMode(false);
            set({ fontFamily: e.target.value });
          }}
          className="input h-9 w-full text-sm"
        >
          {FONT_PRESETS.map((f) => (
            <option key={f.name} value={f.name} style={{ fontFamily: f.stack }}>
              {f.name}
            </option>
          ))}
          <option value={CUSTOM}>Iba pa (i-type ang pangalan)…</option>
        </select>
        {customMode && (
          <div className="mt-1.5 flex gap-1.5">
            <input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
              onBlur={applyCustom}
              maxLength={60}
              placeholder="hal. Montserrat"
              aria-label="Pangalan ng font"
              className="input h-9 flex-1 text-sm"
            />
            <button onClick={applyCustom} className="btn btn-secondary h-9">
              Gamitin
            </button>
          </div>
        )}
        {fontMissing && (
          <p className="notice-warn mt-1.5 flex items-start gap-1.5 text-xs" role="status">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Mukhang wala ang "{value.fontFamily}" sa PC na ito, kaya default na font ang lalabas. I-install muna ang font, o pumili ng iba.
          </p>
        )}
      </div>

      {/* size */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="ts-size" className="eyebrow">
            Size
          </label>
          <span className="font-mono text-xs tabular-nums text-fg" data-testid="ts-size-value">
            {pct}%
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => stepScale(-0.05)} disabled={value.scale <= SCALE_MIN} className="btn btn-secondary btn-icon touch-44 lg:min-h-0 lg:min-w-0" aria-label="Liitan">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            id="ts-size"
            type="range"
            min={SCALE_MIN * 100}
            max={SCALE_MAX * 100}
            step={5}
            value={pct}
            onChange={(e) => set({ scale: Number(e.target.value) / 100 })}
            className="h-9 flex-1 accent-[var(--c-accent)]"
          />
          <button onClick={() => stepScale(0.05)} disabled={value.scale >= SCALE_MAX} className="btn btn-secondary btn-icon touch-44 lg:min-h-0 lg:min-w-0" aria-label="Laki">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">Auto-fit pa rin: kusang lumiliit kapag hindi kasya sa screen.</p>
      </div>

      {/* bold / italic / outline / shadow */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => set({ bold: !value.bold })} aria-pressed={value.bold} className={toggle(value.bold)} title="Bold">
          <Bold className="h-3.5 w-3.5" /> Bold
        </button>
        <button onClick={() => set({ italic: !value.italic })} aria-pressed={value.italic} className={toggle(value.italic)} title="Italic">
          <Italic className="h-3.5 w-3.5" /> Italic
        </button>
        <button onClick={() => set({ outline: !value.outline })} aria-pressed={value.outline} className={toggle(value.outline)} title="Itim na outline sa paligid ng letra">
          Outline
        </button>
        <button onClick={() => set({ shadow: !value.shadow })} aria-pressed={value.shadow} className={toggle(value.shadow)} title="Anino sa ilalim ng text">
          Shadow
        </button>
      </div>

      {/* color */}
      <div className="flex items-center gap-2">
        <label htmlFor="ts-color" className="eyebrow">
          Kulay
        </label>
        <input
          id="ts-color"
          type="color"
          value={value.color || "#ffffff"}
          onChange={(e) => set({ color: e.target.value })}
          className="h-9 w-12 cursor-pointer rounded border border-line bg-surface p-0.5"
        />
        <button onClick={() => set({ color: null })} aria-pressed={value.color === null} className={toggle(value.color === null)} title="Puti (o kulay ng PowerPoint slide)">
          Auto
        </button>
      </div>

      {/* alignment */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="eyebrow mb-1">Pahalang</div>
          <div className="seg grid grid-cols-3" role="group" aria-label="Horizontal alignment">
            {(
              [
                ["left", AlignLeft, "Kaliwa"],
                ["center", AlignCenter, "Gitna"],
                ["right", AlignRight, "Kanan"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button key={id} onClick={() => set({ align: id })} aria-pressed={value.align === id} aria-label={label} title={label} className="seg-item h-8 touch-44 lg:min-h-0">
                <Icon className="mx-auto h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1">Patayo</div>
          <div className="seg grid grid-cols-3" role="group" aria-label="Vertical alignment">
            {(
              [
                ["top", "Taas"],
                ["middle", "Gitna"],
                ["bottom", "Baba"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => set({ valign: id })} aria-pressed={value.valign === id} className="seg-item h-8 px-1 text-xs touch-44 lg:min-h-0">
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={() => onChange({ ...DEFAULT_TEXT_STYLE })} className="btn btn-ghost btn-sm">
        <RotateCcw className="h-3.5 w-3.5" />
        Ibalik sa default
      </button>
    </div>
  );
};
