/**
 * Wraps MediaPipe Hands: runs detection against a <video>, draws the
 * skeletal overlay on a <canvas>, and derives two discrete gestures
 * (pinch, fist) with edge-triggered "just happened" events so callers
 * don't have to debounce continuous per-frame state themselves.
 */
class HandTracker {
  /**
   * @param {HTMLVideoElement} videoEl
   * @param {HTMLCanvasElement} overlayCanvas
   * @param {(state: HandTrackState) => void} onUpdate called every processed frame
   */
  constructor(videoEl, overlayCanvas, onUpdate) {
    this.video = videoEl;
    this.canvas = overlayCanvas;
    this.ctx = overlayCanvas.getContext('2d');
    this.onUpdate = onUpdate;

    this.wasPinching = false;
    this.wasFist = false;

    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    this.hands.onResults((results) => this._handleResults(results));
  }

  start() {
    this.camera = new Camera(this.video, {
      onFrame: async () => {
        await this.hands.send({ image: this.video });
      },
      width: 640,
      height: 640,
    });
    this.camera.start();
  }

  stop() {
    if (this.camera) this.camera.stop();
  }

  _resizeCanvasToVideo() {
    const rect = this.video.getBoundingClientRect();
    if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }

  _handleResults(results) {
    this._resizeCanvasToVideo();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
    let state = {
      detected: false,
      cursor: null,       // {x, y} in overlay-canvas pixel space, mirror-corrected
      isPinching: false,
      isFist: false,
      pinchStarted: false,
      fistStarted: false,
    };

    if (hasHand) {
      const landmarks = results.multiHandLandmarks[0];

      // Mirror x so the overlay matches the mirrored (scaleX(-1)) video.
      ctx.save();
      ctx.translate(this.canvas.width, 0);
      ctx.scale(-1, 1);
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#f6c453', lineWidth: 3 });
      drawLandmarks(ctx, landmarks, { color: '#d97757', lineWidth: 1, radius: 3 });
      ctx.restore();

      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];

      const mirroredX = (1 - indexTip.x) * this.canvas.width;
      const y = indexTip.y * this.canvas.height;
      state.detected = true;
      state.cursor = { x: mirroredX, y };

      const pinchDist = dist2D(indexTip, thumbTip);
      state.isPinching = pinchDist < 0.06;

      state.isFist = isFistShape(landmarks);
    }

    state.pinchStarted = state.isPinching && !this.wasPinching;
    state.fistStarted = state.isFist && !this.wasFist;
    this.wasPinching = state.isPinching;
    this.wasFist = state.isFist;

    this.onUpdate(state);
  }
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * A fist is detected when the four non-thumb fingertips are all curled
 * in toward the palm (tip closer to the wrist than the corresponding
 * PIP joint is), which is a cheap and fairly reliable heuristic that
 * doesn't need 3D depth.
 */
function isFistShape(landmarks) {
  const wrist = landmarks[0];
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];

  let curledCount = 0;
  for (let i = 0; i < fingerTips.length; i++) {
    const tip = landmarks[fingerTips[i]];
    const pip = landmarks[fingerPips[i]];
    if (dist2D(tip, wrist) < dist2D(pip, wrist)) curledCount++;
  }
  return curledCount >= 3;
}
