// Container for /send: the Send step 1 store drives the Send board.
import { useSyncExternalStore, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { ErrorPanel } from "../views/ErrorPanel.js";
import { toErrorVM } from "../views/error-vm.js";
import { formatSize } from "../state/format.js";
import { sendStore } from "../services/send-session.js";
import { sendInputOf } from "../state/send-facts.js";
import { SendView, type SendHandlers } from "../views/SendView.js";
import { toSendVM } from "../views/send-vm.js";
export function SendScreen(): ReactNode {
  const st = useSyncExternalStore(sendStore.subscribe, sendStore.getState);
  const on: SendHandlers = {
    files: (files) => {
      const f = files?.[0];
      if (f) sendStore.dispatch({ t: "PICK", name: f.name, type: f.type, size: f.size }, f);
    },
    remove: () => sendStore.dispatch({ t: "REMOVE" }),
    output: (value) => sendStore.dispatch({ t: "OUTPUT", value }),
  };
  if (st.failure) {
    // R9.4, R9.7: a failed read shows the size or internal panel in place of the form; its primary action returns to Send.
    const panel = { primary: () => (st.failure === "size" ? sendStore.dispatch({ t: "REMOVE" }) : location.reload()) };
    return (
      <div className="strip page">
        <Nav current="send" />
        <main>
          <ErrorPanel vm={toErrorVM(st.failure, st.failure === "size" && st.meta ? { fileName: st.meta.name, size: formatSize(st.meta.size) } : {})} on={panel} />
        </main>
      </div>
    );
  }
  return <SendView vm={toSendVM(sendInputOf(st))} on={on} />;
}
