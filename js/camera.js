import { GestureTracker, HAND_CONNECTIONS } from "./gesture.js";
import { SlidingPuzzle } from "./puzzle.js";
import { Hud } from "./hud.js";
import { FILTERS } from "./filters.js";

const BOX_WIDTH_FRAC = 0.5;
const BOX_ASPECT = 16 / 10;
const COUNTDOWN_START = 3;
const CAPTURE_RES_W = 640;
const CAPTURE_RES_H = Math.round(CAPTURE_RES_W / BOX_ASPECT);
const SAVING_PAUSE_MS = 700;

function computeCoverRect(srcW, srcH, dstW, dstH) {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sh = srcH;
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh };
  }
  const sw = srcW;
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw, sh };
}

/** Maps a raw (unmirrored) normalized video landmark to canvas-fraction coords, mirror-corrected. */
function landmarkToCanvasFraction(lm, video, coverRect) {
  const videoX = lm.x * video.videoWidth;
  const videoY = lm.y * video.videoHeight;
  const fracInCoverX = (videoX - coverRect.sx) / coverRect.sw;
  const fracInCoverY = (videoY - coverRect.sy) / coverRect.sh;
  return { x: 1 - fracInCoverX, y: fracInCoverY };
}

export class CameraController {
  constructor() {
    this.video = document.getElementById("camVideo");
    this.canvas = document.getElementById("camCanvas");
    this.ctx = this.canvas.getContext("2d");
    this.hud = new Hud();
    this.gesture = new GestureTracker();
    this.stream = null;
    this.rafId = 0;
    this.wasPinchingLastFrame = false;
    this.onDone = null;
    this._pointerDragActive = false;

    this.canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
    window.addEventListener("pointerup", () => this._onPointerUp());
    window.addEventListener("resize", () => this._resizeCanvas());
  }

  /** Starts a new capture session. `onDone(photos)` fires once totalPhotos are saved. */
  async start({ gridSize, totalPhotos, filterKey, onDone }) {
    this.gridSize = gridSize;
    this.totalPhotos = totalPhotos;
    this.filterKey = filterKey;
    this.onDone = onDone;
    this.photos = [];
    this.state = "loading";
    this.puzzle = null;
    this.capturedImage = null;
    this.countdownValue = COUNTDOWN_START;
    this.countdownNextTick = 0;
    this.savingUntil = 0;
    this.hud.reset();
    this.hud.setCounter(0, totalPhotos);

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.hud.hideError();
    } catch {
      this.hud.showError("Tidak bisa mengakses kamera. Izinkan akses kamera di browser lalu coba lagi.");
      this.state = "error";
      return;
    }

    try {
      await this.gesture.init();
    } catch {
      this.hud.showError("Gagal memuat model deteksi gestur. Periksa koneksi internet lalu muat ulang halaman.");
    }

    this._resizeCanvas();
    this.state = "idle";
    this._loop();
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  _resizeCanvas() {
    const rect = this.video.getBoundingClientRect();
    if (rect.width && rect.height) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  _boxRect() {
    const isPortrait = this.canvas.height > this.canvas.width;
    // On a portrait phone screen, half the (narrow) width makes the box
    // tiny with lots of unused vertical space — widen it, but keep the
    // resulting height comfortably inside the canvas.
    const widthFrac = isPortrait ? 0.85 : BOX_WIDTH_FRAC;
    let w = this.canvas.width * widthFrac;
    let h = w / BOX_ASPECT;
    const maxH = this.canvas.height * 0.62;
    if (h > maxH) {
      h = maxH;
      w = h * BOX_ASPECT;
    }
    return { x: (this.canvas.width - w) / 2, y: (this.canvas.height - h) / 2, w, h };
  }

  _loop() {
    this.rafId = requestAnimationFrame(() => this._loop());
    if (this.canvas.width === 0 || !this.video.videoWidth) return;

    const coverRect = computeCoverRect(this.video.videoWidth, this.video.videoHeight, this.canvas.width, this.canvas.height);
    this._drawVideoMirrored(coverRect);
    const box = this._boxRect();

    if (this.state === "puzzle" || this.state === "solved" || this.state === "saving") {
      this.puzzle.render(this.ctx, box);
      if (this.state === "solved" || this.state === "saving") {
        this.ctx.fillStyle = "rgba(76,175,109,0.22)";
        this.ctx.fillRect(box.x, box.y, box.w, box.h);
      }
    } else {
      this._drawFilteredBox(coverRect, box);
    }

    this.ctx.strokeStyle = "#f5c518";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);

    const gestureFrame = this.gesture.detect(this.video, performance.now());
    gestureFrame.landmarksList?.forEach((landmarks) => this._drawSkeleton(landmarks, coverRect));

    if (this.state === "countdown") this._renderCountdown(box);

    this._updateStateMachine(gestureFrame, coverRect, box);
    this._updateHudStatus(gestureFrame);
    this.wasPinchingLastFrame = gestureFrame.isPinching;
  }

