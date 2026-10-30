/**
 * The Inspect action on the Inspector (plan 12): send the robot or the drone to the selected item, follow it, speed
 * the mission up, bring it home. Alpha field only, like the toolbar's Workers. A valve or instrument sends the unit
 * to what it is mounted on. A unit that can't reach the item stays disabled and says why.
 */
import { useMemo, useState } from 'react'
import { isAlphaField, usePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { FF_SPEEDS, PHASE_LABEL, UNITS, UNIT_SPEC, abortInspection, dispatchInspection, reach, setFastForward, targetOf, useInspection, type UnitId } from '../safety/inspection'
import { GRADE_RANK, useCorrosion } from '../safety/corrosion'

function UnitLine({ u }: { u: UnitId }) {
  const s = useInspection((x) => x.units[u])
  const ff = useInspection((x) => x.ff)
  return (
    <div className="ins-run">
      <div className="small">
        <b>{UNIT_SPEC[u].label}</b> <span className="muted">· {PHASE_LABEL[s.phase]}{s.tag ? ` ${s.tag}` : ''} · {s.done}/{s.total}</span>
      </div>
      {s.hold && <div className="small ins-hold">Stopped for {s.hold.name}, {s.hold.gap} m away</div>}
      <div className="insp-actions" style={{ padding: 0, border: 0 }}>
        {FF_SPEEDS.map((x) => (
          <button key={x} className={ff === x ? 'on' : ''} onClick={() => setFastForward(x)} title={x === 1 ? 'Mission at normal speed' : `Mission clock ×${x}. The plant keeps its own speed.`} data-ff={x}>
            {x === 1 ? 'Normal' : `▶▶ ${x}×`}
          </button>
        ))}
        <button onClick={() => abortInspection(u)} title="Bring the unit home; the report shows what was left">
          Recall
        </button>
      </div>
    </div>
  )
}

export function InspectAction({ tag }: { tag: string }) {
  const plant = usePlant()
  const target = useMemo(() => targetOf(plant, tag), [plant, tag])
  const can = useMemo(() => reach(plant, tag), [plant, tag])
  const busy = useInspection((x) => UNITS.filter((u) => x.units[u].mission).join())
  const lastReport = useInspection((x) => x.reports.find((r) => r.stops.some((s) => s.tag === target && s.status === 'inspected'))?.id ?? null)
  const worst = useCorrosion((x) => x.findings.find((f) => f.tag === target))
  const [msg, setMsg] = useState<string | null>(null)
  if (!isAlphaField(plant)) return null
  const open = (id: string) => {
    useInspection.setState({ openReport: id })
    useStore.getState().setHmi('inspection')
  }
  const go = (unit: UnitId) => setMsg(dispatchInspection({ tag, unit }))
  return (
    <section className="sec" data-inspect={tag}>
      <h4>Inspection · simulated</h4>
      <div className="insp-actions" style={{ padding: 0, border: 0 }}>
        {UNITS.map((u) => {
          const why = typeof can[u] === 'string' ? (can[u] as string) : null
          return (
            <button key={u} disabled={!!why || busy.includes(u)} onClick={() => go(u)} title={why ?? `Send the ${UNIT_SPEC[u].label.toLowerCase()} to ${target}`} data-act={`inspect-${u}`}>
              Inspect with {u}
            </button>
          )
        })}
      </div>
      {target !== tag && <div className="muted small">Goes to {target}, which carries {tag}</div>}
      {msg && <div className="small" style={{ color: '#ffd479', marginTop: 4 }}>{msg}</div>}
      {busy && UNITS.filter((u) => busy.includes(u)).map((u) => <UnitLine key={u} u={u} />)}
      {worst && GRADE_RANK[worst.grade] >= GRADE_RANK.moderate && (
        <div className="small" style={{ marginTop: 4 }}>
          Corrosion {worst.wallPct} % wall, {worst.grade}, {worst.rateMmPerYr} mm/yr
        </div>
      )}
      {lastReport && (
        <button className="link" style={{ marginTop: 4 }} onClick={() => open(lastReport)} data-act="inspect-report">
          Report {lastReport}
        </button>
      )}
    </section>
  )
}
