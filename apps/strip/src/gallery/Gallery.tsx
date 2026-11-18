// Harness-only gallery: one route per board instance under /__gallery/*, rendered with fixtures (design: Gallery routes).
// Never part of the production bundle: App.tsx imports this module behind `if (__STRIP_GALLERY__)`.
import { useEffect, useState, type ReactNode } from "react";
import { decodePacket } from "@strip/codec";
import { decodeFrame } from "@strip/symbols";
import { Symbol } from "../components/Symbol.js";
import { wasmSource } from "../symbols-wasm.js";
import { SendView } from "../views/SendView.js";
import { toSendVM } from "../views/send-vm.js";
import { BAD_FACTS, FILE_FACTS, isSendStage } from "../views/send-fixtures.js";
import { FullScreenView } from "../views/FullScreenView.js";
import { StreamView } from "../views/StreamView.js";
import { isStreamMode, streamInput } from "../views/stream-fixtures.js";
import { toFullScreenVM, toStreamVM } from "../views/stream-vm.js";
import { ReceivePage } from "../views/ReceivePage.js";
import { ReceiveView } from "../views/ReceiveView.js";
import { isReceivePhase, receiveInput } from "../views/receive-fixtures.js";
import { toReceiveVM } from "../views/receive-vm.js";
import { AboutView } from "../views/AboutView.js";
import { toAboutVM } from "../views/about-vm.js";
import { ErrorPanel } from "../views/ErrorPanel.js";
import { ErrorsAllView } from "../views/ErrorsAllView.js";
import { ErrorsView } from "../views/ErrorsView.js";
import { ERROR_KINDS, toErrorVM, toErrorsVM, type ErrorKind } from "../views/error-vm.js";
import { sampleSymbols } from "../services/sample-file.js";
import { PaperView } from "../views/PaperView.js";
import { isPaperSize, paperInput } from "../views/paper-fixtures.js";
import { toPaperVM } from "../views/paper-vm.js";
import type { SymbolMatrix } from "@strip/symbols";
import { specimens, type Specimen } from "./fixtures.js";

/** One real symbol for the boards that show a single code. */
function useMatrix(): SymbolMatrix | null {
  const [m, setM] = useState<SymbolMatrix | null>(null);
  useEffect(() => {
    void sampleSymbols(1).then((s) => setM(s[0]?.matrix ?? null));
  }, []);
  return m;
}
function Receive({ p, page }: { p: URLSearchParams; page: boolean }): ReactNode {
  const matrix = useMatrix();
  const phase = p.get("phase");
  if (matrix === null) return null;
  const vm = toReceiveVM(receiveInput(page ? "scan" : isReceivePhase(phase) ? phase : "scan", matrix));
  return page ? <ReceivePage vm={vm} /> : <ReceiveView vm={vm} />;
}
function Paper({ p }: { p: URLSearchParams }): ReactNode {
  const [ms, setMs] = useState<SymbolMatrix[]>([]);
  useEffect(() => {
    void sampleSymbols(9).then((s) => setMs(s.map((x) => x.matrix)));
  }, []);
  const size = p.get("size");
  if (ms.length === 0) return null;
  return <PaperView vm={toPaperVM(paperInput(isPaperSize(size) ? size : "a4", ms, mobileClass(p, "page--m")))} />;
}
function Stream({ p, full }: { p: URLSearchParams; full: boolean }): ReactNode {
  const matrix = useMatrix();
  const mode = p.get("mode");
  const m = isStreamMode(mode) ? mode : "play";
  if (matrix === null) return null;
  if (full) return <FullScreenView vm={toFullScreenVM(streamInput("play", matrix, mobileClass(p, "fs--m")))} />;
  return <StreamView vm={toStreamVM(streamInput(m, matrix, mobileClass(p, "page--m")))} />;
}
export const GALLERY_SENTINEL = "STRIP_GALLERY_SENTINEL_7f3a";
/** The board's mobile root class when the gallery URL carries mobile=1 (never present in the production bundle). */
export const mobileClass = (params: URLSearchParams, cls: "page--m" | "fs--m"): string => (params.get("mobile") === "1" ? cls : "");
export type GalleryRoute = (params: URLSearchParams) => ReactNode;
function SymbolSpecimens(): ReactNode {
  const [items, setItems] = useState<Specimen[]>([]);
  useEffect(() => {
    void specimens(6).then(setItems);
  }, []);
  useEffect(() => {
    const api = {
      packets: () => items.map((s) => Array.from(s.packet)),
      /** Decodes a PNG of one rendered symbol and reports whether the codec accepts the Packet and it equals specimen `index`. */
      async decodePng(png: number[], index: number): Promise<{ kind: string; accepted: boolean; same: boolean }> {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(png)], { type: "image/png" }));
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(bmp, 0, 0);
        const r = await decodeFrame(ctx.getImageData(0, 0, bmp.width, bmp.height), { wasm: wasmSource });
        if (r.kind !== "found") return { kind: r.kind, accepted: false, same: false };
        let accepted = true;
        try {
          decodePacket(r.bytes);
        } catch {
          accepted = false;
        }
        const want = items[index]?.packet;
        return { kind: r.kind, accepted, same: want !== undefined && want.length === r.bytes.length && want.every((b, i) => b === r.bytes[i]) };
      },
    };
    (window as unknown as { __gallery: typeof api }).__gallery = api;
  }, [items]);
  return (
    <div className="strip page" data-gallery={GALLERY_SENTINEL}>
    <main className="wrap" data-gallery-ready={items.length === 6 ? "yes" : "no"}>
      {items.map((s, i) => (
        <div key={i} className="stage__code" id={`specimen-${i}`}>
          <Symbol matrix={s.matrix} label={`Specimen symbol ${i + 1}`} />
        </div>
      ))}
    </main>
    </div>
  );
}
/** One entry per gallery route; each conversion task adds its own. */
export const GALLERY_ROUTES: Readonly<Record<string, GalleryRoute>> = {
  "symbol-specimens": () => <SymbolSpecimens />,
  errors: (p) => <ErrorsView vm={toErrorsVM(["size", "camera", "stall"], mobileClass(p, "page--m"))} />,
  "errors-all": (p) => <ErrorsAllView vm={toErrorsVM(ERROR_KINDS, mobileClass(p, "page--m"))} />,
  error: (p) => {
    const k = p.get("kind");
    return <ErrorPanel vm={toErrorVM((ERROR_KINDS as readonly string[]).includes(k ?? "") ? (k as ErrorKind) : "size")} />;
  },
  about: (p) => <AboutView vm={toAboutVM(mobileClass(p, "page--m"))} />,
  receive: (p) => <Receive p={p} page />,
  "receive-phase": (p) => <Receive p={p} page={false} />,
  paper: (p) => <Paper p={p} />,
  stream: (p) => <Stream p={p} full={false} />,
  "stream-full": (p) => <Stream p={p} full />,
  send: (p) => {
    const stage = p.get("stage");
    const st = isSendStage(stage) ? stage : "chosen";
    return <SendView vm={toSendVM({ stage: st, file: FILE_FACTS, bad: BAD_FACTS[st === "emptyfile" ? "emptyfile" : "toolarge"], rootCls: mobileClass(p, "page--m") })} />;
  },
};
export default function Gallery(): ReactNode {
  const name = location.pathname.replace(/^\/__gallery\//, "").replace(/\/$/, "");
  const params = new URLSearchParams(location.search);
  const route = GALLERY_ROUTES[name];
  return route ? <>{route(params)}</> : <div className="strip" data-gallery={GALLERY_SENTINEL}><p>Unknown gallery route: {name}</p></div>;
}
