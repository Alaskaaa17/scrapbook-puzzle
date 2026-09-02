/**
 * Screen 4: renders the photobooth strip, lets the user customize frame
 * color / stickers / memory text, and exports the final composite.
 *
 * Layout math (photo slot rects, sticker placement) is expressed once in
 * fractions of the strip's own width/height via `computeLayout()`, then
 * reused both for on-screen CSS positioning and for the export canvas so
 * the two never drift apart.
 */
const PhotoBooth = (() => {
  const STICKERS = ['⭐', '💖', '☁️', '🎵', '🌸'];
  const SLOT_MARGIN_FRAC = 0.06;   // margin around the whole strip
  const SLOT_GAP_FRAC = 0.04;      // gap between photo slots
  const MEMORY_BAND_FRAC = 0.12;   // reserved height at bottom for memory text

  let stripContainer, canvas, ctx, stickerLayer, memoryInput;
  let frameColorGroup, stickerPanel, downloadBtn;

  function init() {
    stripContainer = document.getElementById('strip-container');
    canvas = document.getElementById('strip-canvas');
    ctx = canvas.getContext('2d');
    stickerLayer = document.getElementById('sticker-layer');
    memoryInput = document.getElementById('memory-input');
    frameColorGroup = document.getElementById('frame-color-group');
    stickerPanel = document.getElementById('sticker-panel');
    downloadBtn = document.getElementById('download-btn');

    buildStickerPanel();
    wireFrameColorButtons();
    wireMemoryInput();
    downloadBtn.addEventListener('click', downloadStrip);
  }

  function enterScreen() {
    AppState.strip.frameColor = '#ffffff';
    memoryInput.value = '';
    updateFrameColorSelection();
    renderStrip();
  }

  /** Fractional geometry shared by CSS layout and canvas export. */
  function computeLayout() {
    const count = AppState.photos.length;
    const margin = SLOT_MARGIN_FRAC;
    const gap = SLOT_GAP_FRAC;
    const slotWidthFrac = 1 - margin * 2;
    const slotHeightFrac = slotWidthFrac; // square photos

    const slots = [];
    let yCursor = margin;
    for (let i = 0; i < count; i++) {
      slots.push({ xFrac: margin, yFrac: yCursor, wFrac: slotWidthFrac, hFrac: slotHeightFrac });
      yCursor += slotHeightFrac + gap;
    }
    const contentHeightFrac = yCursor - gap + margin + MEMORY_BAND_FRAC;
    return { slots, totalHeightFrac: contentHeightFrac, memoryBandFrac: MEMORY_BAND_FRAC };
  }

  function renderStrip() {
    const EXPORT_WIDTH = 640;
    const layout = computeLayout();
    const exportHeight = Math.round(EXPORT_WIDTH * layout.totalHeightFrac);

    canvas.width = EXPORT_WIDTH;
    canvas.height = exportHeight;
    stripContainer.style.aspectRatio = `${EXPORT_WIDTH} / ${exportHeight}`;

    drawBaseStrip(layout, EXPORT_WIDTH, exportHeight);
    renderStickerDom();
  }

  function drawBaseStrip(layout, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = AppState.strip.frameColor;
    ctx.fillRect(0, 0, w, h);

    layout.slots.forEach((slot, i) => {
      const photo = AppState.photos[i];
      if (!photo) return;
      const x = slot.xFrac * w;
      const y = slot.yFrac * h;
      const sw = slot.wFrac * w;
      const sh = slot.hFrac * h;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 8;
      ctx.drawImage(photo.image, x, y, sw, sh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, sw, sh);
    });

    if (AppState.strip.memoryText) {
      ctx.fillStyle = '#4a4038';
      ctx.font = `${Math.round(w * 0.035)}px 'Courier Prime', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(AppState.strip.memoryText, w / 2, h - h * layout.memoryBandFrac * 0.4, w * 0.9);
    }
  }

  // ---------------- Stickers ----------------

  function buildStickerPanel() {
    stickerPanel.innerHTML = '';
    STICKERS.forEach((emoji) => {
      const src = document.createElement('div');
      src.className = 'sticker-source';
      src.textContent = emoji;
      src.draggable = true;
      src.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', emoji);
      });
      src.addEventListener('click', () => addSticker(emoji, 0.5, 0.5));
      stickerPanel.appendChild(src);
    });

    stickerLayer.addEventListener('dragover', (e) => e.preventDefault());
    stickerLayer.addEventListener('drop', (e) => {
      e.preventDefault();
      const emoji = e.dataTransfer.getData('text/plain');
      if (!emoji) return;
      const rect = stickerLayer.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      const yFrac = (e.clientY - rect.top) / rect.height;
      addSticker(emoji, clamp01(xFrac), clamp01(yFrac));
    });
  }

  function addSticker(emoji, xFrac, yFrac) {
    AppState.strip.stickers.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      emoji,
      xPct: xFrac,
      yPct: yFrac,
      sizePct: 0.12,
    });
    renderStickerDom();
  }

  function renderStickerDom() {
    stickerLayer.innerHTML = '';
    AppState.strip.stickers.forEach((sticker) => {
      const el = document.createElement('div');
      el.className = 'sticker-item';
      el.textContent = sticker.emoji;
      positionStickerEl(el, sticker);

      el.addEventListener('pointerdown', (e) => startDragSticker(e, sticker, el));

      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startResizeSticker(e, sticker, el);
      });
      el.appendChild(handle);

      el.addEventListener('dblclick', () => {
        AppState.strip.stickers = AppState.strip.stickers.filter((s) => s.id !== sticker.id);
        renderStickerDom();
      });

      stickerLayer.appendChild(el);
    });
  }

  function positionStickerEl(el, sticker) {
    el.style.left = `${sticker.xPct * 100}%`;
    el.style.top = `${sticker.yPct * 100}%`;
    el.style.fontSize = `${sticker.sizePct * stickerLayer.getBoundingClientRect().width}px`;
  }

  function startDragSticker(e, sticker, el) {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const rect = stickerLayer.getBoundingClientRect();

    const onMove = (moveEvt) => {
      const xFrac = clamp01((moveEvt.clientX - rect.left) / rect.width);
      const yFrac = clamp01((moveEvt.clientY - rect.top) / rect.height);
      sticker.xPct = xFrac;
      sticker.yPct = yFrac;
      positionStickerEl(el, sticker);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  function startResizeSticker(e, sticker, el) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const rect = stickerLayer.getBoundingClientRect();

    const onMove = (moveEvt) => {
      const dx = (moveEvt.clientX - rect.left) / rect.width - sticker.xPct;
      const dy = (moveEvt.clientY - rect.top) / rect.height - sticker.yPct;
      const dist = Math.hypot(dx, dy);
      sticker.sizePct = Math.min(0.4, Math.max(0.04, dist * 1.6));
      positionStickerEl(el, sticker);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  }

  function clamp01(v) {
    return Math.min(1, Math.max(0, v));
  }

  // ---------------- Controls ----------------

  function wireFrameColorButtons() {
    frameColorGroup.querySelectorAll('.color-dot').forEach((btn) => {
      btn.addEventListener('click', () => {
        AppState.strip.frameColor = btn.dataset.color;
        updateFrameColorSelection();
        renderStrip();
      });
    });
  }

  function updateFrameColorSelection() {
    frameColorGroup.querySelectorAll('.color-dot').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.color === AppState.strip.frameColor);
    });
  }

  function wireMemoryInput() {
    memoryInput.addEventListener('input', () => {
      AppState.strip.memoryText = memoryInput.value;
      drawBaseStrip(computeLayout(), canvas.width, canvas.height);
    });
  }

  // ---------------- Export ----------------

  function downloadStrip() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext('2d');
    exportCtx.drawImage(canvas, 0, 0);

    AppState.strip.stickers.forEach((sticker) => {
      const size = sticker.sizePct * exportCanvas.width;
      exportCtx.font = `${size}px sans-serif`;
      exportCtx.textAlign = 'center';
      exportCtx.textBaseline = 'middle';
      exportCtx.fillText(sticker.emoji, sticker.xPct * exportCanvas.width, sticker.yPct * exportCanvas.height);
    });

    const link = document.createElement('a');
    link.download = 'scrapbook-puzzle-strip.png';
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  }

  return { init, enterScreen };
})();
