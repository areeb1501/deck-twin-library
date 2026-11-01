/**
 * F&G mapping panel: coverage per fire zone against its targets (flame = geographic coverage,
 * gas = scenario coverage, 1ooN and 2ooN), detector counts, the live zone status, the zone's
 * detectors with their live reading / state and an Inhibit toggle, and a plain-language note on how
 * coverage is computed. Clicking a zone flies the camera to it.
 *
 * Exports: FgPanel (page or side panel), FgMappingLegend (small floating legend + flame / gas toggle
 * for the heatmap layer).
 */
import { useMemo, useState } from 'react'
import { usePlant } from '../state/plantStore'
import { DECK_WORLD_Y, useStore } from '../state/store'
import { useSim } from '../state/sim'
import {
  CELL, FD_RANGE, GAS_HIGH, MONITOR_HEIGHT, OGD_HIGH, REF_FIRE_MW, REF_RELEASE_KGS,
  coverage, detectors, fireZones, zoneCentre, type Detector, type DetectorType, type FireZone, type ZoneCoverage,
} from '../sim/fg'
import { keySet, setInhibit, useDetectorStates, useExcludedKey, useInhibits, useZoneStatus, windKeyOf } from '../sim/fg/live'
import { FG_LEVELS, useFgView } from '../sim/fg/view'
import type { ZoneStatus } from '../sim/types'

const TYPES: DetectorType[] = ['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC']
const TYPE_LABEL: Record<DetectorType, string> = { FD: 'IR3 flame', GD: 'Point gas', OGD: 'Open-path gas', HD: 'Heat', SD: 'Smoke', MAC: 'Manual call point' }
const KIND_LABEL: Record<FireZone['kind'], string> = { process: 'Process', wellbay: 'Well bay', utility: 'Utility', turbine: 'Turbine / power', drilling: 'Drilling', lq: 'LQ', module: 'Module', bridge: 'Bridge' }
const pc = (v: number) => `${Math.round(v * 100)}`

const CSS = `
.fgp { display: flex; flex-direction: column; gap: 10px; font-size: 12px; min-height: 0; }
.fgp h4 { margin: 0 0 6px; font-size: 12px; color: var(--ui-muted, #9aa0a6); font-weight: 600; }
.fgp-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.fgp-seg { display: inline-flex; border: 1px solid var(--ui-line, rgba(255,255,255,.12)); border-radius: 7px; overflow: hidden; }
.fgp-seg button { background: none; border: 0; color: var(--ui-muted, #9aa0a6); padding: 4px 8px; font-size: 11.5px; cursor: pointer; }
.fgp-seg button.on { background: var(--ui-accent, #e8eaec); color: #111; }
.fgp-btn { background: rgba(255,255,255,0.06); border: 1px solid var(--ui-line, rgba(255,255,255,.12)); color: inherit; border-radius: 6px; padding: 3px 8px; font-size: 11.5px; cursor: pointer; }
.fgp-btn:hover { background: rgba(255,255,255,0.12); }
.fgp-btn.on { border-color: rgba(255,176,32,.6); color: #ffd479; }
.fgp-sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.fgp-sum div { display: flex; flex-direction: column; padding: 6px 8px; border: 1px solid var(--ui-line, rgba(255,255,255,.12)); border-radius: 7px; background: rgba(255,255,255,0.02); }
.fgp-sum b { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.fgp-sum span { font-size: 10.5px; color: var(--ui-muted, #9aa0a6); }
.fgp-scroll { overflow: auto; min-height: 0; }
.fgp table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.fgp th { font-size: 10px; font-weight: 600; color: var(--ui-muted, #9aa0a6); text-align: right; padding: 3px 4px; border-bottom: 1px solid var(--ui-line, rgba(255,255,255,.12)); white-space: nowrap; position: sticky; top: 0; background: rgba(22,25,29,0.98); }
.fgp th:first-child, .fgp td:first-child { text-align: left; }
.fgp td { padding: 4px 4px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right; white-space: nowrap; }
.fgp tr.zr { cursor: pointer; }
.fgp tr.zr:hover td { background: rgba(255,255,255,0.04); }
.fgp tr.zr.sel td { background: rgba(255,255,255,0.08); }
.fgp .zname { display: flex; flex-direction: column; white-space: normal; min-width: 130px; }
.fgp .zname small { color: var(--ui-muted, #9aa0a6); font-size: 10.5px; }
.fgp .cv { display: inline-flex; flex-direction: column; align-items: flex-end; line-height: 1.15; }
.fgp .cv small { font-size: 9.5px; color: var(--ui-muted, #9aa0a6); }
.fgp .pass { color: #7ee2a2; }
.fgp .fail { color: #ff8a80; }
.fgp .na { color: var(--ui-muted, #9aa0a6); }
.fgp .cnt { color: var(--ui-muted, #9aa0a6); font-size: 11px; letter-spacing: .02em; }
.fgp .st { font-size: 10.5px; padding: 1px 6px; border-radius: 99px; border: 1px solid var(--ui-line, rgba(255,255,255,.12)); }
.fgp .st.ok { color: #b8f0c8; }
.fgp .st.warn { color: #ffd479; border-color: rgba(255,212,121,.45); }
.fgp .st.bad { color: #ff8a80; border-color: rgba(255,138,128,.5); background: rgba(255,80,60,.08); }
.fgp .dets td { padding: 3px 4px; }
.fgp .why { color: var(--ui-muted, #9aa0a6); line-height: 1.45; font-size: 11.5px; }
.fgp .why p { margin: 0 0 6px; }
.fgp .why b { color: var(--ui-fg, #e8eaec); font-weight: 600; }
.fgp-legend { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; gap: 10px; align-items: center; padding: 6px 10px; border-radius: 9px; background: rgba(16,19,23,0.88); border: 1px solid rgba(255,255,255,0.12); color: #e8eaec; font-size: 11.5px; z-index: 5; }
.fgp-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
`

