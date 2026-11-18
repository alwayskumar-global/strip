// Camera access (R12.1, R12.16 to R12.18). The only caller of getUserMedia; nothing is recorded, stored or sent.
export interface TrackLike {
  stop(): void;
  getCapabilities?(): { torch?: boolean };
  applyConstraints?(c: unknown): Promise<void>;
}
export interface StreamLike {
  getTracks(): TrackLike[];
  getVideoTracks(): TrackLike[];
}
export interface MediaDevicesLike {
  getUserMedia?(c: unknown): Promise<StreamLike>;
}
export type CameraResult = { ok: true; stream: StreamLike; torch: boolean } | { ok: false; name: string };
/** The constraints of R12.1: the rear camera at up to 1920 x 1080, no audio. */
export const CAMERA_CONSTRAINTS = { video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false } as const;
/** Opens the camera. A failure is reported by its error name ("API_MISSING" when there is no getUserMedia); the message never leaves here. */
export async function openCamera(md: MediaDevicesLike | undefined = typeof navigator === "undefined" ? undefined : (navigator.mediaDevices as unknown as MediaDevicesLike | undefined)): Promise<CameraResult> {
  if (!md || typeof md.getUserMedia !== "function") return { ok: false, name: "API_MISSING" };
  try {
    const stream = await md.getUserMedia(CAMERA_CONSTRAINTS);
    const track = stream.getVideoTracks()[0];
    const torch = track?.getCapabilities?.().torch === true;
    return { ok: true, stream, torch };
  } catch (e) {
    return { ok: false, name: e instanceof Error || (typeof e === "object" && e !== null && "name" in e) ? String((e as { name: unknown }).name) : "Unknown" };
  }
}
/** Stops every track: the camera light goes off (R12.18). Safe to call twice. */
export function stopStream(stream: StreamLike | null | undefined): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
}
export async function setTorch(stream: StreamLike | null, on: boolean): Promise<boolean> {
  const t = stream?.getVideoTracks()[0];
  if (!t?.applyConstraints || t.getCapabilities?.().torch !== true) return false;
  try {
    await t.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}
