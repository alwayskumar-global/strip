// Container for /send/paper: builds the sheets from the Sender_File, keeps the preview page, prints (R4, R10).
import { useEffect, useReducer, useState, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { printPage } from "../services/browser.js";
import { buildPaperPages, encodeFile } from "../services/paper-pages.js";
import { sendStore } from "../services/send-session.js";
import { sessionShort, reducePaper } from "../state/paper.js";
import { paperWarnIf } from "../state/send-facts.js";
import { PaperView, type PaperHandlers } from "../views/PaperView.js";
import type { PaperInput } from "../views/paper-vm.js";
import { toPaperVM } from "../views/paper-vm.js";
import { formatSize, hashChip } from "../state/format.js";
export function PaperScreen(): ReactNode {
  const file = sendStore.file();
  const [built, setBuilt] = useState<{ T: number; pages: PaperInput["pages"]; session: string } | null>(null);
  const [ui, send] = useReducer((s: { page: number; N: number }, ev: Parameters<typeof reducePaper>[1]) => {
    const r = reducePaper(s, ev);
    if (r.effects.includes("PRINT")) printPage();
    return r.state;
  }, { page: 1, N: file?.costs.N ?? 1 });
  useEffect(() => {
    if (file === null) return;
    let live = true;
    void encodeFile(file.bytes, file.name, file.mime).then(async (enc) => {
      const r = await buildPaperPages({ bytes: file.bytes, name: file.name, mime: file.mime, hash12: file.costs.hash12 }, enc);
      if (!live) return;
      setBuilt({ ...r, session: sessionShort(enc.sessionId) });
      send({ t: "SET_N", N: r.pages.length });
    });
    return () => {
      live = false;
    };
  }, [file]);
  if (file === null || built === null) {
    return (
      <div className="strip page">
        <Nav current="send" noPrint />
        <main className="wrap" />
      </div>
    );
  }
  const input: PaperInput = {
    size: "a4",
    fileTag: `${file.name} · ${formatSize(file.bytes.length)}`,
    previewIndex: ui.page - 1,
    codesLine: `${built.T} · 9 per page · includes repair`,
    session: built.session,
    hash: hashChip(file.costs.hash12),
    pages: built.pages,
    total: built.pages.length,
    warn: paperWarnIf(file.bytes.length, built.T, built.pages.length),
  };
  const on: PaperHandlers = { prev: () => send({ t: "PREV" }), next: () => send({ t: "NEXT" }), print: () => send({ t: "PRINT" }) };
  return <PaperView vm={toPaperVM(input)} on={on} />;
}
