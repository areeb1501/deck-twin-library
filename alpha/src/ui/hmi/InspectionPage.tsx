/**
 * Inspections: the console page for the simulated drone and robot (plan 12).
 *
 *  - Inspect: pick a unit and an area or an item. Refusals say why (wind, ESD, out of reach, charging).
 *  - The units: phase, battery, live camera, fast-forward (the mission clock only), recall, and who they stopped for.
 *  - Reports: every mission, newest first. Each item shows what was read through sample(), with limits and source, its
 *    health, open work orders, the simulated corrosion grade and the evidence frame. Stops for workers are listed with
 *    the closest anyone came, and the report says so plainly when Workers were off and there was nobody to stop for.
 *  - Clip: what the unit's camera recorded, as a flipbook, with each scan and each stop marked on the timeline.
 *
 * Reads useInspection and the clip store; acts through dispatchInspection and friends. Nothing here is live plant data.
 */
import { useEffect, useMemo, useState } from 'react'
import { Box, Kpi, Msg, TagLink } from './common'
import { usePlant } from '../../state/plantStore'
import { useStore } from '../../state/store'
import { fmtClock } from '../../sim/types'
import { maint } from '../../sim/maintenance'
import { DRONE_WIND_LIMIT, FF_SPEEDS, MAX_STOPS, PHASE_LABEL, UNITS, UNIT_SPEC, abortInspection, areaTargets, clips, dispatchInspection, inspectableZones, setFastForward, stopFor, useInspection, type ClipFrame, type InspectionReport, type StopResult, type UnitId } from '../../safety/inspection'
import { useS } from './simApi'
import { walkToTag } from '../walkTo'
import './inspection.css'

const mins = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
const VERDICT = { ok: 'OK', watch: 'Watch', action: 'Action' } as const

/** poll a value while it can change (the clip store is outside React on purpose) */
function useTicker(ms: number, on = true) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setN((x) => x + 1), ms)
    return () => clearInterval(id)
  }, [ms, on])
  return n
}

export function InspectionPage() {
  return (
    <div className="ins" data-inspection-page>
      <div className="ins-note">
        <b>Simulated.</b> The drone, the robot, their readings and the corrosion grades are all simulated in the twin. No hardware is connected, and the camera is a render of the twin.
      </div>
      <div className="ins-top">
        <LaunchBox />
        {UNITS.map((u) => (
          <UnitCard key={u} u={u} />
        ))}
      </div>
      <Reports />
    </div>
  )
}

function LaunchBox() {
  const plant = usePlant()
  const [unit, setUnit] = useState<UnitId>('robot')
  const [target, setTarget] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const zones = useMemo(() => inspectableZones(plant).map((z) => ({ id: z.id, name: z.name, n: areaTargets(plant, z.id, unit).length })).filter((z) => z.n), [plant, unit])
  const items = useMemo(() => plant.equipment.filter((e) => typeof stopFor(plant, unit, e.tag) !== 'string').map((e) => e.tag), [plant, unit])
  const pick = target || (zones[0] ? `area:${zones[0].id}` : '')
  const area = pick.startsWith('area:') ? zones.find((z) => `area:${z.id}` === pick) : undefined
  const go = () => {
    const [kind, id] = [pick.slice(0, pick.indexOf(':')), pick.slice(pick.indexOf(':') + 1)]
    const r = dispatchInspection(kind === 'area' ? { unit, area: id } : { unit, tag: id })
    setMsg(r ?? `✓ ${UNIT_SPEC[unit].label} sent`)
  }
  return (
    <Box title="Inspect">
      <div className="ins-seg">
        {UNITS.map((u) => (
          <button key={u} className={unit === u ? 'on' : ''} onClick={() => (setUnit(u), setTarget(''))} data-unit={u}>
            {u === 'robot' ? 'Robot' : 'Drone'}
          </button>
        ))}
      </div>
      <select className="ins-sel" value={pick} onChange={(e) => setTarget(e.target.value)} data-inspect-target>
        <optgroup label="Areas">
          {zones.map((z) => (
            <option key={z.id} value={`area:${z.id}`}>
              {z.name} ({z.n})
            </option>
          ))}
        </optgroup>
        <optgroup label="Items">
          {items.map((t) => (
            <option key={t} value={`tag:${t}`}>
              {t}
            </option>
          ))}
        </optgroup>
      </select>
      {area && area.n > MAX_STOPS && <div className="dim small">A mission takes the nearest {MAX_STOPS} of {area.n}.</div>}
      <button className="ins-go" onClick={go} disabled={!pick} data-act="inspect-go">
        Inspect
      </button>
      <Msg text={msg} />
      <div className="dim small">
        {unit === 'robot' ? 'Main deck level, every platform and bridge. Stops 3.5 m from workers.' : `In the open only, under ${DRONE_WIND_LIMIT} m/s wind. Stops 6 m from workers.`}
      </div>
    </Box>
  )
}

