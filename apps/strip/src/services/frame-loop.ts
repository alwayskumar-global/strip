// Frame_Loop (R12.2 to R12.4, R12.15): a video frame becomes an ImageBitmap that goes to the worker; a frame that arrives
// while the worker is busy is dropped without a copy. One decode in flight; the loop never queues.
import type { DecodeOutcome } from "@strip/symbols";
export interface VideoLike {
  videoWidth: number;
  videoHeight: number;
  requestVideoFrameCallback?(cb: () => void): number;
  cancelVideoFrameCallback?(id: number): void;
}
export interface LoopClient {
  readonly idle: boolean;
  submitBitmap(bitmap: ImageBitmap, channel?: "camera" | "image"): Promise<DecodeOutcome>;
}
export interface LoopDeps {
  client: LoopClient;
  /** createImageBitmap(video, resize to fit 1920 x 1080, never up). */
  makeBitmap(video: VideoLike): Promise<ImageBitmap>;
  onOutcome(o: DecodeOutcome): void;
  onError?(e: unknown): void;
  /** requestAnimationFrame fallback when the video has no requestVideoFrameCallback. */
  raf(cb: () => void): number;
  cancelRaf(id: number): void;
  visible(): boolean;
}
export interface FrameLoop {
  stop(): void;
}
/** Size to fit 1920 x 1080 without ever scaling up. */
export function fitCamera(w: number, h: number): { width: number; height: number } {
  const k = Math.min(1, 1920 / w, 1080 / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}
export function startFrameLoop(video: VideoLike, d: LoopDeps): FrameLoop {
  let stopped = false;
  let handle = 0;
  const schedule = (): void => {
    if (stopped) return;
    handle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(tick) : d.raf(tick);
  };
  const tick = (): void => {
    if (stopped) return;
    schedule();
    if (!d.client.idle || !d.visible() || video.videoWidth === 0) return; // busy or hidden: drop, no bitmap is created
    void d
      .makeBitmap(video)
      .then(async (bmp) => {
        if (stopped || !d.client.idle) {
          bmp.close(); // the worker became busy meanwhile: drop without a copy
          return;
        }
        d.onOutcome(await d.client.submitBitmap(bmp, "camera"));
      })
      .catch((e: unknown) => d.onError?.(e));
  };
  schedule();
  return {
    stop(): void {
      stopped = true;
      if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(handle);
      else d.cancelRaf(handle);
    },
  };
}
