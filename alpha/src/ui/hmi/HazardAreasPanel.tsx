/**
 * Hazardous areas (plan 14) on the CCTV & PPE page: the zone / PPE matrix, who is in which zone now and
 * what they are missing, the violation log (tracked by worn tag; camera-confirmed when a CCTV detection
 * saw it) with Show in 3D / camera call-up, and the instructor's drill buttons.
 *
 * Drills (deterministic, at 1×): "Remove hard hat from …", "Send … into Zone 1 without a gas monitor",
 * "Send … into Zone 0". The worker walks to a standing point inside the zone (safety/hazardAreas.ts
 * zoneTargets) that a camera sees (cctv.ts camerasSeeing); that camera goes on the main monitor, the tracker
 * flags the violation at once, the hazardous-area alert is raised and the people risk goes up.
 */
import { useEffect, useMemo, useState } from 'react'
import { Box, Kpi, Msg } from './common'
import { EMPTY_ARR, EMPTY_OBJ, useS } from './simApi'
import { showIn3D } from './nav'
import { DECK_WORLD_Y, useStore } from '../../state/store'
import { usePlantStore } from '../../state/plantStore'
import { fmtClock } from '../../sim/types'
import { walkLevels } from '../../scene/Walk'
import { planPath } from '../../scene/walkPath'
import type { Vec3 } from '../../model/types'
import type { HazardViolation, WorkerInfo } from '../../safety/types'
import { CLASSIFICATION, CLASSIFICATION_BASIS, HAZ_COLOR, PPE_LABEL, ZONE_RULES, zoneTargets, type HazZone, type PpeItem, type ZoneTarget } from '../../safety/hazardAreas'
import { clearPpeOverrides, markDrill, sendWorker, setPpeOverride, setWorkerTask, useHazardTrack, useWorkers, workerLevelIndex, workerPose, type HazPresence } from '../../safety/workers'
import { camerasSeeing, useCctv, type CctvCameraEx } from '../../safety/cctv'
import { useAlerts } from '../../safety/alerts'

const EMPTY_V: HazardViolation[] = EMPTY_ARR
const EMPTY_P: Record<string, HazPresence> = EMPTY_OBJ
const EMPTY_ROSTER: WorkerInfo[] = EMPTY_ARR
const SHORT: Record<PpeItem, string> = { hardHat: 'hard hat', vest: 'hi-vis', gasMonitor: 'gas monitor' }

const ZoneChip = ({ z }: { z: HazZone }) => (
  <span className="hz-chip" style={{ ['--c' as string]: HAZ_COLOR[z] }}>
    Z{z}
  </span>
)

// ---------------------------------------------------------------- drills (instructor)

interface Plan {
  w: WorkerInfo
  target: ZoneTarget
  cam: CctvCameraEx
  /** straight-line metres to the approach point */
  dist: number
}

const nameOf = (id: string) => useWorkers.getState().roster.find((w) => w.id === id)?.name ?? id

/** walking distance along the planned route (A*, ~6 ms) */
function pathLen(li: number, from: [number, number], to: [number, number]): number {
  const path = planPath(usePlantStore.getState().plant, li, from, to)
  if (!path) return Infinity
  let L = 0
  let [x, z] = from
  for (const q of path) {
    L += Math.hypot(q.x - x, q.z - z)
    x = q.x
    z = q.z
  }
  return L
}

/**
 * Pick worker + standing point + camera for a Zone 0 / Zone 1 drill ('auto' = the nearest suitable worker).
 * Screened by straight-line distance, then the best three re-ranked by the real walking route (A*), so the
 * box and the alert come within seconds at 1×.
 */
