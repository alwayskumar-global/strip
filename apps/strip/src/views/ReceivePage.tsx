// The Receive board's page shell: the page nav and `main` around the Receive component (the Receive board).
import type { ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { ReceiveView, type ReceiveHandlers } from "./ReceiveView.js";
import type { ReceiveVM } from "./receive-vm.js";
export function ReceivePage({ vm, viewfinder, on }: { vm: ReceiveVM; viewfinder?: ReactNode; on?: ReceiveHandlers | undefined }): ReactNode {
  return (
    <div className="strip page">
      <Nav current="receive" />
      <main>
        <ReceiveView vm={vm} viewfinder={viewfinder} on={on} />
      </main>
    </div>
  );
}