  _drawVideoMirrored(coverRect) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, coverRect.sx, coverRect.sy, coverRect.sw, coverRect.sh, 0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  _drawFilteredBox(coverRect, box) {
    const filter = FILTERS[this.filterKey] ?? "none";
    if (filter === "none") return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.clip();
    ctx.filter = filter;
    ctx.translate(this.canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, coverRect.sx, coverRect.sy, coverRect.sw, coverRect.sh, 0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  _drawSkeleton(landmarks, coverRect) {
    const ctx = this.ctx;
    const pts = landmarks.map((lm) => {
      const f = landmarkToCanvasFraction(lm, this.video, coverRect);
      return { x: f.x * this.canvas.width, y: f.y * this.canvas.height };
    });
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    HAND_CONNECTIONS.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    });
    ctx.fillStyle = "#fff";
    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  _renderCountdown(box) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.fillStyle = "#f5c518";
    ctx.font = "700 120px 'Space Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(this.countdownValue), box.x + box.w / 2, box.y + box.h / 2);
  }

  _updateStateMachine(gestureFrame, coverRect, box) {
    const now = performance.now();

    if (this.state === "idle") {
      if (gestureFrame.pinchStarted) this._beginCountdown();
      return;
    }

    if (this.state === "countdown") {
      if (now >= this.countdownNextTick) {
        this.countdownValue -= 1;
        this.countdownNextTick = now + 1000;
        // The frame that ticks value to 0 renders the last real number
        // ("1") before this update runs, so capturing here — without ever
        // rendering "0" — lands right after "1" per the spec's 3→2→1.
        if (this.countdownValue <= 0) this._captureFrame(coverRect, box);
      }
      return;
    }

    if (this.state === "puzzle") {
      this._updatePuzzleDrag(gestureFrame, coverRect, box);
      return;
    }

    if (this.state === "solved") {
      if (gestureFrame.fistStarted) this._save();
      return;
    }

    if (this.state === "saving") {
      if (now >= this.savingUntil) this._afterSave();
    }
  }

  _beginCountdown() {
    this.state = "countdown";
    this.countdownValue = COUNTDOWN_START;
    this.countdownNextTick = performance.now() + 1000;
  }

  _captureFrame(coverRect, box) {
    // Map the on-screen (mirrored) capture box back to raw video source pixels.
    const videoBoxSX = coverRect.sx + coverRect.sw * (1 - (box.x + box.w) / this.canvas.width);
    const videoBoxSW = coverRect.sw * (box.w / this.canvas.width);
    const videoBoxSY = coverRect.sy + coverRect.sh * (box.y / this.canvas.height);
    const videoBoxSH = coverRect.sh * (box.h / this.canvas.height);

    const off = document.createElement("canvas");
    off.width = CAPTURE_RES_W;
    off.height = CAPTURE_RES_H;
    const octx = off.getContext("2d");
    octx.save();
    octx.translate(CAPTURE_RES_W, 0);
    octx.scale(-1, 1);
    octx.filter = FILTERS[this.filterKey] ?? "none";
    octx.drawImage(this.video, videoBoxSX, videoBoxSY, videoBoxSW, videoBoxSH, 0, 0, CAPTURE_RES_W, CAPTURE_RES_H);
    octx.restore();

    this.capturedImage = off;
    this.puzzle = new SlidingPuzzle(this.gridSize, off);
    this.state = "puzzle";
  }

