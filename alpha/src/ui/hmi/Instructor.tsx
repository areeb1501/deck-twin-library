/**
 * Instructor station: inject faults into the running simulation (gas release, fire, machine trip,
 * stuck ESDV, level-control / anti-surge / instrument-air / cooling failure, export blocked,
 * detector fault), watch and clear the active incidents, and set the wind.
 */
import { useMemo, useState } from 'react'
import { usePlant } from '../../state/plantStore'
import { detectors, fireZones, tagPosition, zoneAt } from '../../sim/fg'
import { fmtClock, type Fault, type Incident } from '../../sim/types'
import type { Plant, Vec3 } from '../../model/types'
import { EMPTY_ARR, EMPTY_OBJ, NOT_READY, call, fmt, machinesOf, useS } from './simApi'
import { Box, Msg } from './common'
import { DemoStory } from './DemoStory'

interface ReleasePoint {
  id: string
  label: string
  tag: string
  at: Vec3
  zone: string | null
}

/** named release points from equipment positions (a nozzle where one fits the description) */
const POINTS: { label: string; tag: string; nozzle?: RegExp; dy?: number }[] = [
  { label: 'Flange leak at K-2200 discharge', tag: 'K-2200', nozzle: /disch|outlet/i },
  { label: 'Flange leak at K-2200 suction', tag: 'K-2200', nozzle: /suct|inlet/i },
  { label: 'V-1100 inlet', tag: 'V-1100', nozzle: /inlet/i },
  { label: 'V-1100 gas outlet', tag: 'V-1100', nozzle: /gas/i },
  { label: 'V-1300 LP separator', tag: 'V-1300', dy: 1 },
  { label: 'Production manifold M-1000', tag: 'M-1000', dy: 1 },
  { label: 'Compressor suction scrubber V-2100', tag: 'V-2100', dy: 1 },
  { label: 'Export pump P-1500A seal', tag: 'P-1500A', dy: 0.6 },
  { label: 'Gas export ESDV-2301', tag: 'ESDV-2301' },
  { label: 'Fuel gas scrubber V-5100', tag: 'V-5100', dy: 1 },
  { label: 'Fuel gas at GT-8100A (weather deck)', tag: 'GT-8100A', dy: 1 },
  { label: 'Wellhead XT-130 (cellar deck)', tag: 'XT-130', dy: 1 },
  { label: 'WHP-N well bay (XT-N103)', tag: 'XT-N103', dy: 1 },
  { label: 'WHP-N production manifold M-N200', tag: 'M-N200', dy: 1 },
  { label: 'WHP-N desander V-N230', tag: 'V-N230', dy: 1 },
  { label: 'Oil export ESDV-1601 (export header)', tag: 'ESDV-1601' },
  // RP — riser & export platform (skipped while the platform is not in the plant)
  { label: 'RP oil riser topsides ESDV-R101', tag: 'ESDV-R101', dy: 1 },
  { label: 'RP gas riser topsides ESDV-R201', tag: 'ESDV-R201', dy: 1 },
  { label: 'RP oil export metering X-R150', tag: 'X-R150', dy: 1 },
  { label: 'RP gas export metering X-R250', tag: 'X-R250', dy: 1 },
  { label: 'RP oil pig launcher L-R110', tag: 'L-R110', dy: 1 },
  { label: 'RP gas pig launcher L-R210', tag: 'L-R210', dy: 1 },
  // WI — water-injection platform
  { label: 'WI injection pump P-W310A', tag: 'P-W310A', dy: 0.6 },
  { label: 'WI injection pump P-W310B', tag: 'P-W310B', dy: 0.6 },
  { label: 'WI seawater lift pump P-W300A', tag: 'P-W300A', dy: 0.6 },
  { label: 'WI deaerator V-W320', tag: 'V-W320', dy: 1 },
]

function releasePoints(plant: Plant): ReleasePoint[] {
  return POINTS.flatMap((p, i) => {
    const e = plant.equipment.find((x) => x.tag === p.tag)
    const nz = p.nozzle ? e?.nozzles.find((n) => p.nozzle!.test(n.name)) : undefined
    let base: Vec3 | null | undefined = nz?.pos
    try {
      base ??= tagPosition(plant, p.tag)
    } catch {
      base = null
    }
    if (!base) return []
    const at: Vec3 = [base[0], base[1] + (p.dy ?? 0), base[2]]
    return [{ id: `rp${i}`, label: p.label, tag: p.tag, at, zone: zoneAt(plant, at)?.id ?? null }]
  })
}

