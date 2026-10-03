import { useRef, type KeyboardEvent, type PointerEvent } from 'react';

interface Props {
  /** Current width of the right-hand panel in px. */
  value: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
  onReset: () => void;
}

const STEP = 24;

/** Vertical drag handle that resizes the panel to its right. */
export function Splitter({ value, min, max, onChange, onReset }: Props) {
  const drag = useRef<{ startX: number; startW: number } | null>(null);
  const lastDown = useRef(0);
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Pointer capture suppresses native dblclick, so detect it from timing.
    const now = e.timeStamp;
    if (now - lastDown.current < 350) {
      lastDown.current = 0;
      onReset();
      return;
    }
    lastDown.current = now;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startW: value };
    document.body.classList.add('is-resizing');
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = drag.current.startX - e.clientX;
    if (Math.abs(dx) > 3) lastDown.current = 0; // a real drag never counts toward a double-click
    onChange(clamp(drag.current.startW + dx));
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.classList.remove('is-resizing');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? STEP * 4 : STEP;
    if (e.key === 'ArrowLeft') onChange(clamp(value + step));
    else if (e.key === 'ArrowRight') onChange(clamp(value - step));
    else if (e.key === 'Home') onChange(max);
    else if (e.key === 'End') onChange(min);
    else if (e.key === 'Enter') onReset();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize ticket breakdown"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
    >
      <span className="splitter-line" />
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
