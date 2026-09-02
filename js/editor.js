import { saveStripToArchive } from "./archive.js";

const STRIP_EXPORT_WIDTH = 480;
const PHOTO_ASPECT = 4 / 3;
const PHOTO_GAP = 14;
const PADDING = 18;
const MEMORY_BAND = 60;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

export class Editor {
  constructor() {
    this.stripEl = document.getElementById("editorStrip");
    this.frameColorRow = document.getElementById("frameColorRow");
    this.stickerGrid = document.getElementById("stickerGrid");
    this.memoryInput = document.getElementById("memoryInput");
    this.memoryDate = document.getElementById("memoryDate");
    this.resetBtn = document.getElementById("editorResetBtn");
    this.nextBtn = document.getElementById("editorNextBtn");
    this.exportPreview = document.getElementById("exportPreview");
    this.exportImage = document.getElementById("exportImage");
    this.exportDownload = document.getElementById("exportDownload");
    this.exportCloseBtn = document.getElementById("exportCloseBtn");

    this.photos = [];
    this.frameColor = "#2f4f6f";
    this.stickers = []; // { id, icon, xPct, yPct }

    this.frameColorRow.querySelectorAll(".color-dot").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.frameColor = btn.dataset.color;
        this._syncFrameColorSelection();
        this._renderStrip();
      });
    });

    this.stickerGrid.querySelectorAll(".sticker-btn").forEach((btn) => {
      btn.addEventListener("click", () => this._addSticker(btn.dataset.icon));
    });

    this.resetBtn.addEventListener("click", () => {
      this.stickers = [];
      this._renderStrip();
    });

    this.nextBtn.addEventListener("click", () => this._exportStrip());
    this.exportCloseBtn.addEventListener("click", () => this.exportPreview.classList.add("hidden"));
  }

  /** Called each time the editor page is entered with a fresh set of photos. */
  open(photos) {
    this.photos = photos;
    this.stickers = [];
    this.frameColor = "#2f4f6f";
    this.memoryInput.value = "";
    this.memoryDate.textContent = `Captured: ${new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}`;
    this._syncFrameColorSelection();
    this._renderStrip();
  }

  _syncFrameColorSelection() {
    this.frameColorRow.querySelectorAll(".color-dot").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.color === this.frameColor);
    });
  }

  _renderStrip() {
    this.stripEl.innerHTML = "";
    this.photos.forEach((dataUrl) => {
      const div = document.createElement("div");
      div.className = "strip-photo";
      div.style.backgroundImage = `url(${dataUrl})`;
      div.style.borderColor = this.frameColor;
      this.stripEl.appendChild(div);
    });

    this.stickers.forEach((sticker) => {
      const el = document.createElement("div");
      el.className = "placed-sticker";
      el.style.left = `${sticker.xPct * 100}%`;
      el.style.top = `${sticker.yPct * 100}%`;
      el.innerHTML = `<span class="material-symbols-outlined">${sticker.icon}</span><span class="sticker-remove material-symbols-outlined">close</span>`;
      el.querySelector(".sticker-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        this.stickers = this.stickers.filter((s) => s.id !== sticker.id);
        this._renderStrip();
      });
      el.addEventListener("pointerdown", (e) => this._startDrag(e, sticker, el));
      this.stripEl.appendChild(el);
    });
  }

  _addSticker(icon) {
    this.stickers.push({ id: crypto.randomUUID?.() ?? String(Math.random()), icon, xPct: 0.5, yPct: 0.5 });
    this._renderStrip();
  }

  _startDrag(e, sticker, el) {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const rect = this.stripEl.getBoundingClientRect();

    const onMove = (moveEvt) => {
      sticker.xPct = clamp01((moveEvt.clientX - rect.left) / rect.width);
      sticker.yPct = clamp01((moveEvt.clientY - rect.top) / rect.height);
      el.style.left = `${sticker.xPct * 100}%`;
      el.style.top = `${sticker.yPct * 100}%`;
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  async _exportStrip() {
    const photoW = STRIP_EXPORT_WIDTH - PADDING * 2;
    const photoH = photoW / PHOTO_ASPECT;
    const totalH = PADDING * 2 + this.photos.length * photoH + (this.photos.length - 1) * PHOTO_GAP + MEMORY_BAND;

    const canvas = document.createElement("canvas");
    canvas.width = STRIP_EXPORT_WIDTH;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const images = await Promise.all(this.photos.map(loadImage));
    images.forEach((img, i) => {
      const y = PADDING + i * (photoH + PHOTO_GAP);
      ctx.drawImage(img, PADDING, y, photoW, photoH);
      ctx.strokeStyle = this.frameColor;
      ctx.lineWidth = 6;
      ctx.strokeRect(PADDING + 3, y + 3, photoW - 6, photoH - 6);
    });

    const memoryText = this.memoryInput.value.trim();
    if (memoryText) {
      ctx.fillStyle = "#2b241d";
      ctx.font = "italic 16px 'Courier Prime', monospace";
      ctx.textAlign = "center";
      ctx.fillText(memoryText, canvas.width / 2, canvas.height - MEMORY_BAND / 2 + 4, canvas.width - PADDING * 2);
    }

    await document.fonts.load("26px 'Material Symbols Outlined'");
    await document.fonts.ready;
    ctx.font = "26px 'Material Symbols Outlined'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    this.stickers.forEach((sticker) => {
      ctx.fillStyle = this.frameColor;
      ctx.fillText(sticker.icon, sticker.xPct * canvas.width, sticker.yPct * canvas.height);
    });

    const dataUrl = canvas.toDataURL("image/png");
    saveStripToArchive(dataUrl);

    this.exportImage.src = dataUrl;
    this.exportDownload.href = dataUrl;
    this.exportPreview.classList.remove("hidden");
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