function UnitCard({ u }: { u: UnitId }) {
  const s = useInspection((x) => x.units[u])
  const ff = useInspection((x) => x.ff)
  const speed = useS((x) => x.speed) ?? 1
  const workers = useStore((x) => x.workers)
  const live = !!s.mission
  useTicker(500, live)
  const frames = s.mission ? clips.get(s.mission)?.frames : undefined
  const frame = frames?.[frames.length - 1]
  const rate = Math.max(speed, ff)
  return (
    <Box title={UNIT_SPEC[u].label} right={<span className={`ins-phase ${s.hold ? 'hold' : live ? 'busy' : ''}`}>{s.hold ? 'Stopped for a worker' : PHASE_LABEL[s.phase]}</span>} className="ins-unit">
      <div className="ins-cam">
        {frame ? <img src={frame.url} alt={`${UNIT_SPEC[u].label} camera, simulated`} /> : <div className="ins-cam-off">{live ? 'Camera starting' : 'Camera off'}</div>}
      </div>
      <div className="ins-stats">
        <Kpi label="Battery" value={String(s.battery)} unit="%" abn={s.battery < 30} />
        <Kpi label="Done" value={live ? `${s.done}/${s.total}` : '-'} />
        <Kpi label="Left" value={live && s.etaS !== null ? mins(s.etaS / (rate || 1)) : '-'} title="Rough time left at this speed" />
      </div>
      {s.hold && (
        <div className="ins-holdbar" data-hold>
          Stopped {s.hold.gap} m from {s.hold.name}. Fast-forward waits until the way is clear.
        </div>
      )}
      {live ? (
        <>
          <div className="ins-line dim">
            {s.mission} · {s.label}
            {s.tag ? ` · at ${s.tag}` : ''}
          </div>
          <div className="ins-seg">
            {FF_SPEEDS.map((x) => (
              <button key={x} className={ff === x ? 'on' : ''} onClick={() => setFastForward(x)} title={x === 1 ? 'Mission at normal speed' : `Mission clock ×${x}. The plant keeps its own speed.`} data-ff={x}>
                {x === 1 ? 'Normal' : `▶▶ ${x}×`}
              </button>
            ))}
            <button className="warn" onClick={() => abortInspection(u)} data-act="inspect-recall">
              Recall
            </button>
          </div>
        </>
      ) : (
        <div className="ins-line dim">{workers ? 'Crew on deck: standoff active' : 'Workers off: nobody on deck to stop for'}</div>
      )}
    </Box>
  )
}

