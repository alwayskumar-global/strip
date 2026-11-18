// Converted from the Errors board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { ErrorPanel } from "./ErrorPanel.js";
import type { ErrorsVM } from "./error-vm.js";
export function ErrorsView({ vm }: { vm: ErrorsVM }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={null} />
      <main className="wrap">
        <div className="pagehead">
          <p className="t-label t-muted">Screen 7</p>
          <h1 className="t-h1">Error states</h1>
          <p className="t-lead">Say what happened, show the numbers, offer one clear next step. Signal colour marks the problem; nothing blames the user.</p>
        </div>
        <div className="errgrid">
          {vm.panels.map((p, i) => (
            <ErrorPanel key={i} vm={p} />
          ))}
        </div>
      </main>
    </div>
  );
}