function planSend(zone: 0 | 1, pick: string): Plan | null {
  const plant = usePlantStore.getState().plant
  const levels = walkLevels(plant)
  const roster = useWorkers.getState().roster
  const cands = pick === 'auto' ? roster : roster.filter((w) => w.id === pick)
  const all: (Plan & { li: number; extra: number; score: number })[] = []
  for (const w of cands) {
    const li = workerLevelIndex(w, plant)
    const y = (levels[li]?.y ?? 0) + DECK_WORLD_Y
    const p = workerPose[w.id]
    for (const t of zoneTargets(zone, li, plant)) {
      if (t.volume.platform !== w.platform) continue
      const cam = camerasSeeing([t.to[0], y, t.to[1]], t.face)[0]
      if (!cam) continue
      const dist = p ? Math.hypot(p.x - t.via[0], p.z - t.via[1]) : 40
      // prefer: visible on camera, short walk, not a pump seal (its machinery exclusion zone adds a second box), not hidden in a shell
      const extra = (t.volume.source === 'pumpSeal' ? 8 : 0) + (t.hidden ? 60 : 0) + (cam.watches.includes(t.face) ? 0 : 4)
      all.push({ w, target: t, cam, dist, li, extra, score: dist + extra })
    }
  }
  all.sort((a, b) => a.score - b.score)
  let best: (typeof all)[number] | null = null
  for (const c of all.slice(0, 3)) {
    const p = workerPose[c.w.id]
    if (p) {
      c.dist = pathLen(c.li, [p.x, p.z], c.target.via)
      c.score = c.dist + c.extra
    }
    if (c.score < Infinity && (!best || c.score < best.score)) best = c
  }
  return best
}

/** run once the figures are on deck (turns Workers on first and waits for them) */
function withWorkers(run: () => string, done: (msg: string) => void, tries = 8) {
  const st = useStore.getState()
  if (!st.workers) st.setWorkers(true)
  if (!Object.keys(workerPose).length) {
    if (tries <= 0) return done('Field workers did not come on deck: try again')
    setTimeout(() => withWorkers(run, done, tries - 1), 400)
    return
  }
  done(run())
}

function sendInto(zone: 0 | 1, pick: string, planned?: Plan | null): string {
  const plan = planned ?? planSend(zone, pick)
  if (!plan) return pick === 'auto' ? `No worker can reach a camera-covered Zone ${zone} spot` : `${nameOf(pick)} has no camera-covered Zone ${zone} spot on their deck`
  const { w, target, cam, dist } = plan
  markDrill(w.id, zone === 0 ? 'zone0Entry' : 'zonePpe', zone)
  if (zone === 1) setPpeOverride(w.id, { gasMonitor: false })
  const r = sendWorker(w.id, target.to, target.face, 45, target.via)
  if (r === false) return 'The field workers are not on deck yet'
  setWorkerTask(w.id, zone === 1 ? `Drill: Zone 1 at ${target.face}, no gas monitor` : `Drill: entering ${target.face} (Zone 0), no permit`)
  useCctv.getState().setSelected(cam.id)
  return `✓ ${w.name} walking to ${target.face}: ${target.volume.reason} (Zone ${zone}), ~${Math.max(3, Math.round(dist / 1.3))} s. ${cam.id} is on the main monitor.`
}

function removeHardHat(pick: string): string {
  const roster = useWorkers.getState().roster
  // auto: someone with a hard hat on, in a classified area and on camera
  const present = useHazardTrack.getState().present
  const seen = (w: WorkerInfo) => {
    const p = workerPose[w.id]
    return p ? camerasSeeing([p.x, p.footY, p.z])[0] : undefined
  }
  const w = pick === 'auto' ? (roster.find((x) => x.hardHat && present[x.id] && seen(x)) ?? roster.find((x) => x.hardHat && seen(x)) ?? roster.find((x) => x.hardHat)) : roster.find((x) => x.id === pick)
  if (!w) return 'Everybody is already without a hard hat'
  markDrill(w.id, 'zonePpe', present[w.id]?.zone ?? 2)
  setPpeOverride(w.id, { hardHat: false })
  const cam = seen(w)
  if (cam) useCctv.getState().setSelected(cam.id)
  return `✓ ${w.name} took the hard hat off${cam ? `: ${cam.id} is on the main monitor` : ' (not on a camera right now)'}.`
}

