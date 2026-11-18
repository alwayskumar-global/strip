// Converted from the ReceiveState board in design/project (steering: design-handoff). Presentational: no service calls, no state.
import { Fragment, type ReactNode } from "react";
import { Ring } from "../components/Ring.js";
import { Symbol } from "../components/Symbol.js";
import type { ReceiveVM } from "./receive-vm.js";
/** Optional event handlers: the gallery and the unit tests render the view without them. */
export interface ReceiveHandlers {
  primary?: () => void;
  secondary?: () => void;
  addPhoto?: (files: FileList | null) => void;
  removePhoto?: (id: number) => void;
  torch?: () => void;
}
export function ReceiveView({ vm, viewfinder, on }: { vm: ReceiveVM; viewfinder?: ReactNode; on?: ReceiveHandlers | undefined }): ReactNode {
  return (
    <section className="strip rx" aria-label="Receive">
      <header className="rx__top">
        <a className="btn btn--ghost btn--icon" href="/" aria-label="Back to home">
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12H5M11 6l-6 6 6 6" />
          </svg>
        </a>
        <h1 className="t-h3 rx__title">Receive</h1>
        <span className={vm.tagCls}>{vm.tag}</span>
      </header>
      <div className="rx__body">
        <div className="rx__view">
          <div className={`vf on-dark ${vm.vfCls}`}>
            {vm.showCode && (<>
              {viewfinder ?? (
                <div className="vf__code tilt">
                  {vm.codeMatrix && <Symbol matrix={vm.codeMatrix} label="Code seen by the camera" />}
                </div>
              )}
              <div className="vf__scan" aria-hidden="true"></div>
            </>)}
            {vm.showMsg && (<>
              <div className="vf__msg">
                {vm.camOn && (<>
                  <svg className="ico ico--lg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                  </svg>
                </>)}
                {vm.camOff && (<>
                  <svg className="ico ico--lg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM3 3l18 18" />
                  </svg>
                </>)}
                <p className="t-label">{vm.vfNote}</p>
              </div>
            </>)}
            {vm.showDone && (<>
              <div className="vf__done">
                <span className="vf__check">
                  <svg className="ico ico--lg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 12l5 5L20 6" />
                  </svg>
                </span>
                <h2 className="t-h3 filecard__name">{vm.done.name}</h2>
                <p className="t-mono">{vm.done.size}</p>
                <span className="tag tag--cobalt">{vm.done.match}</span>
              </div>
            </>)}
            <span className="br br--tl" aria-hidden="true"></span>
            <span className="br br--tr" aria-hidden="true"></span>
            <span className="br br--bl" aria-hidden="true"></span>
            <span className="br br--brr" aria-hidden="true"></span>
            {vm.showHud && (<>
              <div className="vf__hud">
                <span className="tag">{vm.hud}</span>
              </div>
            </>)}
          </div>
          <div className="capture">
            <span className="tag capture__cam">{vm.camState}</span>
            <label className="btn picker"><input className="sr-only" type="file" accept="image/*" onChange={(e) => { on?.addPhoto?.(e.currentTarget.files); e.currentTarget.value = ""; }} /><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add photo of a page</label>
            <p className="t-small t-muted capture__help">One photo at a time. Add as many pages as you have.</p>
          </div>
          <div className="photos">
            <div className="photos__head">
              <h3 className="t-label">Added photos</h3>
              <span className="tag">{vm.photoCount}</span>
            </div>
            {vm.hasPhotos && (<>
              <ul className="photos__list">
                {vm.photos.map((p, i_p) => (<Fragment key={i_p}>
                  <li className="photo">
                    <span className="thumb" aria-hidden="true">
                      <svg className="thumb__svg" viewBox="0 0 24 30">
                        <path d="M3 4h5v5H3zM9.5 4h5v5h-5zM16 4h5v5h-5zM3 12.5h5v5H3zM9.5 12.5h5v5h-5zM16 12.5h5v5h-5zM3 21h5v5H3zM9.5 21h5v5h-5zM16 21h5v5h-5z" />
                      </svg>
                    </span>
                    <div>
                      <p className="photo__name">{p.name}</p>
                      <p className="t-small t-muted">{p.found} {p.found === 1 ? "symbol" : "symbols"} found</p>
                    </div>
                    <button className="btn btn--ghost btn--icon" type="button" aria-label={`Remove ${p.name}`} onClick={() => on?.removePhoto?.(p.id ?? -1)}>
                      <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 5l14 14M19 5L5 19" />
                      </svg>
                    </button>
                  </li>
                </Fragment>))}
              </ul>
            </>)}
            {vm.noPhotos && (<>
              <p className="t-small t-muted">{vm.photoHint}</p>
            </>)}
          </div>
        </div>
        <div className="rx__side">
          <div className="rx__status" role="status">
            <h2 className="t-h3">{vm.head}</h2>
            <p className="t-small t-muted">{vm.msg}</p>
            {vm.isDenied && (<>
              <ol className="rx__steps">
                {vm.howto.map((h, i_h) => (<Fragment key={i_h}>
                  <li>{h.t}</li>
                </Fragment>))}
              </ol>
            </>)}
            {vm.hasBanner && (<>
              <div className={`callout ${vm.bannerCls}`}>
                <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3L2 21h20L12 3zM12 10v5M12 18v.5" />
                </svg>
                <div className="callout__body">
                  <p className="callout__title">{vm.bannerTitle}</p>
                  <p className="t-small">{vm.bannerMsg}</p>
                </div>
              </div>
            </>)}
            {vm.showBar && (<>
              <div className="meter" data-addition={vm.barAdd ? "" : undefined}>
                <progress className="progress progress--cobalt" value={vm.distinct} max={vm.total} aria-label="Distinct packets seen"></progress>
                <div className="meter__ends t-label">
                  <span>Distinct packets</span>
                  <span>{vm.distinct} of {vm.total}</span>
                </div>
              </div>
            </>)}
            {vm.isVerify && (<>
              <progress className="progress progress--indet" aria-label="Verifying hash"></progress>
            </>)}
          </div>
          <div className="dock">
            <div className="dock__stats">
              <Ring pct={vm.pct} cls={vm.ringCls} total={vm.total} />
              <div className="stats" aria-live="polite">
                <div className="stat">
                  <span className="t-label t-muted">Packets seen</span>
                  <span className="stat__v">{vm.seen}</span>
                </div>
                <div className="stat">
                  <span className="t-label t-muted">Blocks solved</span>
                  <span className="stat__v">{vm.solved}<span className="stat__of"> / {vm.total}</span></span>
                </div>
              </div>
            </div>
            <div className="dock__actions">
              {vm.isNocam && (<>
                <label className="btn btn--primary btn--lg btn--block picker"><input className="sr-only" type="file" accept="image/*" onChange={(e) => { on?.addPhoto?.(e.currentTarget.files); e.currentTarget.value = ""; }} /><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add photo of a page</label>
              </>)}
              {vm.hasPrimaryBtn && (<>
                <button className={vm.primaryCls} type="button" disabled={vm.primaryOff} onClick={() => on?.primary?.()}>{vm.isDone && (<><svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M6 11l6 6 6-6M5 20h14" /></svg></>)}{vm.primary}</button>
              </>)}
              <div className="dock__row">
                <button className="btn" type="button" onClick={() => on?.secondary?.()}>{vm.secondary}</button>
                {vm.showTorch && (<>
                  <button className="btn btn--icon" type="button" aria-label="Torch" onClick={() => on?.torch?.()}>
                    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M13 2L5 14h6l-1 8 8-12h-6z" />
                    </svg>
                  </button>
                </>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
