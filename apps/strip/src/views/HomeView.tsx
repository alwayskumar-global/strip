// Converted from the Home board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { Fragment, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { Symbol } from "../components/Symbol.js";
import type { HomeVM } from "./home-vm.js";
export function HomeView({ vm }: { vm: HomeVM }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={null} />
      <main>
        <section className="wrap hero">
          <div className="hero__copy">
            <p className="t-label t-muted">No network · No account · No upload</p>
            <h1 className="t-display">Move a file between devices with just light.</h1>
            <p className="t-lead">Strip turns a file into a printable data strip or an animated code on your screen. A phone camera reads it back.</p>
          </div>
          <figure className="specimen">
            <div className="specimen__sheet">
              <span className="reg reg--tl" aria-hidden="true"></span>
              <span className="reg reg--tr" aria-hidden="true"></span>
              <span className="reg reg--bl" aria-hidden="true"></span>
              <span className="reg reg--br" aria-hidden="true"></span>
              <div className="specimen__head t-label">
                <span>field-notes-2026.pdf</span>
                <span>Page 1 / 17</span>
              </div>
              <div className="specimen__grid">
                {vm.tiles.map((t, i_t) => (<Fragment key={i_t}>
                  <Symbol matrix={t.matrix} label="Sample data code" />
                </Fragment>))}
              </div>
              <figcaption className="specimen__cap t-label t-muted">Sample strip · 6 of 9 codes shown</figcaption>
            </div>
          </figure>
        </section>
        <section className="wrap" aria-labelledby="start-h">
          <h2 id="start-h" className="sr-only">Start</h2>
          <div className="actions">
            <a className="action action--send" href="/send">
              <span className="action__icon" aria-hidden="true">
                <svg className="ico ico--lg" viewBox="0 0 24 24">
                  <path d="M5 19L19 5M9 5h10v10" />
                </svg>
              </span>
              <span className="action__body">
                <span className="t-label t-muted">I have a file</span>
                <span className="t-h1">Send</span>
                <span>Turn a file into a strip to print, or a code to play on screen.</span>
              </span>
              <span className="action__go t-label">
                <span>Choose a file</span>
                <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 12h15M13 6l6 6-6 6" />
                </svg>
              </span>
            </a>
            <a className="action action--receive" href="/receive">
              <span className="action__icon" aria-hidden="true">
                <svg className="ico ico--lg" viewBox="0 0 24 24">
                  <path d="M19 5L5 19M15 19H5V9" />
                </svg>
              </span>
              <span className="action__body">
                <span className="t-label t-muted">I see a code</span>
                <span className="t-h1">Receive</span>
                <span>Point the camera at a strip or a screen. The file rebuilds on this device.</span>
              </span>
              <span className="action__go t-label">
                <span>Open camera</span>
                <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 12h15M13 6l6 6-6 6" />
                </svg>
              </span>
            </a>
          </div>
        </section>
        <section className="wrap how" aria-labelledby="how-h">
          <div className="perf" aria-hidden="true"></div>
          <div className="how__body">
            <h2 id="how-h" className="t-label">How it works</h2>
            <ol className="steps">
              <li className="step">
                <span className="step__n">01</span>
                <h3 className="t-h3">Pick a file</h3>
                <p className="t-small">Strip splits it into packets and adds repair packets, so a missed frame is not fatal.</p>
              </li>
              <li className="step">
                <span className="step__n">02</span>
                <h3 className="t-h3">Show the code</h3>
                <p className="t-small">Print the strip on paper, or play the animated code on screen.</p>
              </li>
              <li className="step">
                <span className="step__n">03</span>
                <h3 className="t-h3">Scan it</h3>
                <p className="t-small">A phone camera reads the packets. The file is rebuilt and checked against its SHA-256.</p>
              </li>
            </ol>
          </div>
          <div className="perf" aria-hidden="true"></div>
        </section>
      </main>
      <footer className="footer">
        <span>Built with Kiro</span>
        <div className="footer__right">
          <a className="footer__link" href="/about">About &amp; privacy</a>
          <a className="footer__link" href="/THIRD_PARTY_NOTICES">Third-party notices</a>
          <a className="footer__link" href="https://github.com/alwayskumar-global/strip" rel="noopener">GitHub<svg className="ico ico--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg></a>
        </div>
      </footer>
    </div>
  );
}
