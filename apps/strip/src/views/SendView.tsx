// Converted from the Send board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import type { SendVM } from "./send-vm.js";
export function SendView({ vm }: { vm: SendVM }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={"send"} />
      <main className="wrap">
        <div className="pagehead">
          <ol className="crumbs t-label" aria-label="Progress">
            <li aria-current="step">1 File &amp; output</li>
            <li>2 Show or print</li>
          </ol>
          <h1 className="t-h1">Send a file</h1>
          <p className="t-lead">Pick a file, then choose how to show it. The file never leaves this device.</p>
        </div>
        <div className="two">
          <section className={`drop ${vm.dropCls}`} aria-labelledby="drop-h">
            <svg className="ico ico--lg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20V6M6 12l6-6 6 6M4 3h16" />
            </svg>
            <h2 id="drop-h" className="t-h3">Drop a file here</h2>
            <p className="t-small t-muted">or pick one from this device</p>
            <input className="picker__in sr-only" id="file" type="file" />
            <label className="btn btn--primary" htmlFor="file">Choose file</label>
            <p className="t-label t-muted">Max 256 KB · one file</p>
          </section>
          {vm.isChosen && (<>
            <section className="filecard" aria-labelledby="fc-h">
              <div className="filecard__head">
                <span className="filecard__icon" aria-hidden="true">
                  <svg className="ico" viewBox="0 0 24 24">
                    <path d="M6 3h8l5 5v13H6zM14 3v5h5" />
                  </svg>
                </span>
                <div className="filecard__title">
                  <h2 id="fc-h" className="filecard__name">{vm.file.name}</h2>
                  <p className="t-small t-muted">{vm.file.mime}</p>
                </div>
                <button className="btn btn--ghost btn--icon" type="button" aria-label="Remove file">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 5l14 14M19 5L5 19" />
                  </svg>
                </button>
              </div>
              <dl className="kv">
                <div className="kv__row">
                  <dt className="t-label">Size</dt>
                  <dd className="t-mono">{vm.file.size} <span className="t-muted">{vm.file.bytes}</span></dd>
                </div>
                <div className="kv__row">
                  <dt className="t-label">SHA-256</dt>
                  <dd>
                    <span className="hash">
                      <span>{vm.file.hash[0]}</span>
                      <span>{vm.file.hash[1]}</span>
                      <span>{vm.file.hash[2]}</span>
                      <span>…</span>
                    </span>
                  </dd>
                </div>
                <div className="kv__row">
                  <dt className="t-label">Encoded</dt>
                  <dd className="t-mono">{vm.file.encoded}</dd>
                </div>
                <div className="kv__row">
                  <dt className="t-label">Within limit</dt>
                  <dd className="t-mono">{vm.file.within}</dd>
                </div>
              </dl>
              <progress className="progress" value={vm.file.value} max={vm.file.max} aria-label="Share of the 256 KB limit used"></progress>
            </section>
          </>)}
          {vm.isNone && (<>
            <section className="filecard filecard--empty" aria-labelledby="fe-h">
              <h2 id="fe-h" className="t-h3">No file chosen</h2>
              <p className="t-small t-muted">Name, size and SHA-256 appear here once you pick a file.</p>
            </section>
          </>)}
          {vm.isBad && (<>
            <section className="filecard filecard--bad" aria-labelledby="fb-h">
              <div className="filecard__head">
                <span className="filecard__icon" aria-hidden="true">
                  <svg className="ico" viewBox="0 0 24 24">
                    <path d="M6 3h8l5 5v13H6zM14 3v5h5" />
                  </svg>
                </span>
                <div className="filecard__title">
                  <h2 id="fb-h" className="filecard__name">{vm.badName}</h2>
                  <p className="t-small t-muted">{vm.badType}</p>
                </div>
                <button className="btn btn--ghost btn--icon" type="button" aria-label="Remove file">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 5l14 14M19 5L5 19" />
                  </svg>
                </button>
              </div>
              <dl className="kv">
                <div className="kv__row">
                  <dt className="t-label">Size</dt>
                  <dd className="t-mono">{vm.badSize}</dd>
                </div>
                <div className="kv__row">
                  <dt className="t-label">SHA-256</dt>
                  <dd className="t-mono t-muted">Not computed</dd>
                </div>
                <div className="kv__row">
                  <dt className="t-label">Within limit</dt>
                  <dd className="t-mono">{vm.badLimit}</dd>
                </div>
              </dl>
              <progress className="progress progress--signal" value={vm.badValue} max={vm.badMax} aria-label="Share of the 256 KB limit used"></progress>
            </section>
          </>)}
        </div>
        {vm.isBad && (<>
          <div className="callout callout--error" role="alert">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />
            </svg>
            <div className="callout__body">
              <p className="callout__title">{vm.badTitle}</p>
              <p className="t-small">{vm.badMsg}</p>
            </div>
          </div>
        </>)}
        <fieldset className="choices" disabled={vm.choicesOff} aria-describedby="out-help">
          <legend className="t-label">Choose output</legend>
          <p id="out-help" className="sr-only">Screen plays an animated code. Paper prints a strip.</p>
          <div className="choices__row">
            <label className="choice">
              <input className="choice__in" type="radio" name="output" defaultValue="screen" defaultChecked={vm.screenOn} />
              <span className="choice__box">
                <span className="choice__head">
                  <svg className="ico ico--lg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 4h18v12H3zM8 20h8M12 16v4" />
                  </svg>
                  <span className="t-h3">Screen</span>
                  <span className="choice__tick">
                    <svg className="ico ico--sm" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  </span>
                </span>
                <span className="t-small">Play an animated code on this display. Fastest way to hand over a file in the same room.</span>
                <span className="t-label t-muted">{vm.screenNote}</span>
              </span>
            </label>
            <label className="choice">
              <input className="choice__in" type="radio" name="output" defaultValue="paper" />
              <span className="choice__box">
                <span className="choice__head">
                  <svg className="ico ico--lg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z" />
                  </svg>
                  <span className="t-h3">Paper</span>
                  <span className="choice__tick">
                    <svg className="ico ico--sm" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12l5 5L20 6" />
                    </svg>
                  </span>
                </span>
                <span className="t-small">Print a strip of codes on A4 or Letter. Scan it now or years from now.</span>
                <span className="t-label t-muted">{vm.paperNote}</span>
              </span>
            </label>
          </div>
        </fieldset>
        <div className="actionbar">
          <a className="btn btn--ghost" href="/">Cancel</a>
          {vm.isChosen && (<>
            <a className="btn btn--primary btn--lg" href="/send/screen">Continue to Screen<svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg></a>
          </>)}
          {vm.choicesOff && (<>
            <button className="btn btn--primary btn--lg" type="button" disabled>Continue to Screen<svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg></button>
          </>)}
        </div>
      </main>
    </div>
  );
}
