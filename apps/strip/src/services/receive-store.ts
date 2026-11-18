// The Receive store: reducer state, the codec session and the image path. Effects run here; results come back as events (design (d)).
import { decodePacket } from "@strip/codec";
import { navigate } from "../app/router-store.js";
import { systemClock, type Clock } from "../clock/index.js";
import { REPEAT_HOLD_MS, VERIFY_SLOW_MS } from "../limits.js";
import { nextDeadline } from "../state/receive-timers.js";
import { initialReceive, reduceReceive, type PushResult, type ReceiveEffect, type ReceiveEvent, type ReceiveState } from "../state/receive.js";
import type { DecodeClient } from "../workers/decode-client.js";
import { openCamera, setTorch, stopStream, type StreamLike } from "./camera.js";
import { downloadFile } from "./download.js";
import { fitCamera, startFrameLoop, type FrameLoop } from "./frame-loop.js";
import { createImageDecoder, ImageReadError, loadBitmap } from "./image-intake.js";
import { createReceiveSession, type ReceiveSession } from "./receive-session.js";
const listeners = new Set<() => void>();
let state: ReceiveState = initialReceive;
let session: ReceiveSession = createReceiveSession(0);
let decoder: DecodeClient | null = null;
let nextPhotoId = 1;
let pendingFile: File | null = null;
let removeId = -1;
let received: { bytes: Uint8Array; name: string; mime: string } | null = null;
let clock: Clock = systemClock;
let opener: typeof openCamera = openCamera;
let stream: StreamLike | null = null;
let loop: FrameLoop | null = null;
let video: HTMLVideoElement | null = null;
let deadlineId: number | null = null;
let repeatId: number | null = null;
let torchOn = false;
let held: { id: number; name: string; packets: Uint8Array[] } | null = null;
/** Test seam: replaces the worker-backed decoder. */
let decoderFactory: () => DecodeClient = createImageDecoder;
export const receiveStore = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  getState: (): ReceiveState => state,
  session: (): ReceiveSession => session,
  received: (): { bytes: Uint8Array; name: string; mime: string } | null => received,
  now: (): number => clock.now(),
  /** Test seam: replaces getUserMedia. */
  setCameraOpener(f: typeof openCamera): void {
    opener = f;
  },
  setClock(c: Clock): void {
    clock = c;
  },
  /** The <video> of the viewfinder: attached when it mounts, detached (null) when it unmounts. */
  attachVideo(el: HTMLVideoElement | null): void {
    video = el;
    if (el && stream) bindVideo(el);
  },
  async torch(): Promise<void> {
    torchOn = await setTorch(stream, !torchOn) ? !torchOn : torchOn;
  },
  /** Leaving the route releases the camera (R12.18). */
  leave(): void {
    const p = state.phase;
    if (p === "scan" || p === "repeat" || p === "dup") receiveStore.dispatch({ t: "STOP" });
    else stopCamera();
  },
  setDecoderFactory(f: () => DecodeClient): void {
    decoderFactory = f;
    decoder = null;
  },
  dispatch(ev: ReceiveEvent, file?: File): void {
    if (ev.t === "ADD_PHOTO" && file) pendingFile = file;
    const r = reduceReceive(state, ev);
    state = r.state;
    for (const fx of r.effects) run(fx);
    armDeadline();
    for (const l of listeners) l();
  },
  reset(): void {
    stopCamera();
    decoder?.terminate();
    decoder = null;
    state = initialReceive;
    session = createReceiveSession(0);
    received = null;
    held = null;
    pendingFile = null;
    for (const l of listeners) l();
  },
};
function run(fx: ReceiveEffect): void {
  if (typeof fx === "string") {
    switch (fx) {
      case "NEW_SESSION":
        session = createReceiveSession(state.gen);
        received = null;
        break;
      case "READ_RESULT": {
        const gen = state.gen;
        void session.result().then((r) => {
          received = { bytes: r.bytes, name: r.name, mime: r.mime };
          receiveStore.dispatch({ t: "RESULT", gen, result: { name: r.name, mime: r.mime, size: r.size, hash12: r.hash12 } });
        }).catch(() => undefined); // a complete decoder always has a result; a test double may not
        break;
      }
      case "DOWNLOAD_FILE":
        if (received) downloadFile(received.bytes, received.name, received.mime);
        break;
      case "REBUILD_SESSION": {
        const gen = state.gen;
        void session.rebuildWithout(removeId, gen).then((next) => {
          if (gen !== state.gen) return;
          session = next;
          const p = next.progress();
          receiveStore.dispatch({ t: "REBUILT", gen, counters: p, seen: next.sources().length });
        });
        break;
      }
      case "OPEN_PICKER":
        document.querySelector<HTMLInputElement>('input[type="file"][accept^="image"]')?.click();
        break;
      case "REQUEST_CAMERA":
        void startCamera();
        break;
      case "ARM_REPEAT_HOLD": {
        if (repeatId !== null) clock.clearTimeout(repeatId);
        const gen = state.gen;
        repeatId = clock.setTimeout(() => receiveStore.dispatch({ t: "REPEAT_EXPIRED", gen }), REPEAT_HOLD_MS);
        break;
      }
      case "COPY_LINK":
        void navigator.clipboard?.writeText(location.href);
        break;
      case "RELOAD":
        location.reload();
        break;
      case "STOP_CAMERA":
        stopCamera();
        break;
    }
    return;
  }
  switch (fx.e) {
    case "NAVIGATE":
      navigate(fx.to);
      break;
    case "REMOVE_PHOTO":
      removeId = fx.id;
      break;
    case "START_IMAGE":
      void readImage(fx.gen, fx.name);
      break;
    case "ADOPT_PENDING":
      void adopt(state.gen);
      break;
    case "DISCARD_PENDING":
      held = null;
      break;
  }
}
const symbolsOf = (o: Awaited<ReturnType<DecodeClient["submitBitmap"]>>): Uint8Array[] => (o.kind === "found" ? [o.bytes] : o.kind === "found_many" ? o.symbols.map((x) => x.bytes) : []);
async function push(gen: number, bytes: Uint8Array, photo: number): Promise<PushResult> {
  const p = await session.push(bytes, { photo });
  receiveStore.dispatch({ t: "PUSHED", gen, source: { photo }, result: p.result, ...(p.sessionOf === undefined ? {} : { sessionOf: p.sessionOf }) });
  return p.result;
}
/** One re-armed timer for the earliest stall or nothing deadline while the camera is on (R12.19 to R12.21). */
function armDeadline(): void {
  if (deadlineId !== null) clock.clearTimeout(deadlineId);
  deadlineId = null;
  if (!state.cameraOn || state.panel) return;
  const d = nextDeadline(state.t);
  if (d === null) return;
  deadlineId = clock.setTimeout(() => {
    deadlineId = null;
    receiveStore.dispatch({ t: "TIMER", at: clock.now() });
  }, Math.max(0, d - clock.now()));
}
async function startCamera(): Promise<void> {
  const r = await opener();
  if (!r.ok) {
    receiveStore.dispatch(r.name === "API_MISSING" ? { t: "CAMERA_API_MISSING" } : { t: "CAMERA_FAIL", name: r.name });
    return;
  }
  stream = r.stream;
  if (state.phase !== "ask") {
    stopCamera(); // the request was cancelled while the permission prompt was open
    return;
  }
  receiveStore.dispatch({ t: "CAMERA_OK", torch: r.torch, at: clock.now() });
  if (video) bindVideo(video);
}
function bindVideo(el: HTMLVideoElement): void {
  if (!stream || loop) return;
  el.srcObject = stream as unknown as MediaStream;
  void el.play().catch(() => undefined);
  decoder ??= decoderFactory();
  const client = decoder;
  loop = startFrameLoop(el, {
    client,
    makeBitmap: (v) => {
      const s = fitCamera(v.videoWidth, v.videoHeight);
      return createImageBitmap(el, { resizeWidth: s.width, resizeHeight: s.height });
    },
    onOutcome: (o) => void onCameraOutcome(o),
    raf: (cb) => requestAnimationFrame(cb),
    cancelRaf: (id) => cancelAnimationFrame(id),
    visible: () => document.visibilityState === "visible",
  });
}
async function onCameraOutcome(o: Awaited<ReturnType<DecodeClient["submitBitmap"]>>): Promise<void> {
  const symbols = symbolsOf(o);
  if (symbols.length === 0) return;
  const gen = state.gen;
  receiveStore.dispatch({ t: "FOUND", at: clock.now() });
  for (const b of symbols) {
    // A push pending for more than VERIFY_SLOW_MS is the hash verification: show `verify` (Resolved question 28).
    const slow = clock.setTimeout(() => receiveStore.dispatch({ t: "PUSH_SLOW", gen }), VERIFY_SLOW_MS);
    const p = await session.push(b, "camera");
    clock.clearTimeout(slow);
    receiveStore.dispatch({ t: "PUSHED", gen, source: "camera", result: p.result, at: clock.now(), ...(p.sessionOf === undefined ? {} : { sessionOf: p.sessionOf }) });
  }
}
function stopCamera(): void {
  loop?.stop();
  loop = null;
  stopStream(stream);
  stream = null;
  torchOn = false;
  if (video) video.srcObject = null;
}
async function readImage(gen: number, name: string): Promise<void> {
  const file = pendingFile;
  const id = nextPhotoId++;
  const fail = (panel: "imgread" | "nocode"): void => receiveStore.dispatch({ t: "PHOTO_FAILED", gen, panel, ctx: { imageName: name } });
  try {
    if (file === null) throw new ImageReadError();
    const bmp = await loadBitmap(file);
    decoder ??= decoderFactory();
    await decoder.ready;
    const symbols = symbolsOf(await decoder.submitBitmap(bmp, "image"));
    if (gen !== state.gen) return;
    const valid = symbols.filter((b) => {
      try {
        decodePacket(b);
        return true;
      } catch {
        return false;
      }
    });
    if (valid.length === 0) return fail("nocode");
    const results: PushResult[] = [];
    const mine: Uint8Array[] = [];
    for (const b of valid) {
      const r = await push(gen, b, id);
      results.push(r);
      mine.push(b);
      if (r.k === "rejected" && r.code === "HASH_MISMATCH") break;
    }
    if (results.some((r) => r.k === "ignored" && r.reason === "SESSION_MISMATCH")) {
      held = { id, name, packets: mine };
      receiveStore.dispatch({ t: "PHOTO_DONE", gen, row: null });
      return;
    }
    if (results.every((r) => r.k === "rejected")) return fail("nocode");
    receiveStore.dispatch({ t: "PHOTO_DONE", gen, row: { id, name, found: valid.length } });
  } catch (e) {
    if (gen === state.gen) fail(e instanceof ImageReadError ? "imgread" : "imgread");
  }
}
/** "Start over" on the other-file panel: the held photo's Packets feed the new session and add its row. */
async function adopt(gen: number): Promise<void> {
  const h = held;
  held = null;
  if (!h) return;
  for (const b of h.packets) await push(gen, b, h.id);
  receiveStore.dispatch({ t: "PHOTO_DONE", gen, row: { id: h.id, name: h.name, found: h.packets.length } });
}