function Cell({ v, t }: { v: number; t: number }) {
  if (!t) return <span className="cv na">{pc(v)}<small>n/a</small></span>
  return (
    <span className={`cv ${v + 1e-9 >= t ? 'pass' : 'fail'}`} title={`${pc(v)} % of the zone vs target ${pc(t)} %`}>
      {pc(v)}
      <small>/{pc(t)}</small>
    </span>
  )
}

function statusOf(z: ZoneStatus | undefined): { text: string; cls: string } {
  if (!z) return { text: 'normal', cls: 'ok' }
  if (z.fire === 'confirmed') return { text: 'FIRE confirmed', cls: 'bad' }
  if (z.gas === 'confirmed') return { text: 'GAS confirmed', cls: 'bad' }
  if (z.smoke === 'confirmed') return { text: 'smoke confirmed', cls: 'bad' }
  if (z.fire === 'single') return { text: 'flame 1oo', cls: 'warn' }
  if (z.gas === 'high') return { text: 'gas high 1oo', cls: 'warn' }
  if (z.smoke === 'single') return { text: 'smoke 1oo', cls: 'warn' }
  if (z.gas === 'low') return { text: 'gas low', cls: 'warn' }
  return { text: z.deluge ? 'deluge on' : 'normal', cls: z.deluge ? 'warn' : 'ok' }
}

function flyToZone(z: FireZone) {
  const { centre, size } = zoneCentre(z)
  const S = Math.min(70, Math.max(14, Math.max(...size)))
  const y = z.y0 + DECK_WORLD_Y
  const st = useStore.getState()
  // the weather deck covers the production and cellar decks: hide it only for Alpha zones under it
  st.setLayer('ceiling', !(z.y0 < 9.45 && z.platform === 'Alpha' && z.kind !== 'bridge'))
  if (z.y0 < 0) {
    // cellar deck: look in from outside the jacket at cellar height
    const side = centre[2] < 0 ? -1 : 1
    const edge = side < 0 ? Math.min(...z.rects.map((r) => r.z0)) : Math.max(...z.rects.map((r) => r.z1))
    st.requestFlyTo([centre[0], y + 4.5, edge + side * 14], [centre[0], y + 1.5, centre[2]])
  } else {
    st.requestFlyTo([centre[0] + 0.15 * S, y + 0.95 * S, centre[2] + 0.75 * S], [centre[0], y + 1, centre[2]])
  }
  if (st.layers.fgCoverage) useFgView.getState().setLevel(z.y0 as -8 | 0 | 10 | 18)
}