function Reports() {
  const reports = useInspection((s) => s.reports)
  const openId = useInspection((s) => s.openReport)
  const open = reports.find((r) => r.id === openId) ?? reports[0]
  return (
    <div className="ins-reports">
      <Box title="Reports" right={<span className="dim">{reports.length}</span>} className="ins-list">
        {!reports.length && <div className="dim ins-empty">No inspections yet. Send a unit from here, or select an item in 3D and use Inspect.</div>}
        {reports.map((r) => (
          <button key={r.id} className={`ins-row ${open?.id === r.id ? 'sel' : ''}`} onClick={() => useInspection.setState({ openReport: r.id })} data-report={r.id}>
            <span className="mono">{r.id}</span>
            <span className="grow">{r.label}</span>
            <span className={`ins-st ${r.status}`}>{r.status}</span>
            <span className="dim mono">{fmtClock(r.t1)}</span>
          </button>
        ))}
      </Box>
      {open && <ReportView key={open.id} r={open} />}
    </div>
  )
}

function ReportView({ r }: { r: InspectionReport }) {
  const inspected = r.stops.filter((s) => s.status === 'inspected')
  return (
    <div className="ins-report" data-report-view={r.id}>
      <Box title={`Simulated inspection report ${r.id}`} right={<span className="dim">{UNIT_SPEC[r.unit].label}</span>}>
        <div className="ins-sum">{r.summary}</div>
        <div className="ins-stats">
          <Kpi label="Inspected" value={`${inspected.length}/${r.stops.length}`} />
          <Kpi label="Action" value={String(inspected.filter((s) => s.verdict === 'action').length)} bad={inspected.some((s) => s.verdict === 'action')} />
          <Kpi label="Mission time" value={mins(r.missionS)} title={`Mission clock, ${fmtClock(r.t0)} to ${fmtClock(r.t1)} on the plant clock`} />
          <Kpi label="Fast-forward" value={r.ffMax > 1 ? `${r.ffMax}×` : 'none'} title="The mission clock only; the plant kept its own speed" />
        </div>
        <Standoff r={r} />
      </Box>
      <ClipPlayer id={r.missionId} />
      <Box title="Items" right={<span className="dim">values read through the live data feed while on station (simulated historian)</span>}>
        {r.stops.map((s) => (
          <StopView key={s.tag} s={s} />
        ))}
      </Box>
    </div>
  )
}

function Standoff({ r }: { r: InspectionReport }) {
  if (!r.workersOn) return <div className="ins-stand dim">Workers were off, so nobody was on deck: the worker standoff was not exercised on this mission.</div>
  return (
    <div className="ins-stand" data-standoff>
      <div>
        Standoff {r.stopM} m, backs off inside {r.keepM} m. Closest anyone came: <b className="mono">{r.minGap === null ? 'nobody near' : `${r.minGap} m`}</b>.
      </div>
      {r.holds.length === 0 && <div className="dim">No stops for workers on this mission.</div>}
      {r.holds.map((h, i) => (
        <div key={i} className={h.cornered ? 'ins-corner' : 'dim'}>
          {fmtClock(h.t)} · stopped {h.forS} s for {h.worker}, closest {h.minGap} m, {h.outcome}
          {h.cornered ? '. Nowhere to back off to: the worker reached the unit' : ''}
        </div>
      ))}
    </div>
  )
}

