// Converted from the SendScreenFull board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { type ReactNode } from "react";
import { Symbol } from "../components/Symbol.js";
import type { FullScreenVM } from "./stream-vm.js";
export function FullScreenView({ vm }: { vm: FullScreenVM }): ReactNode {
  return (
    <div className={`strip fs ${vm.rootCls}`}>
      <a className="btn fs__exit" href="/send/screen"><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>Exit full screen</a>
      <div className="fs__code">
        <Symbol matrix={vm.matrix} label={vm.codeLabel} />
      </div>
      <p className="fs__meta t-label">{vm.meta}</p>
    </div>
  );
}
