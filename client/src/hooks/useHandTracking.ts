import { useEffect, useRef, useState, type RefObject } from "react";
import { isFistShape, isPinching, type Landmark } from "@/lib/handGestures";

export interface HandFrameState {
  detected: boolean;
  /** Index-fingertip position in overlay-canvas pixel space, mirror-corrected. */
  cursor: { x: number; y: number } | null;
  /** Same point normalized to [0,1] x [0,1], independent of any element's layout. */
  cursorFraction: { x: number; y: number } | null;
  isPinching: boolean;
  isFist: boolean;
  pinchStarted: boolean;
  fistStarted: boolean;
}

interface UseHandTrackingOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  onFrame: (state: HandFrameState) => void;
}

const HANDS_VERSION = "0.4.1675469240";

// Consecutive detected-hand frames a raw pinch/fist reading must hold before
// it counts as "confirmed" — filters single-frame model noise (e.g. a
// relaxed hand briefly reading as a pinch) so a stray flicker can't slide a
// tile or confirm a capture on its own.
const REQUIRED_STABLE_FRAMES = 4;
// Minimum gap between two triggered gestures, regardless of how fast the
// model reports frames — stops a held pinch/fist from firing repeatedly if
// detection flickers in and out right at the confirm boundary.
const GESTURE_COOLDOWN_MS = 450;

/** Debounces a noisy per-frame boolean into a stable "confirmed" state. */
function createGestureDebouncer(requiredFrames: number) {
  let streak = 0;
  let confirmed = false;
  return {
    /** Feed one detected-hand frame's raw reading; returns true on the frame it becomes confirmed. */
    update(raw: boolean): boolean {
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
 * Wraps the globally-loaded MediaPipe Hands (from the CDN <script> tags in
 * index.html): runs detection against a video element, draws the skeletal
 * overlay on a canvas, and derives edge-triggered pinch/fist events so the
 * caller doesn't have to debounce per-frame state itself.
 */
export function useHandTracking({ videoRef, overlayCanvasRef, enabled, onFrame }: UseHandTrackingOptions) {
  const [status, setStatus] = useState("waiting for camera");
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    const canvas = overlayCanvasRef.current;
    if (!video || !canvas) return;

    const win = window as unknown as {
      Hands?: new (config: { locateFile: (file: string) => string }) => any;
      drawConnectors?: (...args: any[]) => void;
      drawLandmarks?: (...args: any[]) => void;
      HAND_CONNECTIONS?: unknown;
    };

    if (!win.Hands) {
      setStatus("demo mode · gesture library unavailable");
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let wasDetected = false;
    let cooldownUntil = 0;
    const pinchDebounce = createGestureDebouncer(REQUIRED_STABLE_FRAMES);
    const fistDebounce = createGestureDebouncer(REQUIRED_STABLE_FRAMES);

    const ctx = canvas.getContext("2d")!;
    const hands = new win.Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@${HANDS_VERSION}/${file}`,
    });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

    hands.onResults((results: { multiHandLandmarks?: Landmark[][] }) => {
      if (cancelled) return;
      const rect = video.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarksList = results.multiHandLandmarks;
      const hasHand = !!landmarksList && landmarksList.length > 0;

      const state: HandFrameState = {
        detected: false,
        cursor: null,
        cursorFraction: null,
        isPinching: false,
        isFist: false,
        pinchStarted: false,
        fistStarted: false,
      };

      if (hasHand) {
        const landmarks = landmarksList[0];
        if (win.drawConnectors && win.drawLandmarks && win.HAND_CONNECTIONS) {
          // Mirror x so the overlay matches the mirrored (scaleX(-1)) video.
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          win.drawConnectors(ctx, landmarks, win.HAND_CONNECTIONS, { color: "#e96f5b", lineWidth: 3 });
          win.drawLandmarks(ctx, landmarks, { color: "#1d2528", lineWidth: 1, radius: 3 });
          ctx.restore();
        }

        const indexTip = landmarks[8];
        state.detected = true;
        state.cursor = { x: (1 - indexTip.x) * canvas.width, y: indexTip.y * canvas.height };
        state.cursorFraction = { x: 1 - indexTip.x, y: indexTip.y };

        const pinchJustConfirmed = pinchDebounce.update(isPinching(landmarks));
        const fistJustConfirmed = fistDebounce.update(isFistShape(landmarks));
        state.isPinching = pinchDebounce.isConfirmed;
        state.isFist = fistDebounce.isConfirmed;

        const now = performance.now();
        const offCooldown = now >= cooldownUntil;
        state.pinchStarted = pinchJustConfirmed && offCooldown;
        state.fistStarted = fistJustConfirmed && offCooldown && !state.pinchStarted;
        if (state.pinchStarted || state.fistStarted) cooldownUntil = now + GESTURE_COOLDOWN_MS;
      }

      if (state.detected !== wasDetected) {
        wasDetected = state.detected;
        setStatus(state.detected ? "hand detected · pinch to move" : "waiting for a hand");
      }

      onFrameRef.current(state);
    });

    const tick = async () => {
      if (cancelled) return;
      try {
        if (video.readyState === 4) await hands.send({ image: video });
      } catch {
        // Transient decode/model errors are ignored; the next frame retries.
      }
      frameId = requestAnimationFrame(tick);
    };
    setStatus("camera ready · show your hand");
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      hands.close?.();
    };
  }, [enabled, videoRef, overlayCanvasRef]);

  return { status };
}
