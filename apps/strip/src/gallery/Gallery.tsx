// Harness-only gallery: one route per board instance under /__gallery/*, rendered with fixtures (design: Gallery routes).
// Never part of the production bundle: App.tsx imports this module behind `if (__STRIP_GALLERY__)`.
import { useEffect, useState, type ReactNode } from "react";
import { decodePacket } from "@strip/codec";
import { decodeFrame } from "@strip/symbols";
import { Symbol } from "../components/Symbol.js";
import { wasmSource } from "../symbols-wasm.js";
import { specimens, type Specimen } from "./fixtures.js";
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
};
export default function Gallery(): ReactNode {
  const name = location.pathname.replace(/^\/__gallery\//, "").replace(/\/$/, "");
  const params = new URLSearchParams(location.search);
  const route = GALLERY_ROUTES[name];
  return route ? <>{route(params)}</> : <div className="strip" data-gallery={GALLERY_SENTINEL}><p>Unknown gallery route: {name}</p></div>;
}
