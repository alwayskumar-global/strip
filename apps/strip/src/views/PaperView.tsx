// Converted from the SendPaper board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { Fragment, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { Symbol } from "../components/Symbol.js";
import type { PaperVM } from "./paper-vm.js";
export interface PaperHandlers {
  prev?: () => void;
  next?: () => void;
  print?: () => void;
}
export function PaperView({ vm, on }: { vm: PaperVM; on?: PaperHandlers }): ReactNode {
  return (
    <div className={`strip page ${vm.rootCls}`}>
      <Nav current={"send"} noPrint />
      <main className="wrap">
        <div className="pagehead pagehead--row no-print">
          <a className="btn btn--icon btn--ghost" href="/send" aria-label="Back to file and output">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12H5M11 6l-6 6 6 6" />
            </svg>
          </a>
          <h1 className="t-h2">Print a strip</h1>
          <span className="tag">{vm.fileTag}</span>
        </div>
        {vm.warn && (
          <div className="callout callout--warn no-print" role="note" data-addition="">
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />
            </svg>
            <div className="callout__body">
              <p className="callout__title">{vm.warn.title}</p>
              <p className="t-small">{vm.warn.text}</p>
            </div>
          </div>
        )}
        <div className="two two--side">
          <aside className="panel no-print" aria-label="Print setup">
            <fieldset className="seg">
              <legend className="t-label">Paper</legend>
              <div className="seg__row">
                <label className="seg__opt">
                  <input className="seg__in" id="paper-a4" type="radio" name="paper" defaultValue="a4" defaultChecked={vm.a4On} />
                  <span className="seg__box">A4</span>
                </label>
                <label className="seg__opt">
                  <input className="seg__in" id="paper-letter" type="radio" name="paper" defaultValue="letter" defaultChecked={vm.letterOn} />
                  <span className="seg__box">Letter</span>
                </label>
              </div>
              <p className="t-small t-muted">A4 is 210 × 297 mm, Letter is 8.5 × 11 in. The preview and the printed pages follow the choice.</p>
            </fieldset>
            <div className="field">
              <div className="field__top">
                <span className="t-label">Preview page</span>
                <span className="field__val">{vm.preview}</span>
              </div>
              <div className="row">
                <button className="btn" type="button" disabled={vm.prevOff} aria-label="Previous page" onClick={() => on?.prev?.()}>
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20 12H5M11 6l-6 6 6 6" />
                  </svg>
                </button>
                <button className="btn" type="button" disabled={vm.nextOff} aria-label="Next page" onClick={() => on?.next?.()}>
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 12h15M13 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </div>
            <dl className="kv">
              <div className="kv__row">
                <dt className="t-label">Codes</dt>
                <dd className="t-mono">{vm.codesLine}</dd>
              </div>
              <div className="kv__row">
                <dt className="t-label">Session</dt>
                <dd className="t-mono">{vm.session}</dd>
              </div>
              <div className="kv__row">
                <dt className="t-label">SHA-256</dt>
                <dd>
                  <span className="hash">
                    <span>{vm.hash[0]}</span>
                    <span>{vm.hash[1]}</span>
                    <span>{vm.hash[2]}</span>
                    <span>…</span>
                  </span>
                </dd>
              </div>
            </dl>
            <button className="btn btn--primary btn--lg btn--block" type="button" onClick={() => on?.print?.()}><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z" /></svg>{vm.printLabel}</button>
            <div className="callout callout--tip">
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.5" />
              </svg>
              <div className="callout__body">
                <p className="callout__title">Print at 100%</p>
                <p className="t-small">Pure black on white. Turn off “fit to page” and colour. The ruler on each page must measure 10 cm.</p>
              </div>
            </div>
          </aside>
          <div className="paper-wrap">
            {vm.pages.map((pg, i_pg) => (<Fragment key={i_pg}>
              <article className={`paper ${pg.cls}`} aria-label={pg.aria}>
                <span className="reg reg--tl" aria-hidden="true"></span>
                <span className="reg reg--tr" aria-hidden="true"></span>
                <span className="reg reg--bl" aria-hidden="true"></span>
                <span className="reg reg--br" aria-hidden="true"></span>
                <div className="paper__inner">
                  <header className="paper__head">
                    <div>
                      <p className="paper__name">{pg.name}</p>
                      <p className="paper__meta">{pg.meta}</p>
                    </div>
                    <div className="paper__id">
                      <p className="paper__page">{pg.page}</p>
                      <p className="paper__meta">{pg.session}</p>
                    </div>
                  </header>
                  <div className="paper__grid">
                    {pg.tiles.map((t, i_t) => (<Fragment key={i_t}>
                      <figure className="tile">
                        <Symbol matrix={t.matrix} label={t.label} />
                        <figcaption className="tile__cap">
                          <span>{t.label}</span>
                          <span>{t.of}</span>
                        </figcaption>
                      </figure>
                    </Fragment>))}
                  </div>
                  <footer className="paper__foot">
                    <span>STRIP · PRINT AT 100% · BLACK ON WHITE</span>
                    <span className="ruler">
                      <span className="ruler__bar" aria-hidden="true"></span>
                      <span>10 cm</span>
                    </span>
                  </footer>
                </div>
              </article>
            </Fragment>))}
          </div>
        </div>
      </main>
    </div>
  );
}
