// The Receive board's page shell: the page nav and `main` around the Receive component (the Receive board).
import type { ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { ReceiveView } from "./ReceiveView.js";
import type { ReceiveVM } from "./receive-vm.js";
export function ReceivePage({ vm, viewfinder }: { vm: ReceiveVM; viewfinder?: ReactNode }): ReactNode {
  return (
    <div className="strip page">
      <Nav current="receive" />
      <main>
        <ReceiveView vm={vm} viewfinder={viewfinder} />
      </main>
    </div>
  );
}
