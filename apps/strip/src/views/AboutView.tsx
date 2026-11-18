// Converted from the About board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import type { AboutVM } from "./about-vm.js";
export function AboutView({ vm }: { vm: AboutVM }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={"about"} />
      <main className="wrap">
        <div className="pagehead">
          <p className="t-label t-muted">About · Privacy</p>
          <h1 className="t-h1">Nothing leaves this device.</h1>
          <p className="t-lead">Strip runs in your browser. Files are read, split and encoded here, and decoded by the camera on the other device.</p>
        </div>
        <div className="doc">
          <nav className="toc" aria-label="On this page">
            <a href="#privacy">Privacy</a>
            <a href="#account">No account</a>
            <a href="#caveat">What it does not do</a>
            <a href="#limits">Limits</a>
            <a href="#credits">Credits</a>
          </nav>
          <div className="doc__body">
            <section id="privacy" className="doc__sec">
              <h2 className="t-h2">Privacy</h2>
              <p>No upload, no server copy, no share link. Your file is processed by the page you have open. The receiving phone reads light with its camera and rebuilds the file locally. Video from the camera is analysed on the device and is not recorded or sent anywhere.</p>
              <p>Once the page has loaded, Strip does not need a connection to send or receive.</p>
            </section>
            <section id="account" className="doc__sec">
              <h2 className="t-h2">No account</h2>
              <p>No sign-up, no login, no profile. Close the tab and the session is gone.</p>
            </section>
            <section id="caveat" className="doc__sec">
              <h2 className="t-h2">What it does not do</h2>
              <div className="callout callout--warn">
                <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />
                </svg>
                <div className="callout__body">
                  <p className="callout__title">Strip does not encrypt</p>
                  <p className="t-small">Anyone who can see or photograph a strip, or the screen while a code plays, can rebuild the file. Treat a printed strip like the file itself.</p>
                </div>
              </div>
            </section>
            <section id="limits" className="doc__sec">
              <h2 className="t-h2">Limits</h2>
              <table className="limits">
                <tr>
                  <th scope="row">Max file size</th>
                  <td className="t-mono">256 KB</td>
                </tr>
                <tr>
                  <th scope="row">Files per transfer</th>
                  <td>One. Zip several files first.</td>
                </tr>
                <tr>
                  <th scope="row">Receiving needs</th>
                  <td>A camera, and a browser that exposes the camera API on HTTPS.</td>
                </tr>
                <tr>
                  <th scope="row">Integrity</th>
                  <td>SHA-256 is checked before you can save. A mismatch saves nothing.</td>
                </tr>
                <tr>
                  <th scope="row">Screen</th>
                  <td>Hold the phone steady, 30–50 cm away. Maximum brightness.</td>
                </tr>
                <tr>
                  <th scope="row">Paper</th>
                  <td>A4 or Letter, printed black on white at 100% scale.</td>
                </tr>
                <tr>
                  <th scope="row">Example</th>
                  <td>A 184 KB file is 111 source packets, 149 symbols and 17 printed pages (9 per page, 3 × 3).</td>
                </tr>
              </table>
            </section>
            <section id="credits" className="doc__sec">
              <h2 className="t-h2">Credits</h2>
              <p>Built with Kiro. Source on GitHub.</p>
              <div className="row">
                <a className="btn" href="https://github.com/alwayskumar-global/strip" rel="noopener">GitHub<svg className="ico ico--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg></a>
                <a className="btn" href="/THIRD_PARTY_NOTICES">Third-party notices</a>
                <a className="btn btn--primary" href="/send">Send a file</a>
              </div>
            </section>
          </div>
        </div>
      </main>
      <footer className="footer">
        <span>Built with Kiro</span>
        <div className="footer__right">
          <a className="footer__link" href="/">Home</a>
          <a className="footer__link" href="/THIRD_PARTY_NOTICES">Third-party notices</a>
          <a className="footer__link" href="https://github.com/alwayskumar-global/strip" rel="noopener">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