const resultMsg = (r: string | null, what: string) => (r === NOT_READY ? r : `✓ ${what}${r ? `: ${r}` : ''}`)

export function Instructor() {
  const plant = usePlant()
  const points = useMemo(() => releasePoints(plant), [plant])
  const zones = useMemo(() => fireZones(plant), [plant])
  const [msg, setMsg] = useState<string | null>(null)
  const inject = (f: Fault, what: string) => setMsg(resultMsg(call('inject', f), what))
  return (
    <div className="h-grid">
      <p className="h-note">Injected faults reach the console as alarms, trips, shutdowns and F&G events.</p>
      <DemoStory launcher />
      <Msg text={msg} />
      <div className="h-inst">
        <Release kind="gas" points={points} zones={zones} inject={inject} />
        <Release kind="fire" points={points} zones={zones} inject={inject} />
        <TripBox plant={plant} inject={inject} />
        <Upsets plant={plant} inject={inject} />
        <DetectorFault plant={plant} inject={inject} />
        <Wind />
      </div>
      <Incidents />
    </div>
  )
}

type Inject = (f: Fault, what: string) => void

function Release({ kind, points, zones, inject }: { kind: 'gas' | 'fire'; points: ReleasePoint[]; zones: { id: string; name: string }[]; inject: Inject }) {
  const [zone, setZone] = useState('all')
  const list = points.filter((p) => zone === 'all' || p.zone === zone)
  const [pt, setPt] = useState(points[0]?.id ?? '')
  const [rate, setRate] = useState(kind === 'gas' ? 1 : 10)
  const sel = list.find((p) => p.id === pt) ?? list[0]
  const go = () => {
    if (!sel) return
    if (kind === 'gas') inject({ kind: 'gasRelease', at: sel.at, rateKgS: rate, source: sel.tag, label: sel.label }, `Gas release ${rate} kg/s at ${sel.label}`)
    else inject({ kind: 'fire', at: sel.at, sizeMW: rate, source: sel.tag, label: sel.label }, `${rate} MW fire at ${sel.label}`)
  }
  return (
    <Box title={kind === 'gas' ? 'Gas release' : 'Fire'}>
      <label>
        Fire zone
        <select value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value="all">All zones</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.id} - {z.name}
            </option>
          ))}
        </select>
        <span />
      </label>
      <label>
        Location
        <select value={sel?.id ?? ''} onChange={(e) => setPt(e.target.value)} data-inst={`${kind}-point`}>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.zone ? ` (${p.zone})` : ''}
            </option>
          ))}
        </select>
        <span />
      </label>
      {kind === 'gas' ? (
        <label>
          Release rate
          <input type="range" min={0.1} max={5} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} />
          <span className="mono">{rate.toFixed(1)} kg/s</span>
        </label>
      ) : (
        <label>
          Fire size
          <input type="range" min={1} max={60} step={1} value={rate} onChange={(e) => setRate(+e.target.value)} />
          <span className="mono">{rate} MW</span>
        </label>
      )}
      {sel && (
        <div className="faint mono" style={{ fontSize: 10.5 }}>
          at {sel.at.map((v) => v.toFixed(1)).join(', ')} m (deck) · {sel.zone ?? 'outside the fire zones'}
        </div>
      )}
      <div>
        <button className="danger" onClick={go} disabled={!sel} data-inst={`${kind}-go`}>
          {kind === 'gas' ? 'Start gas release' : 'Start fire'}
        </button>
      </div>
    </Box>
  )
}

