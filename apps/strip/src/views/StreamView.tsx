// Converted from the SendScreen board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { Symbol } from "../components/Symbol.js";
import type { StreamVM } from "./stream-vm.js";
export function StreamView({ vm }: { vm: StreamVM }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={"send"} />
      <main>
        <div className="wrap pagehead pagehead--row">
          <a className="btn btn--icon btn--ghost" href="/send" aria-label="Back to file and output">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12H5M11 6l-6 6 6 6" />
            </svg>
          </a>
          <h1 className="t-h2">Show on screen</h1>
          <span className="tag">{vm.fileTag}</span>
          <span className={`tag ${vm.modeTagCls}`}>{vm.modeTag}</span>
        </div>
        <div className="wrap noticebar">
          <div className="callout callout--warn" role="note">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />
            </svg>
            <div className="callout__body">
              <p className="callout__title">Flashing content</p>
              <p className="t-small">This view flashes. Use step mode if flashing is a problem for you.</p>
              <p className="t-small t-muted">Step mode is the default when your system asks for reduced motion.</p>
              <div className="callout__actions">
                {vm.notStep && (<>
                  <button className="btn" type="button">Switch to step mode</button>
                </>)}
                {vm.isStep && (<>
                  <button className="btn" type="button">Back to playback</button>
                </>)}
              </div>
            </div>
          </div>
        </div>
        <section className="stage" aria-label={`Animated code, frame ${vm.n}`}>
          <div className="stage__code">
            <Symbol matrix={vm.matrix} label={vm.codeLabel} />
          </div>
        </section>
        <section className="wrap controls" aria-label="Playback controls">
          <div className="panel transport">
            <div className="counter" aria-live="off">
              <span className="t-label t-muted">Packet</span>
              <span className="counter__n">{vm.n}</span>
              <span className="t-mono">{vm.ofTotal}</span>
              <span className="tag">{vm.lap}</span>
            </div>
            <progress className="progress" value={vm.n} max={vm.max} aria-label="Packet progress"></progress>
            <button className="btn btn--primary btn--lg btn--block" type="button">{vm.isPlay && (<><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg></>)}{vm.notPlay && (<><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg></>)}{" "}{vm.ppLabel} <span className="kbd">Space</span></button>
            <div className="stepctl">
              <button className="btn" type="button" disabled={vm.stepOff}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6" /></svg>Previous</button>
              <button className="btn" type="button" disabled={vm.stepOff}>Next<svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg></button>
              <a className="btn btn--block" href="/send/screen"><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>Full screen</a>
            </div>
            <p className="t-small t-muted">{vm.loopNote}</p>
            <p className="t-label t-muted">{vm.modeNote}</p>
          </div>
          <div className="panel">
            <div className="field">
              <div className="field__top">
                <label className="t-label" htmlFor="fps">Speed</label>
                <span className="field__val">{vm.speed}</span>
              </div>
              <input id="fps" className="range" type="range" min="2" max="15" defaultValue={vm.fpsValue} disabled={vm.isStep} />
              <p className="t-small t-muted">Drop to 4–6 fps if the receiver skips frames.</p>
            </div>
            <fieldset className="seg">
              <legend className="t-label">Code size</legend>
              <div className="seg__row">
                <label className="seg__opt">
                  <input className="seg__in" type="radio" name="size" defaultValue="s" />
                  <span className="seg__box">Small</span>
                </label>
                <label className="seg__opt">
                  <input className="seg__in" type="radio" name="size" defaultValue="m" defaultChecked />
                  <span className="seg__box">Medium</span>
                </label>
                <label className="seg__opt">
                  <input className="seg__in" type="radio" name="size" defaultValue="l" />
                  <span className="seg__box">Large</span>
                </label>
              </div>
              <p className="t-small t-muted">Symbol size. Larger symbols read from farther away.</p>
            </fieldset>
            <div className="callout callout--tip">
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <div className="callout__body">
                <p className="callout__title">Hold the phone steady</p>
                <p className="t-small">30–50 cm from the screen, code filling the frame. Set brightness to maximum and turn off auto-dim.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
