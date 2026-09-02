import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Per spec: gesture must hold stable for ~8 frames, and can't refire within 1.5s.
const STABLE_FRAMES = 8;
const COOLDOWN_MS = 1500;
// multiHandedness's score is the model's confidence this is a real hand
// (not just something detection-confidence-shaped) — a cheap second filter
// against false positives on non-hand regions.
const HANDEDNESS_MIN_SCORE = 0.85;
// World-landmark distances are metric (meters, hand-scale), not frame-normalized,
// so this threshold doesn't need re-tuning per camera distance the way a
// normalized-coordinate threshold would.
const PINCH_THRESHOLD_M = 0.045;

/** Standard 21-point MediaPipe hand topology, for drawing the skeleton overlay. */
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function dist3D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function computeIsPinching(world) {
  return dist3D(world[4], world[8]) < PINCH_THRESHOLD_M;
}

function computeIsFist(world) {
  const wrist = world[0];
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  return tips.every((tip, i) => dist3D(world[tip], wrist) < dist3D(world[pips[i]], wrist));
}

/** Debounces a noisy per-frame boolean into a stable "confirmed" state. */
function createDebouncer(requiredFrames) {
  let streak = 0;
  let confirmed = false;
  return {
    update(raw) {
      streak = raw ? Math.min(requiredFrames, streak + 1) : 0;
      const wasConfirmed = confirmed;
      confirmed = streak >= requiredFrames;
      return confirmed && !wasConfirmed;
    },
    get isConfirmed() {
      return confirmed;
    },
  };
}

/**
 * Wraps MediaPipe Tasks Vision's HandLandmarker: loads the model, runs
 * per-frame detection, and derives debounced pinch/fist edge events plus
 * the raw landmarks needed to draw the skeleton and drive the puzzle.
 */
export class GestureTracker {
  constructor() {
    this.landmarker = null;
    this.ready = false;
    this.pinchDebounce = createDebouncer(STABLE_FRAMES);
    this.fistDebounce = createDebouncer(STABLE_FRAMES);
    this.cooldownUntil = 0;
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const baseOptions = { modelAssetPath: MODEL_URL };
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.75,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
    } catch {
      // Some browsers/devices reject the WebGL delegate; CPU still works.
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { ...baseOptions, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.75,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
    }
    this.ready = true;
  }

  /** Runs detection for one video frame; returns a GestureFrame (never null). */
  detect(video, timestampMs) {
    const empty = {
      detected: false,
      landmarks: null,
      landmarksList: [],
      cursor: null,
      pinchPoint: null,
      isPinching: false,
      isFist: false,
      pinchStarted: false,
      fistStarted: false,
    };
    if (!this.ready) return empty;

    const result = this.landmarker.detectForVideo(video, timestampMs);
    const handCount = result.landmarks?.length ?? 0;

    // Either hand can drive gestures — collect every hand that clears the
    // handedness-confidence gate (not just the first one MediaPipe returns).
    const validHands = [];
    for (let i = 0; i < handCount; i++) {
      const score = result.handednesses?.[i]?.[0]?.score ?? 0;
      if (score >= HANDEDNESS_MIN_SCORE && result.worldLandmarks?.[i]) {
        validHands.push({ landmarks: result.landmarks[i], world: result.worldLandmarks[i] });
      }
    }
    if (validHands.length === 0) {
      // No confident hand this frame: don't touch the debouncers (a brief
      // dropout for one hand shouldn't erode a still-held gesture on the
      // other), just report nothing detected.
      return empty;
    }

    const rawPinchPerHand = validHands.map((h) => computeIsPinching(h.world));
    const rawFistPerHand = validHands.map((h) => computeIsFist(h.world));
    const pinchJustConfirmed = this.pinchDebounce.update(rawPinchPerHand.some(Boolean));
    const fistJustConfirmed = this.fistDebounce.update(rawFistPerHand.some(Boolean));

    const now = performance.now();
    const offCooldown = now >= this.cooldownUntil;
    const pinchStarted = pinchJustConfirmed && offCooldown;
    const fistStarted = fistJustConfirmed && offCooldown && !pinchStarted;
    if (pinchStarted || fistStarted) this.cooldownUntil = now + COOLDOWN_MS;

    // Whichever hand is actually pinching drives the cursor/drag point, so a
    // mid-drag switch of hands doesn't snap the tile to a different hand.
    const activeIndex = rawPinchPerHand.findIndex(Boolean);
    const active = validHands[activeIndex >= 0 ? activeIndex : 0];

    return {
      detected: true,
      landmarks: active.landmarks,
      landmarksList: validHands.map((h) => h.landmarks),
      cursor: { x: active.landmarks[9].x, y: active.landmarks[9].y },
      pinchPoint: { x: (active.landmarks[4].x + active.landmarks[8].x) / 2, y: (active.landmarks[4].y + active.landmarks[8].y) / 2 },
      isPinching: this.pinchDebounce.isConfirmed,
      isFist: this.fistDebounce.isConfirmed,
      pinchStarted,
      fistStarted,
    };
  }
}
