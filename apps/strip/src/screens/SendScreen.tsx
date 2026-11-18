// Container for /send: the Send step 1 store drives the Send board.
import { useSyncExternalStore, type ReactNode } from "react";
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
  return <SendView vm={toSendVM(sendInputOf(st))} on={on} />;
}
