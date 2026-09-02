/**
 * Orchestrates screen 2: camera setup, one SlidingPuzzle per round,
 * gesture-driven tile moves, and the post-solve countdown capture.
 * Exposes `startPuzzleScreen()` / `stopPuzzleScreen()` used by main.js.
 */
const PuzzleScreen = (() => {
  let video, overlayCanvas, gridEl, progressBadge, instructionEl;
  let countdownLayer, countdownNumber, cameraError, solvedHint;
  let tracker = null;
  let stream = null;
  let puzzle = null;
  let stage = 'idle'; // 'idle' | 'solving' | 'countdown' | 'done'
  let countdownTimer = null;

  function init() {
    video = document.getElementById('webcam-video');
    overlayCanvas = document.getElementById('overlay-canvas');
    gridEl = document.getElementById('puzzle-grid');
    progressBadge = document.getElementById('progress-badge');
    instructionEl = document.getElementById('puzzle-instruction');
    countdownLayer = document.getElementById('countdown-layer');
    countdownNumber = document.getElementById('countdown-number');
    cameraError = document.getElementById('camera-error');
    solvedHint = document.getElementById('solved-hint');
  }

  async function startPuzzleScreen() {
    cameraError.classList.add('hidden');
    resetSessionState();
    updateProgress();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 640, facingMode: 'user' },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      cameraError.classList.remove('hidden');
      return;
    }

    tracker = new HandTracker(video, overlayCanvas, onHandUpdate);
    tracker.start();

    beginRound();
  }

  function stopPuzzleScreen() {
    if (tracker) tracker.stop();
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (countdownTimer) clearInterval(countdownTimer);
    tracker = null;
    stream = null;
    puzzle = null;
    stage = 'idle';
  }

  function updateProgress() {
    progressBadge.textContent = `${AppState.photos.length}/${AppState.config.layoutCount}`;
  }

  function beginRound() {
    stage = 'solving';
    solvedHint.classList.add('hidden');
    instructionEl.textContent = 'Susun puzzle menggunakan gestur pinch (jempol + telunjuk)';

    const snapshot = captureSquareFrame(video, 480);
    puzzle = new SlidingPuzzle(gridEl, snapshot, AppState.config.gridSize, onPuzzleSolved);
    gridEl.style.display = 'grid';
  }

  function onPuzzleSolved() {
    stage = 'countdown';
    solvedHint.classList.remove('hidden');
    instructionEl.textContent = 'Puzzle selesai! Tersenyum untuk foto berikutnya';
    startCountdown();
  }

  function startCountdown() {
    let remaining = 3;
    countdownLayer.classList.remove('hidden');
    countdownNumber.textContent = String(remaining);
    countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        finishCountdown();
        return;
      }
      countdownNumber.textContent = String(remaining);
    }, 1000);
  }

  function finishCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    countdownLayer.classList.add('hidden');
    capturePhoto();
  }

  function capturePhoto() {
    const dataUrl = captureSquareFrame(video, 640, AppState.config.filter);
    const img = new Image();
    img.src = dataUrl;
    AppState.photos.push({ dataUrl, image: img });
    updateProgress();

    if (AppState.photos.length >= AppState.config.layoutCount) {
      stage = 'done';
      gridEl.style.display = 'none';
      solvedHint.classList.add('hidden');
      document.dispatchEvent(new CustomEvent('scrapbook:all-rounds-done'));
    } else {
      beginRound();
    }
  }

  /** Crops the live (mirrored) video into a square canvas, returns a dataURL. */
  function captureSquareFrame(videoEl, targetSize, filterId) {
    const vw = videoEl.videoWidth || targetSize;
    const vh = videoEl.videoHeight || targetSize;
    const side = Math.min(vw, vh);
    const sx = (vw - side) / 2;
    const sy = (vh - side) / 2;

    const off = document.createElement('canvas');
    off.width = targetSize;
    off.height = targetSize;
    const ctx = off.getContext('2d');

    // Mirror horizontally so the capture matches what the user sees.
    ctx.save();
    ctx.translate(targetSize, 0);
    ctx.scale(-1, 1);

    if (filterId) {
      const cropped = document.createElement('canvas');
      cropped.width = side;
      cropped.height = side;
      cropped.getContext('2d').drawImage(videoEl, sx, sy, side, side, 0, 0, side, side);
      drawWithFilter(ctx, cropped, targetSize, targetSize, filterId);
    } else {
      ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, targetSize, targetSize);
    }
    ctx.restore();
    return off.toDataURL('image/jpeg', 0.92);
  }

  function onHandUpdate(handState) {
    if (stage === 'solving' && puzzle) {
      if (handState.detected && handState.cursor) {
        const rect = overlayCanvas.getBoundingClientRect();
        const px = rect.left + handState.cursor.x;
        const py = rect.top + handState.cursor.y;
        const pos = puzzle.hitTest(px, py);
        puzzle.setHoverTarget(pos);

        if (handState.pinchStarted && pos >= 0) {
          puzzle.trySlide(pos);
        }
      } else {
        puzzle.clearHoverTarget();
      }
      return;
    }

    if (stage === 'countdown' && handState.fistStarted) {
      // Fist = confirm & save: skips the remaining countdown and
      // captures immediately instead of waiting it out.
      finishCountdown();
    }
  }

  return { init, startPuzzleScreen, stopPuzzleScreen };
})();
