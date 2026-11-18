// The stream player and ticker (R11.1 to R11.7, R11.13). The player is pure: no clock. Only the ticker schedules, and it takes a Clock.
import type { Clock } from "../clock/index.js";
import { STEP_HISTORY } from "../limits.js";
export interface EncoderLike {
  next(): Uint8Array;
}
export interface StreamPlayer {
  /** Packet 1 (sequence 0). */
  start(): Uint8Array;
  /** The next Packet: from the history when stepping forward after Previous, else a new `encoder.next()`. */
  advance(): Uint8Array;
  /** The previous Packet while it is still in the last STEP_HISTORY Packets, else null. */
  back(): Uint8Array | null;
  /** Index of the Packet shown, 0-based. */
  readonly shown: number;
  readonly produced: number;
  readonly canPrev: boolean;
  dispose(): void;
}
export function createStreamPlayer(encoder: EncoderLike, history: number = STEP_HISTORY): StreamPlayer {
  let buf: Uint8Array[] = [];
  let base = 0; // index of buf[0]
  let shown = -1;
  const produce = (): Uint8Array => {
    const p = encoder.next();
    buf.push(p);
    if (buf.length > history) {
      buf.shift();
      base++;
    }
    return p;
  };
  const at = (i: number): Uint8Array => buf[i - base] as Uint8Array;
  return {
    start() {
      shown = 0;
      return produce();
    },
    advance() {
      if (shown < base + buf.length - 1) {
        shown++;
        return at(shown);
      }
      const p = produce();
      shown = base + buf.length - 1;
      return p;
    },
    back() {
      if (shown - 1 < base) return null;
      shown--;
      return at(shown);
    },
    get shown() {
      return shown;
    },
    get produced() {
      return base + buf.length;
    },
    get canPrev() {
      return shown - 1 >= base;
    },
    dispose() {
      buf = [];
    },
  };
}
export interface Ticker {
  start(fps: number): void;
  setFps(fps: number): void;
  stop(): void;
}
/** Fires `onTick` every 1000 / fps ms on the Clock, with a drift-free deadline; a changed fps applies from the next tick. */
export function createTicker(clock: Clock, onTick: () => void): Ticker {
  let interval = 125;
  let deadline = 0;
  let id: number | null = null;
  let running = false;
  const arm = (): void => {
    id = clock.setTimeout(fire, Math.max(0, deadline - clock.now()));
  };
  const fire = (): void => {
    id = null;
    if (!running) return;
    onTick();
    deadline += interval;
    if (running) arm();
  };
  return {
    start(fps) {
      this.stop();
      interval = 1000 / fps;
      running = true;
      deadline = clock.now() + interval;
      arm();
    },
    setFps(fps) {
      interval = 1000 / fps;
    },
    stop() {
      running = false;
      if (id !== null) clock.clearTimeout(id);
      id = null;
    },
  };
}