function fmtReading(d: Detector, v: number | undefined, state: string | undefined) {
  if (state === 'fault') return 'fault'
  if (v === undefined) return '-'
  if (d.type === 'GD') return `${v.toFixed(0)} %LEL`
  if (d.type === 'OGD') return `${v.toFixed(2)} LEL·m`
  return v >= 1 ? (d.type === 'MAC' ? 'operated' : 'ALARM') : 'clear'
}

function DetectorList({ zone }: { zone: FireZone }) {
  const plant = usePlant()
  const states = useDetectorStates()
  const inhibits = useInhibits()
  const select = useStore((s) => s.select)
  const list = useMemo(() => detectors(plant).filter((d) => d.zone === zone.id).sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || a.tag.localeCompare(b.tag)), [plant, zone])
  const canInhibit = !!useSim((s) => typeof (s as { inhibit?: unknown }).inhibit === 'function')
  if (!list.length) return <div className="muted small">No detectors in this zone.</div>
  return (
    <table className="dets">
      <thead>
        <tr>
          <th>Tag</th>
          <th>Type</th>
          <th>Reading</th>
          <th>State</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {list.map((d) => {
          const s = states[d.tag]
          const inh = !!inhibits[d.tag]
          const st = inh ? 'inhibited' : (s?.state ?? 'normal')
          const cls = st === 'high' ? 'bad' : st === 'low' || st === 'inhibited' || st === 'fault' ? 'warn' : 'ok'
          return (
            <tr key={d.tag}>
              <td>
                <button className="link mono" onClick={() => select({ tag: d.tag, kind: 'instrument' })} title="Select (shows its coverage)">
                  {d.rxTag ? `${d.tag}/R` : d.tag}
                </button>
              </td>
              <td className="muted">{TYPE_LABEL[d.type]}</td>
              <td className="mono">{fmtReading(d, s?.value, s?.state)}</td>
              <td>
                <span className={`st ${cls}`}>{st}</span>
              </td>
              <td>
                {d.type !== 'MAC' && (
                  <button className={`fgp-btn ${inh ? 'on' : ''}`} disabled={!canInhibit} onClick={() => setInhibit(d.tag, !inh)} title={inh ? 'Remove the override' : 'Inhibit (override): excluded from voting and coverage'}>
                    {inh ? 'Inhibited' : 'Inhibit'}
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** flame / gas and deck-level toggles shared with the heatmap */
function ViewToggles() {
  const mode = useFgView((s) => s.mode)
  const setMode = useFgView((s) => s.setMode)
  const level = useFgView((s) => s.level)
  const setLevel = useFgView((s) => s.setLevel)
  const layerOn = useStore((s) => s.layers.fgCoverage)
  const setLayer = useStore((s) => s.setLayer)
  return (
    <div className="fgp-bar">
      <span className="fgp-seg">
        <button className={mode === 'flame' ? 'on' : ''} onClick={() => setMode('flame')}>Flame</button>
        <button className={mode === 'gas' ? 'on' : ''} onClick={() => setMode('gas')}>Gas</button>
      </span>
      <span className="fgp-seg">
        {FG_LEVELS.map((l) => (
          <button key={String(l.id)} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>{l.label}</button>
        ))}
      </span>
      <button className={`fgp-btn ${layerOn ? 'on' : ''}`} onClick={() => setLayer('fgCoverage', !layerOn)}>{layerOn ? 'Heatmap on' : 'Show heatmap'}</button>
    </div>
  )
}

export function FgPanel() {
  const plant = usePlant()
  const exKey = useExcludedKey()
  const wKey = useSim(windKeyOf)
  const status = useZoneStatus()
  const [sel, setSel] = useState<string | null>(null)
  const [showHow, setShowHow] = useState(false)
  const zones = useMemo(() => fireZones(plant), [plant])
  const area = useMemo(() => zones.filter((z) => z.kind !== 'module'), [zones])
  const modules = useMemo(() => zones.filter((z) => z.kind === 'module'), [zones])
  const counts = useMemo(() => {
    const m = new Map<string, Record<DetectorType, number>>()
    for (const d of detectors(plant)) {
      if (!d.zone) continue
      const r = m.get(d.zone) ?? { FD: 0, GD: 0, OGD: 0, HD: 0, SD: 0, MAC: 0 }
      r[d.type]++
      m.set(d.zone, r)
    }
    return m
  }, [plant])
  const cov = useMemo(() => {
    const ex = keySet(exKey)
    const [from, speed] = wKey.split('|').map(Number)
    const out = new Map<string, ZoneCoverage>()
    for (const z of area) out.set(z.id, coverage(plant, z.id, ex, { from, speed }))
    return out
  }, [plant, area, exKey, wKey])

  const graded = area.filter((z) => z.targets.flame1 || z.targets.gas1)
  const meets = (z: FireZone) => {
    const c = cov.get(z.id)!
    const t = z.targets
    return c.flame1 + 1e-9 >= t.flame1 && c.flame2 + 1e-9 >= t.flame2 && c.gas1 + 1e-9 >= t.gas1 && c.gas2 + 1e-9 >= t.gas2
  }
  const passing = graded.filter(meets).length
  const inAlarm = zones.filter((z) => statusOf(status[z.id]).cls !== 'ok').length
  const outOfService = exKey ? exKey.split('|').length : 0
  const [wf, ws] = wKey.split('|')
  const selZone = zones.find((z) => z.id === sel) ?? null

  const pick = (z: FireZone) => {
    setSel(z.id === sel ? null : z.id)
    flyToZone(z)
  }
  const cnt = (id: string) => counts.get(id) ?? { FD: 0, GD: 0, OGD: 0, HD: 0, SD: 0, MAC: 0 }

  return (
    <div className="fgp">
      <style>{CSS}</style>
      <ViewToggles />
      <div className="fgp-sum">
        <div>
          <b>{passing}/{graded.length}</b>
          <span>graded zones meet all targets</span>
        </div>
        <div>
          <b className={inAlarm ? 'fail' : ''}>{inAlarm}</b>
          <span>zones in alarm</span>
        </div>
        <div>
          <b className={outOfService ? 'fail' : ''}>{outOfService}</b>
          <span>detectors inhibited / faulted</span>
        </div>
        <div>
          <b>{ws} m/s</b>
          <span>wind from {wf}° (gas coverage)</span>
        </div>
      </div>

      <div className="fgp-scroll">
        <table>
          <thead>
            <tr>
              <th>Zone</th>
              <th title="Flame: share of the zone seen by at least 1 detector">Flame ≥1</th>
              <th title="Flame: seen by at least 2 detectors (2ooN confirmed)">≥2</th>
              <th title="Gas: share of reference releases that reach high alarm at ≥1 detector">Gas ≥1</th>
              <th title="Gas: at ≥2 detectors (2ooN confirmed)">≥2</th>
              <th title="FD · GD · OGD · HD · SD · MAC">FD GD OGD HD SD MAC</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {area.map((z) => {
              const c = cov.get(z.id)!
              const n = cnt(z.id)
              const st = statusOf(status[z.id])
              return (
                <tr key={z.id} className={`zr ${sel === z.id ? 'sel' : ''}`} onClick={() => pick(z)} title={z.note}>
                  <td>
                    <span className="zname">
                      <span>{z.name}</span>
                      <small>{z.id} · {KIND_LABEL[z.kind]} · {c.cells} m²</small>
                    </span>
                  </td>
                  <td><Cell v={c.flame1} t={z.targets.flame1} /></td>
                  <td><Cell v={c.flame2} t={z.targets.flame2} /></td>
                  <td><Cell v={c.gas1} t={z.targets.gas1} /></td>
                  <td><Cell v={c.gas2} t={z.targets.gas2} /></td>
                  <td className="cnt mono">{TYPES.map((t) => n[t]).join(' · ')}</td>
                  <td><span className={`st ${st.cls}`}>{st.text}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h4>Enclosed modules (smoke / heat inside)</h4>
        <table>
          <tbody>
            {modules.map((z) => {
              const n = cnt(z.id)
              const st = statusOf(status[z.id])
              return (
                <tr key={z.id} className={`zr ${sel === z.id ? 'sel' : ''}`} onClick={() => pick(z)}>
                  <td>{z.name}</td>
                  <td className="cnt">{n.SD} SD · {n.HD} HD</td>
                  <td className={n.SD + n.HD >= 2 ? 'pass' : 'fail'} title="2ooN confirmation needs at least two detectors in the room">{n.SD + n.HD >= 2 ? '2oo possible' : 'no 2oo'}</td>
                  <td><span className={`st ${st.cls}`}>{st.text}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selZone && (
        <div>
          <h4>
            {selZone.name}: detectors
          </h4>
          {selZone.note && <div className="muted small" style={{ marginBottom: 6 }}>{selZone.note}</div>}
          <DetectorList zone={selZone} />
        </div>
      )}

      <div className="why">
        <h4>
          <button className="link" onClick={() => setShowHow(!showHow)}>How coverage is computed {showHow ? '▾' : '▸'}</button>
        </h4>
        {showHow && (
          <>
            <p>
              Each fire zone is divided into {CELL} m squares at {MONITOR_HEIGHT} m above the deck, which is about where a leak or a pool
              fire would be. Squares inside equipment or buildings are left out. The method follows the ISA TR84.00.07 F&G mapping
              guidance.
            </p>
            <p>
              <b>Flame (geographic coverage).</b> A {REF_FIRE_MW} MW reference fire is placed on the deck in every square. A flame detector sees it if
              it is inside the detector's 90° cone of vision, within {FD_RANGE} m (a smaller fire has to be closer), and on the same deck
              with no vessel, skid or building in the way.
            </p>
            <p>
              <b>Gas (scenario coverage).</b> A {REF_RELEASE_KGS} kg/s gas leak is placed in every square. The cloud spreads to about 5–7 m
              radius, heavy gas stays low, and the current wind pushes it downwind and thins it. A point detector counts if the leak would
              take it to {GAS_HIGH} % LEL. An open-path beam counts if the gas along the beam adds up to {OGD_HIGH} LEL·m.
            </p>
            <p>
              <b>≥1 / ≥2.</b> ≥1 is the share of the zone where at least one detector would alarm. ≥2 is where two would, which is what
              the cause & effect needs to confirm a fire or gas (2ooN voting) and start the executive actions: ESD, blowdown and deluge.
              Only the zone's own detectors count. Inhibited and faulted detectors drop out straight away, so you can see what an
              override costs. Green means the target is met; red means it is not.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

/** floating legend + flame / gas toggle for the heatmap layer (mount over the viewport) */
export function FgMappingLegend() {
  const on = useStore((s) => s.layers.fgCoverage)
  const mode = useFgView((s) => s.mode)
  const setMode = useFgView((s) => s.setMode)
  const level = useFgView((s) => s.level)
  const setLevel = useFgView((s) => s.setLevel)
  if (!on) return null
  return (
    <div className="fgp-legend">
      <style>{CSS}</style>
      <span className="fgp-seg">
        <button className={mode === 'flame' ? 'on' : ''} onClick={() => setMode('flame')}>Flame</button>
        <button className={mode === 'gas' ? 'on' : ''} onClick={() => setMode('gas')}>Gas</button>
      </span>
      <span className="fgp-seg" title="Which deck's zones to draw">
        {FG_LEVELS.map((l) => (
          <button key={String(l.id)} className={level === l.id ? 'on' : ''} onClick={() => setLevel(l.id)}>
            {l.label}
          </button>
        ))}
      </span>
      <span><i style={{ background: '#e03131' }} />0 detectors</span>
      <span><i style={{ background: '#ffb020' }} />1</span>
      <span><i style={{ background: '#2ecc71' }} />≥2 (2ooN)</span>
    </div>
  )
}
