// Main-thread wrapper around the decode worker. A frame is sent only while the worker is idle; otherwise it is dropped
// here without a copy and nothing is posted (R7.10, R7.11).
import type { DecodeMode, DecodeOutcome, SymbolErrorCode } from "@strip/symbols";
import type { FromWorker, ToWorker } from "./decode-protocol.ts";

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  terminate(): void;
}
export type DecodeClientInit = { wasmUrl: string; maxWidth: number; maxHeight: number; mode?: DecodeMode; maxSymbols?: number };
export class DecodeClientError extends Error {
  readonly code: SymbolErrorCode;
  constructor(code: SymbolErrorCode, message: string) {
    super(message);
    this.name = "DecodeClientError";
    this.code = code;
  }
}
export interface DecodeClient {
  /** Resolves when the worker reports ready; rejects with the worker's init error code. */
  readonly ready: Promise<void>;
  readonly idle: boolean;
  submitFrame(width: number, height: number, buffer: ArrayBuffer): Promise<DecodeOutcome>;
  submitBitmap(bitmap: ImageBitmap): Promise<DecodeOutcome>;
  terminate(): void;
}

export function createDecodeClient(worker: WorkerLike, init: DecodeClientInit): DecodeClient {
  let idle = false;
  let nextId = 1;
  const pending = new Map<number, { resolve: (o: DecodeOutcome) => void; reject: (e: Error) => void }>();
  let readyResolve!: () => void;
  let readyReject!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => {
    readyResolve = res;
    readyReject = rej;
  });
  ready.catch(() => undefined);
  worker.onmessage = (e) => {
    const m = e.data as FromWorker;
    if (m.type === "ready") {
      idle = true;
      readyResolve();
    } else if (m.type === "init-error") {
      readyReject(new DecodeClientError(m.code, m.message));
    } else {
      const p = pending.get(m.id);
      pending.delete(m.id);
      idle = true;
      if (m.type === "outcome") p?.resolve(m.outcome);
      else p?.reject(new DecodeClientError(m.code, m.message));
    }
  };
  const initMsg: ToWorker = { type: "init", wasmUrl: init.wasmUrl, maxWidth: init.maxWidth, maxHeight: init.maxHeight, mode: init.mode ?? "video", ...(init.maxSymbols === undefined ? {} : { maxSymbols: init.maxSymbols }) };
  worker.postMessage(initMsg);
  const send = (build: (id: number) => ToWorker, transfer: Transferable[]): Promise<DecodeOutcome> => {
    if (!idle) return Promise.resolve({ kind: "dropped" });
    idle = false;
    const id = nextId++;
    return new Promise<DecodeOutcome>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage(build(id), transfer);
    });
  };
  return {
    ready,
    get idle() {
      return idle;
    },
    submitFrame: (width, height, buffer) => send((id) => ({ type: "frame", id, width, height, buffer }), [buffer]),
    submitBitmap: (bitmap) => {
      if (!idle) bitmap.close(); // a dropped bitmap is released at once (R12.10)
      return send((id) => ({ type: "bitmap", id, bitmap }), [bitmap]);
    },
    terminate: () => worker.terminate(),
  };
}
