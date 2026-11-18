// The Receive store: reducer state, the codec session and the image path. Effects run here; results come back as events (design (d)).
import { decodePacket } from "@strip/codec";
import { navigate } from "../app/router-store.js";
import { initialReceive, reduceReceive, type PushResult, type ReceiveEffect, type ReceiveEvent, type ReceiveState } from "../state/receive.js";
import type { DecodeClient } from "../workers/decode-client.js";
import { downloadFile } from "./download.js";
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
  setDecoderFactory(f: () => DecodeClient): void {
    decoderFactory = f;
    decoder = null;
  },
  dispatch(ev: ReceiveEvent, file?: File): void {
    if (ev.t === "ADD_PHOTO" && file) pendingFile = file;
    const r = reduceReceive(state, ev);
    state = r.state;
    for (const fx of r.effects) run(fx);
    for (const l of listeners) l();
  },
  reset(): void {
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
        });
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
          const first = next.sources()[0];
          void first;
          receiveStore.dispatch({ t: "REBUILT", gen, counters: p });
        });
        break;
      }
      case "OPEN_PICKER":
        document.querySelector<HTMLInputElement>('input[type="file"][accept^="image"]')?.click();
        break;
      case "REQUEST_CAMERA":
        // The live camera arrives in Group 3. Until then the camera path ends in the no-camera phase, which keeps photos usable.
        queueMicrotask(() => receiveStore.dispatch({ t: "CAMERA_FAIL", name: "NotFoundError" }));
        break;
      case "COPY_LINK":
        void navigator.clipboard?.writeText(location.href);
        break;
      case "RELOAD":
        location.reload();
        break;
      case "STOP_CAMERA":
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
async function readImage(gen: number, name: string): Promise<void> {
  const file = pendingFile;
  const id = nextPhotoId++;
  const fail = (panel: "imgread" | "nocode"): void => receiveStore.dispatch({ t: "PHOTO_FAILED", gen, panel, ctx: { imageName: name } });
  try {
    if (file === null) throw new ImageReadError();
    const bmp = await loadBitmap(file);
    decoder ??= decoderFactory();
    await decoder.ready;
    const symbols = symbolsOf(await decoder.submitBitmap(bmp));
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
