/**
 * 2026-11-06 (Jarvis): sizes of the Simulator's panels on desktop (dragged with ResizeHandle).
 *  - cols: [library, schedule] as a share of the width (output = the rest); null = the original layout.
 *  - schedList: height of the schedule list as % of the Schedule column; null = the original layout.
 * Saved in this browser ("wtp-layout-v1"). Phones (< 1024 px) keep their tabs and ignore this.
 */
import { useCallback, useState } from "react";

export const LAYOUT_STORAGE_KEY = "wtp-layout-v1";

/** Smallest sizes (px), so no panel can be squeezed until buttons disappear. */
export const PANEL_MIN = { library: 256, schedule: 320, output: 336, schedList: 144, slides: 160 };

export interface PanelLayout {
  cols: [number, number] | null;
  schedList: number | null;
}

export const DEFAULT_LAYOUT: PanelLayout = { cols: null, schedList: null };

const okShare = (v: unknown) => typeof v === "number" && isFinite(v) && v > 0.05 && v < 0.9;

export function sanitizeLayout(raw: unknown): PanelLayout {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LAYOUT };
  const o = raw as Record<string, unknown>;
  const c = o.cols;
  const cols = Array.isArray(c) && c.length === 2 && okShare(c[0]) && okShare(c[1]) && (c[0] as number) + (c[1] as number) < 0.95 ? ([c[0], c[1]] as [number, number]) : null;
  const s = o.schedList;
  const schedList = typeof s === "number" && isFinite(s) && s >= 10 && s <= 90 ? s : null;
  return { cols, schedList };
}

export function loadLayout(): PanelLayout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? sanitizeLayout(JSON.parse(raw)) : { ...DEFAULT_LAYOUT };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

function saveLayout(l: PanelLayout) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(l));
  } catch {
    /* storage blocked — the layout just isn't remembered */
  }
}

/**
 * New column widths after dragging border `edge` (0 = Library|Schedule, 1 = Schedule|Output) by dx px.
 * Only the two panels next to the border change; the minimums are kept.
 */
export function dragColumns(widths: [number, number, number], edge: 0 | 1, dx: number): [number, number, number] {
  const [a, b, c] = widths;
  const mins = [PANEL_MIN.library, PANEL_MIN.schedule, PANEL_MIN.output];
  if (edge === 0) {
    const lo = mins[0] - a; // most it can move left
    const hi = b - mins[1]; // most it can move right
    const d = Math.min(Math.max(dx, Math.min(lo, 0)), Math.max(hi, 0));
    return [a + d, b - d, c];
  }
  const lo = mins[1] - b;
  const hi = c - mins[2];
  const d = Math.min(Math.max(dx, Math.min(lo, 0)), Math.max(hi, 0));
  return [a, b + d, c - d];
}

/** Widths (px) → shares saved in the layout. */
export function toShares(widths: [number, number, number]): [number, number] {
  const total = widths[0] + widths[1] + widths[2] || 1;
  return [widths[0] / total, widths[1] / total];
}

/** CSS grid-template-columns for a custom layout (fr keeps the shares; minmax keeps the minimums). */
export function gridColumns(cols: [number, number]): string {
  const out = Math.max(0.05, 1 - cols[0] - cols[1]);
  return `minmax(${PANEL_MIN.library}px,${cols[0].toFixed(4)}fr) minmax(${PANEL_MIN.schedule}px,${cols[1].toFixed(4)}fr) minmax(${PANEL_MIN.output}px,${out.toFixed(4)}fr)`;
}

/** Schedule list height (px) after dragging by dy, as % of the Schedule column. */
export function dragSchedList(listPx: number, columnPx: number, dy: number): number {
  const max = Math.max(PANEL_MIN.schedList, columnPx - PANEL_MIN.slides - 44); // 44 = column header
  const h = Math.min(Math.max(listPx + dy, PANEL_MIN.schedList), max);
  return Math.round((h / (columnPx || 1)) * 1000) / 10;
}

export function usePanelLayout() {
  const [layout, setLayoutState] = useState<PanelLayout>(loadLayout);
  const setLayout = useCallback((next: PanelLayout | ((prev: PanelLayout) => PanelLayout)) => {
    setLayoutState((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      saveLayout(v);
      return v;
    });
  }, []);
  return { layout, setLayout };
}