function TripBox({ plant, inject }: { plant: Plant; inject: Inject }) {
  const list = useMemo(() => machinesOf(plant), [plant])
  const [tag, setTag] = useState(list[0]?.tag ?? '')
  const [cause, setCause] = useState('high vibration')
  const [local, setLocal] = useState(false)
  const [repairH, setRepairH] = useState(0)
  return (
    <Box title="Machine trip">
      <label>
        Machine
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          {list.map((e) => (
            <option key={e.tag} value={e.tag}>
              {e.tag} - {e.name}
            </option>
          ))}
        </select>
        <span />
      </label>
      <label>
        Trip cause
        <input type="text" value={cause} onChange={(e) => setCause(e.target.value)} list="hmi-trip-causes" />
        <span />
      </label>
      <datalist id="hmi-trip-causes">
        {['high vibration', 'high bearing temperature', 'low lube oil pressure', 'seal failure', 'motor overload', 'high discharge temperature', 'loss of flame', 'overspeed'].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <label>
        Local reset
        <input type="checkbox" checked={local} onChange={(e) => setLocal(e.target.checked)} style={{ justifySelf: 'start' }} />
        <span className="dim">field operator must reset</span>
      </label>
      <label>
        Repair time
        <input type="range" min={0} max={48} step={1} value={repairH} onChange={(e) => setRepairH(+e.target.value)} />
        <span className="mono">{repairH ? `${repairH} h` : 'none'}</span>
      </label>
      <div>
        <button className="danger" disabled={!tag} onClick={() => inject({ kind: 'trip', tag, cause, local: local || undefined, repairH: repairH || undefined }, `Trip ${tag} (${cause})`)}>
          Trip machine
        </button>
      </div>
    </Box>
  )
}

function Upsets({ plant, inject }: { plant: Plant; inject: Inject }) {
  const esdvs = useMemo(() => plant.valves.filter((v) => v.type === 'esdv' || v.type === 'bdv'), [plant])
  const [valve, setValve] = useState(esdvs[0]?.tag ?? '')
  return (
    <Box title="Process & utility failures">
      <label>
        Stuck valve
        <select value={valve} onChange={(e) => setValve(e.target.value)}>
          {esdvs.map((v) => (
            <option key={v.tag} value={v.tag}>
              {v.tag}
            </option>
          ))}
        </select>
        <button className="danger" disabled={!valve} onClick={() => inject({ kind: 'valveStuck', tag: valve }, `${valve} stuck`)}>
          Stick
        </button>
      </label>
      <div className="h-row">
        <button className="danger" onClick={() => inject({ kind: 'levelControlFail', tag: 'LV-1101' }, 'HP separator level control LV-1101 failed')}>
          HP level control fails (LV-1101)
        </button>
        <button className="danger" onClick={() => inject({ kind: 'antiSurgeFail' }, 'Anti-surge control failed')}>
          Anti-surge fails
        </button>
        <button className="danger" onClick={() => inject({ kind: 'instrumentAirFail' }, 'Instrument air failure')}>
          Instrument air fails
        </button>
        <button className="danger" onClick={() => inject({ kind: 'coolingFail' }, 'Cooling failure')}>
          Cooling fails
        </button>
        <button className="danger" onClick={() => inject({ kind: 'exportBlocked' }, 'Export blocked')}>
          Export blocked
        </button>
      </div>
    </Box>
  )
}

function DetectorFault({ plant, inject }: { plant: Plant; inject: Inject }) {
  const simDet = useS((s) => s.detectors) ?? EMPTY_OBJ
  const tags = useMemo(() => {
    const set = new Set<string>([...detectors(plant).map((d) => d.tag), ...Object.keys(simDet)])
    for (const i of plant.instruments) if (['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'].includes(i.type)) set.add(i.tag)
    return [...set].sort()
  }, [plant, simDet])
  const [tag, setTag] = useState('')
  const cur = tag || tags[0] || ''
  return (
    <Box title="Detector fault">
      <label>
        Detector
        {tags.length ? (
          <select value={cur} onChange={(e) => setTag(e.target.value)}>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
                {simDet[t] ? ` (${(simDet[t] as { state?: string }).state ?? ''})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <input type="text" value={tag} placeholder="detector tag" onChange={(e) => setTag(e.target.value)} />
        )}
        <button className="danger" disabled={!cur} onClick={() => inject({ kind: 'detectorFault', tag: cur }, `${cur} faulted`)}>
          Fault
        </button>
      </label>
    </Box>
  )
}

function Wind() {
  const wind = useS((s) => s.knobs?.wind)
  const from = wind?.from ?? 0
  const speed = wind?.speed ?? 0
  const [msg, setMsg] = useState<string | null>(null)
  const set = (w: { from: number; speed: number }) => setMsg(call('setKnob', 'wind', w))
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return (
    <Box title="Wind">
      <label>
        From
        <input type="range" min={0} max={355} step={5} value={from} onChange={(e) => set({ from: +e.target.value, speed })} disabled={!wind} />
        <span className="mono">
          {from}° {dirs[Math.round(from / 45) % 8]}
        </span>
      </label>
      <label>
        Speed
        <input type="range" min={0} max={30} step={0.5} value={speed} onChange={(e) => set({ from, speed: +e.target.value })} disabled={!wind} />
        <span className="mono">{speed.toFixed(1)} m/s</span>
      </label>
      <svg viewBox="-30 -30 60 60" width={60} height={60}>
        <circle r={26} fill="none" stroke="#565a60" />
        <text y={-18} textAnchor="middle" style={{ fill: '#8d9297', fontSize: 8 }}>
          N
        </text>
        {/* arrow blows FROM `from` toward the opposite side */}
        <g transform={`rotate(${from})`}>
          <path d="M0,-22 L0,16 M-5,10 L0,18 L5,10" stroke="#c9ccd0" strokeWidth={2} fill="none" />
        </g>
      </svg>
      <Msg text={msg} />
    </Box>
  )
}

function describe(f: Fault): string {
  switch (f.kind) {
    case 'gasRelease':
      return `Gas release ${fmt(f.rateKgS, 1)} kg/s${f.label ? `: ${f.label}` : ''}`
    case 'fire':
      return `Fire ${fmt(f.sizeMW)} MW${f.label ? `: ${f.label}` : ''}`
    case 'trip':
      return `Trip ${f.tag} (${f.cause})${f.local ? ' · local reset' : ''}${f.repairH ? ` · repair ${f.repairH} h` : ''}`
    case 'valveStuck':
      return `${f.tag} stuck`
    case 'levelControlFail':
      return `Level control ${f.tag} failed`
    case 'antiSurgeFail':
      return 'Anti-surge control failed'
    case 'instrumentAirFail':
      return 'Instrument air failure'
    case 'coolingFail':
      return 'Cooling failure'
    case 'exportBlocked':
      return 'Export blocked'
    case 'detectorFault':
      return `Detector ${f.tag} faulted`
    default:
      return 'Incident'
  }
}

function Incidents() {
  const incidents = (useS((s) => s.incidents) ?? EMPTY_ARR) as Incident[]
  const [armReset, setArmReset] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const active = incidents.filter((i) => i.cleared === undefined)
  const done = incidents.filter((i) => i.cleared !== undefined)
  return (
    <Box
      title={`Active incidents: ${active.length}`}
      right={
        armReset ? (
          <span className="h-row" style={{ textTransform: 'none', letterSpacing: 0 }}>
            <button className="danger armed" onClick={() => (setMsg(call('reset') ?? '✓ Simulation reset to normal operation'), setArmReset(false))}>
              Confirm reset
            </button>
            <button onClick={() => setArmReset(false)}>Cancel</button>
          </span>
        ) : (
          <button onClick={() => setArmReset(true)} style={{ textTransform: 'none', letterSpacing: 0 }}>
            Reset simulation…
          </button>
        )
      }
    >
      {incidents.length === 0 ? (
        <div className="h-empty">No incidents injected.</div>
      ) : (
        <table className="h-tbl" data-tbl="incidents">
          <thead>
            <tr>
              <th>Since</th>
              <th>Incident</th>
              <th>Platform / zone</th>
              <th>Now</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...active, ...done.slice(0, 8)].map((i) => (
              <tr key={i.id} style={i.cleared !== undefined ? { opacity: 0.5 } : undefined}>
                <td className="mono">{fmtClock(i.at)}</td>
                <td className="wrap">{describe(i.fault)}</td>
                <td className="dim">
                  {i.platform ?? ''}
                  {i.zone ? ` · ${i.zone}` : ''}
                </td>
                <td className="mono">
                  {i.cleared !== undefined ? `cleared ${fmtClock(i.cleared, false)}` : [typeof i.rate === 'number' ? `${fmt(i.rate, 2)} kg/s` : '', i.burning === true ? 'burning' : i.burning === false ? 'out' : ''].filter(Boolean).join(' · ') || 'active'}
                </td>
                <td className="act">
                  {i.cleared === undefined && (
                    <button onClick={() => setMsg(call('clearIncident', i.id) ?? `✓ Cleared ${describe(i.fault)}`)} data-act="clear-incident">
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Msg text={msg} />
    </Box>
  )
}