  _updatePuzzleDrag(gestureFrame, coverRect, box) {
    if (this._pointerDragActive) return; // mouse fallback owns the drag this frame

    if (!this.puzzle.drag) {
      if (gestureFrame.pinchStarted && gestureFrame.pinchPoint) {
        const f = landmarkToCanvasFraction(gestureFrame.pinchPoint, this.video, coverRect);
        const boxFrac = this._toBoxFraction(f, box);
        if (boxFrac) {
          const pos = this.puzzle.positionAt(boxFrac.x, boxFrac.y);
          if (this.puzzle.beginDrag(pos)) this._dragAnchor = boxFrac;
        }
      }
      return;
    }

    if (gestureFrame.isPinching && gestureFrame.pinchPoint) {
      const f = landmarkToCanvasFraction(gestureFrame.pinchPoint, this.video, coverRect);
      const boxFrac = this._toBoxFraction(f, box);
      if (boxFrac) this._applyDragProgress(boxFrac);
    } else if (this.wasPinchingLastFrame) {
      this._commitDrag();
    }
  }

  /** Returns the point as a fraction of the box, or null if it falls outside it. */
  _toBoxFraction(canvasFrac, box) {
    const px = canvasFrac.x * this.canvas.width;
    const py = canvasFrac.y * this.canvas.height;
    const x = (px - box.x) / box.w;
    const y = (py - box.y) / box.h;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  _applyDragProgress(boxFrac) {
    const drag = this.puzzle.drag;
    const delta =
      drag.axis === "x"
        ? (boxFrac.x - this._dragAnchor.x) * this.gridSize * drag.dir
        : (boxFrac.y - this._dragAnchor.y) * this.gridSize * drag.dir;
    this.puzzle.updateDrag(delta);
  }

  _commitDrag() {
    const result = this.puzzle.endDrag();
    if (result.moved && this.puzzle.isSolved()) this.state = "solved";
  }

  _save() {
    this.photos.push(this.capturedImage.toDataURL("image/jpeg", 0.92));
    this.hud.setThumbnails(this.photos);
    this.hud.setCounter(this.photos.length, this.totalPhotos);
    this.hud.showSolvedCard(false);
    this.state = "saving";
    this.savingUntil = performance.now() + SAVING_PAUSE_MS;
  }

  _afterSave() {
    if (this.photos.length >= this.totalPhotos) {
      this.stop();
      this.onDone?.(this.photos);
      return;
    }
    this.state = "idle";
  }

  _updateHudStatus(gestureFrame) {
    let key = "waiting";
    if (this.state === "countdown") key = "countdown";
    else if (this.state === "puzzle") key = "puzzle";
    else if (this.state === "solved" || this.state === "saving") key = "solved";
    else if (gestureFrame.detected) key = "detected";
    this.hud.setStatus(this.state === "saving" ? "saving" : key);
    this.hud.showSolvedCard(this.state === "solved");
  }

  // ---- optional mouse/click fallback, mirrors the gesture-driven flow ----

  _onPointerDown(e) {
    const box = this._boxRect();
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    if (this.state === "idle" && px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
      this._beginCountdown();
      return;
    }
    if (this.state === "puzzle" && !this.puzzle.drag) {
      const fx = (px - box.x) / box.w;
      const fy = (py - box.y) / box.h;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
      const pos = this.puzzle.positionAt(fx, fy);
      if (this.puzzle.beginDrag(pos)) {
        this._pointerDragActive = true;
        this._dragAnchor = { x: fx, y: fy };
      }
    }
  }

  _onPointerMove(e) {
    if (!this._pointerDragActive || !this.puzzle?.drag) return;
    const box = this._boxRect();
    const rect = this.canvas.getBoundingClientRect();
    const fx = (e.clientX - rect.left - box.x) / box.w;
    const fy = (e.clientY - rect.top - box.y) / box.h;
    this._applyDragProgress({ x: fx, y: fy });
  }

  _onPointerUp() {
    if (!this._pointerDragActive) return;
    this._pointerDragActive = false;
    this._commitDrag();
  }
}
