// Converted from the ErrorsAll board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { Fragment, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { ErrorPanel } from "./ErrorPanel.js";
import type { ErrorsVM } from "./error-vm.js";
export function ErrorsAllView({ vm }: { vm: ErrorsVM }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={null} />
      <main className="wrap">
        <div className="pagehead">
          <p className="t-label t-muted">Screen 7 · full set</p>
          <h1 className="t-h1">Every error, one pattern</h1>
          <p className="t-lead">Fourteen kinds, each with a title, a one-sentence explanation and one clear next action. The first twelve cover the whole flow; the last two are the earlier browser and decode cases.</p>
        </div>
        <div className="errgrid">
          {vm.panels.map((k, i_k) => (<Fragment key={i_k}>
            <ErrorPanel vm={k} />
          </Fragment>))}
        </div>
      </main>
    </div>
  );
}
