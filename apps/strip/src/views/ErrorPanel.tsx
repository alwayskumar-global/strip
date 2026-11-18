// Converted from the ErrorState board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { Fragment, type ReactNode } from "react";
import { Ring } from "../components/Ring.js";
import type { ErrorVM } from "./error-vm.js";
/** Optional action handlers: when given, the two actions are handled in the app instead of followed as links. */
export interface ErrorHandlers {
  primary?: () => void;
  secondary?: () => void;
}
export function ErrorPanel({ vm, on }: { vm: ErrorVM; on?: ErrorHandlers }): ReactNode {
  return (
    <section className="strip err" role="alert">
      <div className="err__head">
        <span className="err__icon" aria-hidden="true">
          {vm.iconFile && (<>
            <svg className="ico ico--lg" viewBox="0 0 24 24">
              <path d="M6 3h8l5 5v13H6zM14 3v5h5M10 13l4 4M14 13l-4 4" />
            </svg>
          </>)}
          {vm.iconCam && (<>
            <svg className="ico ico--lg" viewBox="0 0 24 24">
              <path d="M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 3l18 18" />
            </svg>
          </>)}
          {vm.iconClock && (<>
            <svg className="ico ico--lg" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </>)}
          {vm.iconAlert && (<>
            <svg className="ico ico--lg" viewBox="0 0 24 24">
              <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />
            </svg>
          </>)}
        </span>
        <span className="tag tag--signal">{vm.tag}</span>
      </div>
      <h2 className="t-h2">{vm.title}</h2>
      <p>{vm.msg}</p>
      {vm.isSize && (<>
        <div className="meter">
          <progress className="progress progress--signal" value={100} max={100} aria-label="File size is over the limit"></progress>
          <div className="meter__ends t-label">
            <span>{vm.limitEnd}</span>
            <span>{vm.fileEnd}</span>
          </div>
        </div>
      </>)}
      {vm.isStall && (<>
        <div className="row">
          <Ring pct={vm.stallPct} cls="ring--sm ring--dim" total={vm.stallTotal} label={`${vm.stallPct} percent solved`} />
          <p className="t-label t-muted">{vm.frozen}</p>
        </div>
      </>)}
      <dl className="kv">
        {vm.rows.map((r, i_r) => (<Fragment key={i_r}>
          <div className="kv__row">
            <dt className="t-label">{r.k}</dt>
            <dd className="t-mono">{r.v}</dd>
          </div>
        </Fragment>))}
      </dl>
      {vm.isStall && (<>
        <ul className="err__tips">
          {vm.tips.map((t, i_t) => (<Fragment key={i_t}>
            <li>{t.t}</li>
          </Fragment>))}
        </ul>
      </>)}
      <div className="err__actions">
        <a className="btn btn--primary btn--lg btn--block" href={vm.primaryHref} onClick={(e) => { if (on?.primary) { e.preventDefault(); on.primary(); } }}>{vm.primary}</a>
        <a className="btn btn--block" href={vm.secondaryHref} onClick={(e) => { if (on?.secondary) { e.preventDefault(); on.secondary(); } }}>{vm.secondary}</a>
      </div>
    </section>
  );
}
