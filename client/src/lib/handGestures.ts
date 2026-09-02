export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * 3D distance, not just the x/y screen-plane distance. A hand reaching
 * toward the camera foreshortens in 2D — fingertips can appear to bunch up
 * near the wrist even fully extended — so relying on x/y alone made an
 * ordinary "reach toward the webcam" read as a pinch or a fist. MediaPipe's
 * z (relative depth) tells extended-but-foreshortened apart from actually
 * curled/pinched.
 */
function dist3D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function isPinching(landmarks: Landmark[]): boolean {
  return dist3D(landmarks[4], landmarks[8]) < 0.055;
}

/**
 * A fist is detected when all four non-thumb fingertips are curled in
 * toward the palm (tip closer to the wrist than the corresponding PIP
 * joint is, in 3D).
 */
export function isFistShape(landmarks: Landmark[]): boolean {
  const wrist = landmarks[0];
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];

  let curledCount = 0;
  for (let i = 0; i < fingerTips.length; i++) {
    if (dist3D(landmarks[fingerTips[i]], wrist) < dist3D(landmarks[fingerPips[i]], wrist)) curledCount++;
  }
  return curledCount === fingerTips.length;
}
