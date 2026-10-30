/** Compact production ticker under the toolbar while walking (the side panels are hidden then). */
import { useSim } from '../state/sim'
import { useStore } from '../state/store'
import { fmtClock } from '../sim/types'

const n = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })

export function OpsTicker() {
  const walk = useStore((s) => s.walk)
  const r = useSim((s) => s.result)
  const kpis = useSim((s) => s.kpis)
  const t = useSim((s) => s.t)
  if (!walk || !r) return null
  return (
    <div className={`ops-ticker small ${r.constraint ? 'warn' : ''}`}>
      <span><b>{n(r.oilExport)}</b> bbl/d oil</span>
      <span><b>{n(r.gasExport, 1)}</b> MMscfd gas</span>
      <span><b>{n(r.flare, 1)}</b> flare</span>
      <span><b>{r.powerAvailable >= 999 ? n(r.powerGenerated, 1) : `${n(r.powerGenerated, 1)}/${n(r.powerAvailable)}`}</b> MW</span>
      <span>PE <b>{n(r.efficiency, 1)}%</b> · session <b>{n(kpis.pe, 1)}%</b></span>
      <span>avail. <b>{n(kpis.availability, 1)}%</b></span>
      <span className="mono">{fmtClock(t, false)}</span>
      {r.constraint && <span className="ops-ticker-alert">{r.constraint}</span>}
    </div>
  )
}
