export interface Landmark {
  x: number;
  y: number;
  z: number;
}

function dist2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function isPinching(landmarks: Landmark[]): boolean {
  return dist2D(landmarks[4], landmarks[8]) < 0.06;
}

/**
 * A fist is detected when the four non-thumb fingertips are all curled in
 * toward the palm (tip closer to the wrist than the corresponding PIP
 * joint is) — a cheap heuristic that doesn't need 3D depth.
 */
export function isFistShape(landmarks: Landmark[]): boolean {
  const wrist = landmarks[0];
  const fingerTips = [8, 12, 16, 20];
  const fingerPips = [6, 10, 14, 18];

  let curledCount = 0;
  for (let i = 0; i < fingerTips.length; i++) {
    if (dist2D(landmarks[fingerTips[i]], wrist) < dist2D(landmarks[fingerPips[i]], wrist)) curledCount++;
  }
  return curledCount >= 3;
}
