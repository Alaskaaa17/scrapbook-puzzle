import { drawWithFilter, type FilterId } from "./filters";

/** Resolves once the video has at least one decoded frame available to read. */
export function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 2) {
      resolve();
      return;
    }
    const check = () => {
      if (video.readyState >= 2) resolve();
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

/**
 * Crops the live (mirrored) video into a square canvas and returns a
 * JPEG data URL. When `filterId` is given, the crop is drawn through
 * that filter; otherwise it's copied as-is (used for the puzzle source
 * frame, which stays unfiltered until the final capture).
 */
export function captureSquareFrame(video: HTMLVideoElement, targetSize: number, filterId?: FilterId): string {
  const vw = video.videoWidth || targetSize;
  const vh = video.videoHeight || targetSize;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;

  const off = document.createElement("canvas");
  off.width = targetSize;
  off.height = targetSize;
  const ctx = off.getContext("2d")!;

  // Mirror horizontally so the capture matches what the user sees on screen.
  ctx.save();
  ctx.translate(targetSize, 0);
  ctx.scale(-1, 1);

  if (filterId) {
    const cropped = document.createElement("canvas");
    cropped.width = side;
    cropped.height = side;
    cropped.getContext("2d")!.drawImage(video, sx, sy, side, side, 0, 0, side, side);
    drawWithFilter(ctx, cropped, targetSize, targetSize, filterId);
  } else {
    ctx.drawImage(video, sx, sy, side, side, 0, 0, targetSize, targetSize);
  }
  ctx.restore();
  return off.toDataURL("image/jpeg", 0.92);
}
