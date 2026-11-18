// Container for /send/screen: the reducer, the player and the ticker drive the Stream board and its full-screen state (R3, R11).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { systemClock } from "../clock/index.js";
import { enterFullscreen, exitFullscreen, isSpaceTarget, prefersReducedMotion } from "../services/browser.js";
import { encodeFile, symbolOf } from "../services/paper-pages.js";
import { sendStore } from "../services/send-session.js";
import { createStreamPlayer, createTicker, type StreamPlayer, type Ticker } from "../services/stream-player.js";
import { formatSize } from "../state/format.js";
import { canPrev, initialStream, lapOf, reduceStream, type StreamEvent, type StreamUi } from "../state/stream.js";
import { FullScreenView } from "../views/FullScreenView.js";
import { StreamView, type StreamHandlers } from "../views/StreamView.js";
import { toFullScreenVM, toStreamVM } from "../views/stream-vm.js";
export function StreamScreen(): ReactNode {
  const file = sendStore.file();
  const [ui, setUi] = useState<StreamUi>(initialStream);
  const [packet, setPacket] = useState<Uint8Array | null>(null);
  const uiRef = useRef<StreamUi>(initialStream);
  const player = useRef<StreamPlayer | null>(null);
  const ticker = useRef<Ticker | null>(null);
  const dispatchRef = useRef<(ev: StreamEvent) => void>(() => undefined);
  dispatchRef.current = (ev) => {
    const before = uiRef.current;
    const r = reduceStream(before, ev);
    uiRef.current = r.state;
    setUi(r.state);
    const p = player.current;
    if (p) {
      if (ev.t === "MOUNT") setPacket(p.start());
      else if (r.state.n === before.n + 1) setPacket(p.advance());
      else if (r.state.n === before.n - 1) {
        const b = p.back();
        if (b) setPacket(b);
      }
    }
    for (const fx of r.effects) {
      if (fx === "START_TICKER") ticker.current?.start(r.state.fps);
      else if (fx === "STOP_TICKER") ticker.current?.stop();
      else if (typeof fx === "object" && fx.e === "FPS") ticker.current?.setFps(fx.fps);
      else if (typeof fx === "object" && fx.e === "FULLSCREEN") void (fx.on ? enterFullscreen() : exitFullscreen());
    }
  };
  const send = (ev: StreamEvent): void => dispatchRef.current(ev);
  useEffect(() => {
    if (file === null) return;
    let live = true;
    const tk = createTicker(systemClock, () => dispatchRef.current({ t: "TICK" }));
    ticker.current = tk;
    void encodeFile(file.bytes, file.name, file.mime).then((enc) => {
      if (!live) return;
      player.current = createStreamPlayer(enc);
      dispatchRef.current({ t: "MOUNT", reducedMotion: prefersReducedMotion() });
    });
    const onKey = (e: KeyboardEvent): void => {
      if (e.code === "Space" && isSpaceTarget(e.target as Element | null) && player.current) {
        e.preventDefault();
        dispatchRef.current({ t: "TOGGLE" });
      }
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") dispatchRef.current({ t: "HIDDEN" });
    };
    const onFullscreen = (): void => {
      if (!document.fullscreenElement && uiRef.current.fullScreen) dispatchRef.current({ t: "FULLSCREEN", on: false });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      live = false;
      tk.stop();
      player.current?.dispose();
      player.current = null;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("fullscreenchange", onFullscreen);
      void exitFullscreen();
    };
  }, [file]);
  const matrix = useMemo(() => (packet ? symbolOf(packet) : null), [packet]);
  if (file === null || matrix === null) {
    return (
      <div className="strip page">
        <Nav current="send" />
        <main className="wrap" />
      </div>
    );
  }
  const input = {
    mode: ui.mode,
    n: ui.n,
    k: file.costs.K,
    t: file.costs.T,
    lap: lapOf(ui.n, file.costs.T),
    fps: ui.fps,
    size: ui.size,
    canPrev: canPrev(ui),
    fileTag: `${file.name} · ${formatSize(file.bytes.length)}`,
    matrix,
  };
  if (ui.fullScreen) return <FullScreenView vm={toFullScreenVM(input)} onExit={() => send({ t: "FULLSCREEN", on: false })} />;
  const on: StreamHandlers = {
    toggle: () => send({ t: "TOGGLE" }),
    notice: () => send({ t: "NOTICE_BUTTON" }),
    next: () => send({ t: "NEXT" }),
    prev: () => send({ t: "PREV" }),
    fps: (value) => send({ t: "FPS", value }),
    size: (value) => send({ t: "SIZE", value }),
    fullScreen: () => send({ t: "FULLSCREEN", on: true }),
  };
  return <StreamView vm={toStreamVM(input)} on={on} />;
}
