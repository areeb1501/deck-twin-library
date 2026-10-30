/**
 * Value strip (plan 13 B): one line of money for the live dashboard and the 3D view —
 * oil bbl/d · revenue $/d · deferred today $ · cash $/d · top $ at risk.
 *
 *   <ValueStrip />                 console variant (spans a grid row; sits on the live dashboard)
 *   <ValueStrip variant="hud" />   translucent pill over the 3D view; position it with `className`
 *
 * Styles live in econ.css under `.vstrip` with their own variables, so the strip works outside `.hmi`.
 * Click (or Enter) opens the console on the Asset & economics page unless `onOpen` is given.
 * Reads useFinance only (written ≤ 2 Hz by sim/finance.ts). Simulated values; the prices are an assumption.
 */
import type { KeyboardEvent } from 'react'
import { fmtUsd } from '../../sim/assetRisk'
import { useFinance } from '../../sim/finance'
import { useStore } from '../../state/store'
import './econ.css'

const fmtN = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString() : '—')

export function ValueStrip({ variant = 'console', className, onOpen }: { variant?: 'hud' | 'console'; className?: string; onOpen?: () => void }) {
  const rate = useFinance((s) => s.rate)
  const oil = useFinance((s) => s.now.oil)
  const live = useFinance((s) => s.now.t > 0 || s.now.mpp > 0)
  const deferredToday = useFinance((s) => s.today.deferred)
  const top = useFinance((s) => s.risks[0])
  const horizon = useFinance((s) => s.riskHorizon)
  const open = () => (onOpen ? onOpen() : useStore.getState().setHmi('economics'))
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }
  const risky = !!top && top.exposureUsd >= 1000
  return (
    <div
      className={`vstrip ${variant} ${className ?? ''}`}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      title="Asset & economics — simulated values at an assumed price deck. Click to open."
      data-value-strip={variant}
    >
      <div className="vs-i">
        <span className="l">Oil</span>
        <span className="v">
          {live ? fmtN(oil) : '—'}
          <small>bbl/d</small>
        </span>
      </div>
      <div className="vs-i acc">
        <span className="l">Revenue</span>
        <span className="v">
          {live ? fmtUsd(rate.revenue) : '—'}
          <small>/d</small>
        </span>
      </div>
      <div className={`vs-i ${deferredToday > 1000 || rate.deferred > 100 ? 'loss' : ''}`}>
        <span className="l">Deferred today</span>
        <span className="v">
          {fmtUsd(deferredToday)}
          {rate.deferred > 100 && <small className="now">▼ {fmtUsd(rate.deferred)}/d</small>}
        </span>
      </div>
      <div className={`vs-i ${rate.cash < 0 ? 'loss' : 'acc'}`}>
        <span className="l">Cash</span>
        <span className="v">
          {live ? fmtUsd(rate.cash) : '—'}
          <small>/d</small>
        </span>
      </div>
      <div className={`vs-i risk ${risky && top.exposureUsd >= 1e6 ? 'loss' : ''}`}>
        <span className="l">Top $ at risk · {horizon} d</span>
        <span className="v">
          {risky ? (
            <>
              <b className="tg">{top.tag}</b> {fmtUsd(top.exposureUsd)}
            </>
          ) : (
            <span className="none">none material</span>
          )}
        </span>
      </div>
      <span className="vs-sim">simulated</span>
    </div>
  )
}
