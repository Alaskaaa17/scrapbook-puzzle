/**
 * Maps a filter id to a canvas `ctx.filter` string, plus an optional
 * translucent color wash drawn on top for looks that a plain CSS filter
 * can't achieve (Korean tone, warm glow).
 */
const FILTER_DEFS = {
  original: { filter: 'none', wash: null },
  bw: { filter: 'grayscale(100%) contrast(105%)', wash: null },
  vintage: { filter: 'sepia(55%) contrast(90%) brightness(95%) saturate(75%)', wash: 'rgba(120, 90, 40, 0.08)' },
  korean: { filter: 'brightness(112%) contrast(96%) saturate(112%)', wash: 'rgba(255, 200, 210, 0.12)' },
  warm: { filter: 'saturate(120%) brightness(107%) contrast(97%)', wash: 'rgba(255, 150, 60, 0.14)' },
};

/**
 * Draws `source` (an image/video/canvas) onto `ctx` at (0,0,w,h) with the
 * given filter id applied. Assumes ctx's canvas is already sized to w/h.
 */
function drawWithFilter(ctx, source, w, h, filterId) {
  const def = FILTER_DEFS[filterId] || FILTER_DEFS.original;
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
