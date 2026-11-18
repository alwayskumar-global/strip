// Container for /receive: the Receive store drives the Receive board and the Error panel (R5, R12, R13).
import { useSyncExternalStore, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { receiveStore } from "../services/receive-store.js";
import { receiveInputOf } from "../state/receive-facts.js";
import type { ReceiveEvent, ReceiveState } from "../state/receive.js";
import { ErrorPanel } from "../views/ErrorPanel.js";
import { ReceivePage } from "../views/ReceivePage.js";
import type { ReceiveHandlers } from "../views/ReceiveView.js";
import { toErrorVM } from "../views/error-vm.js";
import { toReceiveVM, type ReceivePhase } from "../views/receive-vm.js";
const PRIMARY: Partial<Record<ReceivePhase, ReceiveEvent>> = { empty: { t: "START" }, ask: { t: "START" }, denied: { t: "START" }, scan: { t: "STOP" }, repeat: { t: "STOP" }, dup: { t: "KEEP" }, done: { t: "DOWNLOAD" }, failed: { t: "SCAN_AGAIN" } };
const SECONDARY: Record<ReceivePhase, ReceiveEvent> = { empty: { t: "BACK" }, ask: { t: "NOT_NOW" }, denied: { t: "BACK" }, nocam: { t: "BACK" }, scan: { t: "START_OVER" }, repeat: { t: "START_OVER" }, dup: { t: "SWITCH" }, verify: { t: "CANCEL" }, done: { t: "RECEIVE_ANOTHER" }, failed: { t: "DISCARD" } };
export function handlersFor(s: ReceiveState, dispatch: (e: ReceiveEvent, f?: File) => void): ReceiveHandlers {
  return {
    primary: () => {
      const e = PRIMARY[s.phase];
      if (e) dispatch(e);
    },
    secondary: () => dispatch(SECONDARY[s.phase]),
    addPhoto: (files) => {
      const f = files?.[0];
      if (f) dispatch({ t: "ADD_PHOTO", name: f.name, size: f.size }, f);
    },
    removePhoto: (id) => dispatch({ t: "REMOVE_PHOTO", id }),
  };
}
export function ReceiveScreen(): ReactNode {
  const s = useSyncExternalStore(receiveStore.subscribe, receiveStore.getState);
  const on = handlersFor(s, (e, f) => receiveStore.dispatch(e, f));
  if (s.panel) {
    const panel: { primary: () => void; secondary: () => void } = { primary: () => receiveStore.dispatch({ t: "PANEL", action: "primary" }), secondary: () => receiveStore.dispatch({ t: "PANEL", action: "secondary" }) };
    return (
      <div className="strip page">
        <Nav current="receive" />
        <main>
          <ErrorPanel vm={toErrorVM(s.panel.kind, s.panel.ctx)} on={panel} />
        </main>
      </div>
    );
  }
  return <ReceivePage vm={toReceiveVM(receiveInputOf(s))} viewfinder={<></>} on={on} />;
}
