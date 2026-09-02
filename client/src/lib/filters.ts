export type FilterId = "Original" | "B&W" | "Vintage" | "Korean" | "Warm Glow";

interface FilterDef {
  filter: string;
  wash: string | null;
}

/**
 * Maps a filter id to a canvas `ctx.filter` string, plus an optional
 * translucent color wash drawn on top for looks a plain CSS filter can't
 * achieve on its own (Korean tone, warm glow).
 */
const FILTER_DEFS: Record<FilterId, FilterDef> = {
  Original: { filter: "none", wash: null },
  "B&W": { filter: "grayscale(100%) contrast(105%)", wash: null },
  Vintage: { filter: "sepia(55%) contrast(90%) brightness(95%) saturate(75%)", wash: "rgba(120, 90, 40, 0.08)" },
  Korean: { filter: "brightness(112%) contrast(96%) saturate(112%)", wash: "rgba(255, 200, 210, 0.12)" },
  "Warm Glow": { filter: "saturate(120%) brightness(107%) contrast(97%)", wash: "rgba(255, 150, 60, 0.14)" },
};

/**
 * Draws `source` onto `ctx` at (0,0,w,h) with the given filter applied.
 * Assumes ctx's canvas is already sized to w/h.
 */
export function drawWithFilter(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  w: number,
  h: number,
  filterId: FilterId,
) {
  const def = FILTER_DEFS[filterId];
  ctx.save();
  ctx.filter = def.filter;
  ctx.drawImage(source, 0, 0, w, h);
  ctx.restore();
  if (def.wash) {
    ctx.save();
    ctx.fillStyle = def.wash;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
