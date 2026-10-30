/**
 * Always-visible running-scenario chip: title, elapsed sim time, objectives done / total. Click to
 * open the console's Scenarios page. After a scenario ends it offers the debrief until opened.
 * Mount once at the app root (it is position: fixed, above the console).
 */
import { useStore } from '../state/store'
import { useScenario } from '../sim/scenarios'
import { fmtEl } from '../sim/scen/helpers'
import './hmi/scenarios.css'

export function ScenarioChip() {
  const title = useScenario((s) => s.live?.title)
  const el = useScenario((s) => s.live?.el)
  const done = useScenario((s) => s.live?.done)
  const total = useScenario((s) => s.live?.total)
  const failed = useScenario((s) => s.live?.failed)
  const lastScore = useScenario((s) => s.last?.score)
  const lastId = useScenario((s) => s.last?.id)
  const view = useScenario((s) => s.view)
  const hmi = useStore((s) => s.hmi)
  const open = () => useStore.getState().setHmi('scenarios')
  if (title !== undefined) {
    return (
      <button className="scn-chip" onClick={open} title="Training scenario running: open the Scenarios page" data-scn-chip="running">
        <span className="dot" />
        <span className="ttl">{title}</span>
        <span className="sep">·</span>
        <span className="mono">{fmtEl(el ?? 0)}</span>
        <span className="sep">·</span>
        <span className="mono">
          {done ?? 0}/{total ?? 0}
        </span>
        {!!failed && <span className="bad mono">✗{failed}</span>}
      </button>
    )
  }
  // finished: offer the debrief while it is not on screen
  const showing = hmi === 'scenarios' && view.kind === 'debrief' && view.attemptId === lastId
  if (lastId && view.kind === 'debrief' && view.attemptId === lastId && !showing) {
    return (
      <button className="scn-chip done" onClick={open} data-scn-chip="done">
        <span className="dot" />
        <span>Scenario complete: score {lastScore}</span>
        <span className="sep">·</span>
        <span>open debrief</span>
      </button>
    )
  }
  return null
}
