import { useRef, type PointerEvent as ReactPointerEvent } from "react";

export interface PlacedSticker {
  id: string;
  icon: string;
  xPct: number;
  yPct: number;
  sizePct: number;
}

interface StickerLayerProps {
  stickers: PlacedSticker[];
  onChange: (stickers: PlacedSticker[]) => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Draggable, resizable, double-click-to-remove sticker overlay for the strip preview. */
export function StickerLayer({ stickers, onChange }: StickerLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);

  const updateSticker = (id: string, patch: Partial<PlacedSticker>) => {
    onChange(stickers.map((sticker) => (sticker.id === id ? { ...sticker, ...patch } : sticker)));
  };

  const removeSticker = (id: string) => {
    onChange(stickers.filter((sticker) => sticker.id !== id));
  };

  const startDrag = (event: ReactPointerEvent<HTMLSpanElement>, sticker: PlacedSticker) => {
    event.preventDefault();
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      updateSticker(sticker.id, {
        xPct: clamp01((moveEvent.clientX - rect.left) / rect.width),
        yPct: clamp01((moveEvent.clientY - rect.top) / rect.height),
      });
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, sticker: PlacedSticker) => {
    event.preventDefault();
    event.stopPropagation();
    const layer = layerRef.current;
    if (!layer) return;
    const rect = layer.getBoundingClientRect();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - rect.left) / rect.width - sticker.xPct;
      const dy = (moveEvent.clientY - rect.top) / rect.height - sticker.yPct;
      const size = Math.min(0.4, Math.max(0.05, Math.hypot(dx, dy) * 1.6));
      updateSticker(sticker.id, { sizePct: size });
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={layerRef} className="sticker-layer">
      {stickers.map((sticker) => (
        <span
          key={sticker.id}
          className="sticker-item"
          style={{ left: `${sticker.xPct * 100}%`, top: `${sticker.yPct * 100}%`, fontSize: `${sticker.sizePct * 100}cqw` }}
          onPointerDown={(event) => startDrag(event, sticker)}
          onDoubleClick={() => removeSticker(sticker.id)}
          title="Drag to move, drag the dot to resize, double-click to remove"
        >
          {sticker.icon}
          <span className="sticker-resize-handle" onPointerDown={(event) => startResize(event, sticker)} />
        </span>
      ))}
    </div>
  );
}
