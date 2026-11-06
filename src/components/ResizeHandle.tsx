/**
 * 2026-11-06 (Jarvis): a drag handle on a panel border (desktop only).
 *  - Drag with mouse / pen / touch; arrow keys move it 24 px when it has focus; double-click = reset.
 *  - Thin line that turns the accent color on hover / drag, so you can see where to grab.
 * The parent decides what moves (onStart → onMove(delta px) → onEnd).
 */
import React, { useRef, useState } from "react";

interface Props {
  /** "x" = drag left/right (a border between columns), "y" = drag up/down (a border between rows). */
  axis: "x" | "y";
  label: string;
  /** 0–100, for screen readers. */
  valueNow?: number;
  onStart: () => void;
  onMove: (delta: number) => void;
  onEnd?: () => void;
  onReset: () => void;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}

export const KEY_STEP = 24;

export const ResizeHandle: React.FC<Props> = ({ axis, label, valueNow, onStart, onMove, onEnd, onReset, className = "", style, testId }) => {
  const start = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const pos = (e: React.PointerEvent) => (axis === "x" ? e.clientX : e.clientY);

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={`${label} — i-drag o arrow keys; double-click = default`}
      aria-valuenow={valueNow !== undefined ? Math.round(valueNow) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      title={`${label} (i-drag · double-click = default)`}
      data-testid={testId}
      style={style}
      className={`group absolute z-20 hidden touch-none select-none lg:block focus-visible:outline-none ${
        axis === "x" ? "inset-y-0 w-2.5 cursor-col-resize" : "inset-x-0 h-2.5 cursor-row-resize"
      } ${className}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = pos(e);
        setDragging(true);
        onStart();
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        onMove(pos(e) - start.current);
      }}
      onPointerUp={(e) => {
        if (start.current === null) return;
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        start.current = null;
        setDragging(false);
        onEnd?.();
      }}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
        onEnd?.();
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const back = axis === "x" ? "ArrowLeft" : "ArrowUp";
        const fwd = axis === "x" ? "ArrowRight" : "ArrowDown";
        if (e.key !== back && e.key !== fwd && e.key !== "Home") return;
        // keep the Simulator's ↑/↓ slide keys from running too
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Home") return onReset();
        onStart();
        onMove(e.key === fwd ? KEY_STEP : -KEY_STEP);
        onEnd?.();
      }}
    >
      {/* the visible line (centered in the grab area) */}
      <span
        aria-hidden
        className={`pointer-events-none absolute transition-colors ${
          axis === "x" ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2"
        } ${dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/70 group-focus-visible:bg-accent"}`}
        style={dragging ? { [axis === "x" ? "width" : "height"]: 3 } : undefined}
      />
    </div>
  );
};