function restoreAll(): string {
  clearPpeOverrides()
  return '✓ Instructor overrides cleared (the PPE rotation and the shift defaults apply again).'
}

if (import.meta.env.DEV && typeof window !== 'undefined') Object.assign(window as unknown as Record<string, unknown>, { __hazard: { planSend, sendInto, removeHardHat, restoreAll, useHazardTrack }, __alerts: useAlerts })

// ---------------------------------------------------------------- panel

export function HazardAreasPanel() {
  const layer = useStore((s) => s.layers.hazAreas)
  const setLayer = useStore((s) => s.setLayer)
  return (
    <Box
      className="hz-panel"
      title="Hazardous areas: Zone 0 / 1 / 2 (IEC 60079-10-1, gas)"
      right={
        <button className={layer ? 'on' : ''} onClick={() => setLayer('hazAreas', !layer)} title="Layers → Hazardous areas (Zone 0/1/2)" data-hz-layer>
          {layer ? 'Zones shown in 3D' : 'Show zones in 3D'}
        </button>
      }
    >
      <div className="hz-grid" data-hz-panel>
        <Matrix />
        <People />
        <Violations />
      </div>
    </Box>
  )
}

function Matrix() {
  const [open, setOpen] = useState(false)
  return (
    <div className="hz-col">
      <table className="h-tbl hz-matrix">
        <thead>
          <tr>
            <th>Zone</th>
            <th>Entry</th>
            <th>PPE / gear (tracked)</th>
          </tr>
        </thead>
        <tbody>
          {ZONE_RULES.map((r) => (
            <tr key={String(r.zone)} title={`${r.where}. ${r.also.join('. ')}`}>
              <td>{r.zone === 'safe' ? <span className="hz-chip safe">Safe</span> : <ZoneChip z={r.zone} />}</td>
              <td>
                <div>{r.entry}</div>
                <div className="dim small">{r.where}</div>
              </td>
              <td>
                {r.ppe.length ? r.ppe.map((k) => PPE_LABEL[k]).join(' · ') : 'Site minimum'}
                {r.also.length > 0 && <div className="dim small">{r.also.join(' · ')}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="h-note hz-fine">
        Gas zones only: there is no Zone 3, and dust zones 20 / 21 / 22 don't apply offshore.{' '}
        <button className="link" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Classification table'}
        </button>
      </p>
      {open && (
        <>
          <table className="h-tbl hz-class">
            <thead>
              <tr>
                <th>Release source</th>
                <th>Z0</th>
                <th>Z1</th>
                <th>Z2</th>
              </tr>
            </thead>
            <tbody>
              {CLASSIFICATION.map((c) => (
                <tr key={c.source}>
                  <td>{c.what}</td>
                  <td className="dim">{c.z0 ?? '-'}</td>
                  <td className="dim">{c.z1 ?? '-'}</td>
                  <td className="dim">{c.z2 ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="h-note hz-fine">{CLASSIFICATION_BASIS}</p>
        </>
      )}
    </div>
  )
}

function flyToWorker(id: string) {
  const p = workerPose[id]
  const st = useStore.getState()
  if (!p) return
  st.setLayer('hazAreas', true)
  // stay under the Alpha weather deck: a low, close view
  st.requestFlyTo([p.x + 7, p.footY + 4.5, p.z + 8], [p.x, p.footY + 1, p.z])
  st.setHmi(null)
}
function cameraOn(id: string, zone0 = false) {
  const p = workerPose[id]
  if (!p) return false
  const cam = camerasSeeing([p.x, p.footY, p.z])[0]
  if (!cam) return false
  if (zone0) useCctv.setState({ callUp: cam.id, callUpReason: `Zone 0 entry: ${nameOf(id)}`, callUpAt: useS.getState().t })
  else useCctv.getState().setSelected(cam.id)
  return true
}

function People() {
  const present = useHazardTrack((s) => s.present) ?? EMPTY_P
  const active = useHazardTrack((s) => s.active) ?? EMPTY_V
  const roster = useWorkers((s) => s.roster) ?? EMPTY_ROSTER
  const workersOn = useStore((s) => s.workers)
  const rows = useMemo(
    () =>
      Object.entries(present)
        .map(([id, p]) => ({ id, p, w: roster.find((x) => x.id === id) }))
        .sort((a, b) => a.p.zone - b.p.zone || b.p.missing.length - a.p.missing.length),
    [present, roster],
  )
  const n = (z: HazZone) => rows.filter((r) => r.p.zone === z).length
  const confirmed = active.filter((v) => v.camera).length
  return (
    <div className="hz-col">
      <div className="h-kpis hz-kpis">
        <Kpi label="In Z0" value={String(n(0))} bad={active.some((v) => v.kind === 'zone0Entry')} title="People in Zone 0 now" />
        <Kpi label="In Z1" value={String(n(1))} title="People in Zone 1 now" />
        <Kpi label="In Z2" value={String(n(2))} title="People in Zone 2 now" />
        <Kpi label="Violations" value={String(active.length)} abn={active.length > 0} title="Violations now: tracked by worn tag (RTLS), camera-independent" />
        <Kpi label="On camera" value={`${confirmed}/${active.length}`} title="Violations a CCTV detection has confirmed" />
      </div>
      {!workersOn ? (
        <p className="h-note">No personnel tracked. The drills below turn field workers on.</p>
      ) : rows.length === 0 ? (
        <p className="h-note">Nobody in a classified area right now.</p>
      ) : (
        <div className="scroll hz-people">
          <table className="h-tbl">
            <thead>
              <tr>
                <th>Who</th>
                <th>Zone</th>
                <th>Area</th>
                <th>Missing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ id, p, w }) => (
                <tr key={id} className={p.missing.length || (p.zone === 0 && !p.permit) ? 'bad' : ''}>
                  <td title={w?.role}>{w?.name ?? id}</td>
                  <td>
                    <ZoneChip z={p.zone} />
                  </td>
                  <td className="mono" title={p.reason}>
                    {p.tag}
                  </td>
                  <td>{p.zone === 0 && !p.permit ? <b className="hz-bad">No entry: no permit</b> : p.missing.length ? <span className="hz-bad">{p.missing.map((k) => SHORT[k]).join(', ')}</span> : <span className="dim">compliant</span>}</td>
                  <td className="act">
                    <button onClick={() => flyToWorker(id)} title="Show the person in 3D (zones on)">
                      3D
                    </button>
                    <button onClick={() => cameraOn(id, p.zone === 0)} title="Put the best camera on the main monitor">
                      Cam
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Drills />
    </div>
  )
}

function Drills() {
  const roster = useWorkers((s) => s.roster) ?? EMPTY_ROSTER
  const [pick, setPick] = useState('auto')
  const [msg, setMsg] = useState<string | null>(null)
  // refresh the picks every 3 s (who is nearest changes as they walk); a click uses the pick on its button
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 3000)
    return () => clearInterval(id)
  }, [])
  const workersOn = useStore((s) => s.workers)
  const names = useMemo(() => {
    void tick
    // with nobody on deck yet there are no positions: name the worker only once the figures are out
    const live = workersOn && Object.keys(workerPose).length > 0
    const p1 = live ? planSend(1, pick) : null
    const p0 = live ? planSend(0, pick) : null
    const hat = pick === 'auto' ? null : roster.find((w) => w.id === pick)
    return { z1: p1?.w.name, z0: p0?.w.name, hat: hat?.name, p1, p0 }
  }, [pick, roster, tick, workersOn])
  const who = (n: string | undefined) => n ?? (pick === 'auto' ? 'the nearest worker' : nameOf(pick))
  const go = (f: () => string) => withWorkers(f, setMsg)
  return (
    <div className="hz-drills">
      <div className="h-sec">
        Instructor drills <span className="grow" />
        <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Worker for the drill" data-hz-worker>
          <option value="auto">Auto (nearest on camera)</option>
          {roster.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} - {w.platform} {w.level}
            </option>
          ))}
        </select>
      </div>
      <div className="hz-btns">
        <button className="warn" onClick={() => go(() => removeHardHat(pick))} data-hz-drill="hardhat">
          Remove hard hat from {names.hat ?? (pick === 'auto' ? 'a worker on camera' : nameOf(pick))}
        </button>
        <button className="warn" onClick={() => go(() => sendInto(1, pick, names.p1))} data-hz-drill="zone1">
          Send {who(names.z1)} into Zone 1 without a gas monitor
        </button>
        <button className="danger" onClick={() => go(() => sendInto(0, pick, names.p0))} data-hz-drill="zone0">
          Send {who(names.z0)} into Zone 0
        </button>
        <button onClick={() => setMsg(restoreAll())} data-hz-drill="restore">
          Restore PPE
        </button>
      </div>
      <Msg text={msg} />
    </div>
  )
}

function Violations() {
  const log = useHazardTrack((s) => s.log) ?? EMPTY_V
  const roster = useWorkers((s) => s.roster) ?? EMPTY_ROSTER
  const names = useMemo(() => new Map(roster.map((w) => [w.id, w.name])), [roster])
  const rows = useMemo(() => log.slice(0, 40), [log])
  const counts = useMemo(() => {
    const c = { z0: 0, z1: 0, z2: 0, cam: 0 }
    for (const v of log) {
      if (v.kind === 'zone0Entry') c.z0++
      else if (v.zone === 1) c.z1++
      else c.z2++
      if (v.camera) c.cam++
    }
    return c
  }, [log])
  return (
    <div className="hz-col">
      <div className="h-sec">
        Violations <span className="grow" />
        <span className="dim mono" title="Zone 0 entries · Zone 1 PPE · Zone 2 PPE · camera-confirmed">
          Z0 {counts.z0} · Z1 {counts.z1} · Z2 {counts.z2} · cam {counts.cam}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="h-note">No hazardous-area violations.</p>
      ) : (
        <div className="scroll hz-log">
          <table className="h-tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Who</th>
                <th>What</th>
                <th title="tag = worn personnel tag (RTLS, camera-independent); + camera that confirmed it">Seen by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className={`${v.kind === 'zone0Entry' ? 'z0' : ''} ${v.t1 === undefined ? 'open' : 'ended'}`} data-hz-violation={v.id}>
                  <td className="mono">{fmtClock(v.t0, false)}</td>
                  <td>{names.get(v.workerId) ?? v.workerId}</td>
                  <td title={v.reason}>
                    <ZoneChip z={v.zone} /> {v.kind === 'zone0Entry' ? <b className="hz-bad">Entry, no permit</b> : <>no {v.missing.map((k) => SHORT[k]).join(', ')}</>} <span className="mono dim">{v.tag}</span>
                    {v.drill && <span className="dim"> · drill</span>}
                  </td>
                  <td className="small">
                    tag{v.camera ? <b> + {v.camera.replace('CCTV-', '')}</b> : ''}
                    {v.t1 === undefined ? <span className="hz-live"> live</span> : ''}
                  </td>
                  <td className="act">
                    <button onClick={() => (v.t1 === undefined && workerPose[v.workerId] ? flyToWorker(v.workerId) : (useStore.getState().setLayer('hazAreas', true), showIn3D(v.tag)))} title="Show in 3D (zones on)">
                      3D
                    </button>
                    <button
                      onClick={() => {
                        if (v.t1 === undefined && cameraOn(v.workerId, v.kind === 'zone0Entry')) return
                        const cam = camerasSeeing(v.pos as Vec3, v.tag)[0]
                        if (cam) useCctv.getState().setSelected(cam.id)
                      }}
                      title="Call the camera up on the main monitor"
                    >
                      Cam
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