function StopView({ s }: { s: StopResult }) {
  const [msg, setMsg] = useState<string | null>(null)
  const raiseWo = () => {
    const w = maint.raise(s.tag, { type: 'condition', priority: s.verdict === 'action' ? 2 : 3, by: 'Inspection report', title: `Inspection: ${s.notes[0] ?? 'follow up'}` })
    setMsg(w.why ?? `✓ ${w.id} raised`)
  }
  if (s.status === 'skipped')
    return (
      <div className="ins-stop skipped">
        <div className="ins-stop-head">
          <TagLink tag={s.tag} />
          <span className="grow dim">{s.name}</span>
          <span className="ins-v skip">Not inspected</span>
        </div>
        <div className="dim">{s.skipReason}</div>
      </div>
    )
  const out = s.readings.filter((x) => x.state !== 'normal')
  return (
    <div className={`ins-stop ${s.verdict}`} data-stop={s.tag}>
      {s.thumb && <img className="ins-thumb" src={s.thumb} alt={`${s.tag}, simulated camera`} />}
      <div className="ins-stop-body">
        <div className="ins-stop-head">
          <TagLink tag={s.tag} />
          <span className="grow dim">{s.name} · {s.platform}</span>
          <span className={`ins-v ${s.verdict}`}>{VERDICT[s.verdict]}</span>
        </div>
        {s.notes.map((n) => (
          <div key={n}>{n}</div>
        ))}
        {!s.notes.length && <div className="dim">Nothing to report.</div>}
        <table className="ins-tbl">
          <tbody>
            {(out.length ? [...out, ...s.readings.filter((x) => x.state === 'normal')] : s.readings).slice(0, 6).map((x) => (
              <tr key={x.tag} className={x.state}>
                <td>{x.label}</td>
                <td className="mono r">
                  {x.value} {x.unit}
                </td>
                <td className="mono dim r">
                  {x.lo ?? '-'} … {x.hi ?? '-'}
                </td>
                <td className="dim">{x.source === 'simulated' ? 'simulated' : x.tag}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.corrosion && (
          <div className="dim">
            Wall {s.corrosion.wallPct} % ({s.corrosion.grade}), {s.corrosion.rateMmPerYr} mm/yr, last survey {s.corrosion.lastSurveyPct} %. {s.corrosion.method === 'ut' ? 'Simulated UT' : 'Simulated visual'}. Assumption, not survey data.
          </div>
        )}
        <div className="ins-acts">
          <button onClick={() => walkToTag(s.tag)}>Walk to</button>
          {s.verdict !== 'ok' && (
            <button onClick={raiseWo} data-act="inspect-wo">
              Raise work order
            </button>
          )}
        </div>
        <Msg text={msg} />
      </div>
    </div>
  )
}

/** the recorded clip: a flipbook of the frames the unit's camera took */
function ClipPlayer({ id }: { id: string }) {
  const clip = clips.get(id)
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const frames: ClipFrame[] = clip?.frames ?? []
  const n = frames.length
  useEffect(() => {
    if (!playing || !n) return
    // the last frame stops the clip: the timer ends with it
    const iv = setInterval(() => setI((x) => (x + 1 >= n ? (setPlaying(false), x) : x + 1)), 125 / rate)
    return () => clearInterval(iv)
  }, [playing, rate, n])
  if (!clip || !n) return <Box title="Recorded clip"><div className="dim ins-empty">{clip ? 'No frames were recorded (the tab was in the background).' : 'This clip is no longer held in memory.'}</div></Box>
  const f = frames[Math.min(i, n - 1)]
  const marks = frames.map((x, k) => (x.mark && !/launch|returning/.test(x.mark) ? { k, mark: x.mark } : null)).filter((x): x is { k: number; mark: string } => !!x)
  return (
    <Box title="Recorded clip" right={<span className="dim">{n} frames · simulated · {clip.unit === 'robot' ? 'robot' : 'drone'} camera</span>} className="ins-clip" >
      <div className="ins-screen">
        <img src={f.url} alt="Recorded frame, simulated" data-clip-frame={i} />
      </div>
      <div className="ins-controls">
        <button onClick={() => (i >= n - 1 && setI(0), setPlaying(!playing))} data-act="clip-play">
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="ins-track">
          <input type="range" min={0} max={n - 1} value={Math.min(i, n - 1)} onChange={(e) => (setPlaying(false), setI(+e.target.value))} aria-label="Clip position" />
          {marks.map((m) => (
            <i key={m.k} className={m.mark === 'hold' ? 'hold' : ''} style={{ left: `${(m.k / Math.max(1, n - 1)) * 100}%` }} title={m.mark} onClick={() => (setPlaying(false), setI(m.k))} />
          ))}
        </div>
        <div className="ins-seg">
          {[1, 4].map((x) => (
            <button key={x} className={rate === x ? 'on' : ''} onClick={() => setRate(x)}>
              {x}×
            </button>
          ))}
        </div>
        <span className="mono dim">
          {mins(f.clock)} · {fmtClock(f.t)}
        </span>
      </div>
    </Box>
  )
}
