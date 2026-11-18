// The Sender_File and the Send step 1 state: memory only, never persisted (R8.6, R16). A store for useSyncExternalStore.
import { sha256WebCrypto, CodecError } from "@strip/codec";
import { PER_PAGE } from "../limits.js";
import { encodeFile } from "./paper-pages.js";
import { toHex } from "../state/format.js";
import { initialSendState, reduceSend, type FileMeta, type SendCosts, type SendEffect, type SendEvent, type SendStepState } from "../state/send-step.js";
export interface SenderFile {
  bytes: Uint8Array;
  name: string;
  mime: string;
  costs: SendCosts;
}
const listeners = new Set<() => void>();
let state: SendStepState = initialSendState;
let sender: SenderFile | null = null;
let navigate: (to: string) => void = () => undefined;
let pending: File | null = null;
const emit = (): void => {
  for (const l of listeners) l();
};
export const sendStore = {
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  getState: (): SendStepState => state,
  /** The Sender_File, present only while the stage is `chosen`. */
  file: (): SenderFile | null => sender,
  setNavigator(f: (to: string) => void): void {
    navigate = f;
  },
  dispatch(ev: SendEvent, file?: File): void {
    if (ev.t === "PICK" && file) pending = file;
    const r = reduceSend(state, ev);
    state = r.state;
    for (const fx of r.effects) run(fx);
    emit();
  },
  /** Test and teardown helper: back to the initial state. */
  reset(): void {
    state = initialSendState;
    sender = null;
    pending = null;
    emit();
  },
};
function run(fx: SendEffect): void {
  if (fx.e === "DROP_BYTES") {
    sender = null;
    pending = null;
  } else if (fx.e === "NAVIGATE") navigate(fx.to);
  else void readAndEncode(fx.gen, fx.meta);
}
/** Maps a thrown codec error to the panel kind of R9.4 and R9.7. */
export function failurePanel(e: unknown): "size" | "internal" {
  return e instanceof CodecError && (e.code === "PAYLOAD_TOO_LARGE" || e.code === "TOO_MANY_BLOCKS") ? "size" : "internal";
}
async function readAndEncode(gen: number, meta: FileMeta): Promise<void> {
  const file = pending;
  try {
    if (file === null) throw new Error("no file");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await sha256WebCrypto(bytes);
    const enc = await encodeFile(bytes, meta.name, meta.mime);
    const T = enc.page().length;
    const costs: SendCosts = { K: enc.K, T, N: Math.ceil(T / PER_PAGE), hash12: toHex(hash).slice(0, 12), sessionId: enc.sessionId };
    if (gen !== state.gen) return; // a newer pick or a removal won
    sender = { bytes, name: meta.name, mime: meta.mime, costs };
    sendStore.dispatch({ t: "READ_DONE", gen, meta, costs });
  } catch (e) {
    if (gen === state.gen) sendStore.dispatch({ t: "READ_FAILED", gen, panel: failurePanel(e) });
  }
}
