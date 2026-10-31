/**
 * CCTV & PPE: the control-room camera wall (plan 07).
 *
 *  - One big tile (the operator's camera, or the camera CALLED UP by an F&G alarm: red border + banner)
 *    and seven smaller tiles; click a tile to put it on the big monitor.
 *  - The big monitor is a 360° PTZ head: drag to pan and tilt, scroll to zoom, double-click for the installed
 *    aim, arrow keys when focused, and a 360° sweep. The pose is per camera and feeds the renderer and detector.
 *  - Every tile is a live feed rendered from inside the twin (scene/CctvRenderer.tsx paints the canvas)
 *    with a camera OSD, the warning levels of the F&G detectors in the zones the camera covers (%LEL bars,
 *    flame detector states, zone status) and the detector's boxes (people, no hard hat, no hi-vis vest,
 *    flame, gas cloud).
 *  - Right column: the call-up, the detection log (Walk to), and the detector-model card. Detections are
 *    simulated from the twin's ground truth until the operator turns on real SAM 3.1: on the site's Modal GPU, or on
 *    their own Meta key (safety/samClient.ts, safety/metaSam.ts). Neither survives a reload.
 *  - Below the wall: Hazardous areas (plan 14, HazardAreasPanel.tsx) — zone / PPE matrix, people per zone,
 *    violations, instructor drills; zone boxes (Zone 0 entry red, Zone 1 orange, Zone 2 yellow) on the feeds.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Kpi } from './common'
import { EMPTY_ARR, EMPTY_OBJ, useS } from './simApi'
import { CAMERAS, FEED_H, FEED_INTERVAL_MS, FEED_W, PTZ_HOME, SEG_BY_ID, SEG_CLASSES, aimOf, cameraById, detLabel, feedCanvases, feedStats, registerFeed, segFrames, unregisterFeed, useCctv, type CctvCameraEx, type SegInstance } from '../../safety/cctv'
import { CAP_IMAGES, EVERY_S, IMAGE_USD, startMetaSam, testKey, useMeta, worstScan } from '../../safety/metaSam'
import { cleanKey } from '../../safety/metaKey'
import { canRecord, CLIP_FRAMES, CLIP_IMAGES, CLIP_S, CLIP_USD, closeReview, frameAt, reviewLastSeconds, startReview, useReview, type ReviewClip } from '../../safety/metaReview'
import { samCamera, samLive, startSam, useSam } from '../../safety/samClient'
import { useWorkers } from '../../safety/workers'
import { DETECTION_LABEL, type Detection, type DetectionKind, type WorkerInfo } from '../../safety/types'
import { fmtClock, type DetectorSim, type ZoneStatus } from '../../sim/types'
import { usePlant } from '../../state/plantStore'
import { useStore } from '../../state/store'
import { zoneById, zoneDetectors, GAS_HIGH, GAS_LOW, OGD_HIGH, OGD_LOW, OGD_MAX, type Detector } from '../../sim/fg'
import { walkToTag } from '../walkTo'
import { HazardAreasPanel } from './HazardAreasPanel'
import './cctv.css'

const GROUPS: [string, string][] = [
  ['all', 'All cameras'],
  ['Alpha', 'Alpha'],
  ['WHP-N', 'WHP-N'],
  ['RP', 'RP'],
  ['WI', 'WI'],
  ['LQ', 'LQ'],
  ['thermal', 'Thermal / flame'],
]
const BIG_W = 960
const BIG_H = 540
const KIND_CLASS: Record<DetectionKind, string> = { person: 'person', noHardHat: 'ppe', noVest: 'ppe', restrictedZone: 'ppe', fire: 'fire', gasCloud: 'gas', zone0Entry: 'hz0', zonePpe: 'hz' }
const EMPTY_DET: Detection[] = EMPTY_ARR
const EMPTY_ROSTER: WorkerInfo[] = EMPTY_ARR

export function CctvPage() {
  useEffect(() => {
    const stopModal = startSam()
    const stopMeta = startMetaSam()
    const stopReview = startReview()
    return () => {
      stopModal()
      stopMeta()
      stopReview()
    }
  }, [])
  const selected = useCctv((s) => s.selected)
  const callUp = useCctv((s) => s.callUp)
  const setFeedsVisible = useCctv((s) => s.setFeedsVisible)
  useEffect(() => {
    setFeedsVisible(true)
    return () => setFeedsVisible(false)
  }, [setFeedsVisible])

  const bigId = callUp ?? selected
  const big = cameraById(bigId) ?? CAMERAS[0]
  const [group, setGroup] = useState<string>('all')
  const small = CAMERAS.filter((c) => c.id !== big.id && (group === 'all' || (group === 'thermal' ? c.type === 'thermal' : c.platform === group)))
  const clip = useReview((s) => s.clip)

  return (
    <div className={`cctv ${clip ? 'reviewing' : ''}`}>
      <div className="cctv-main">
      <div className="cctv-groups" role="group" aria-label="Camera groups">
        {GROUPS.map(([k, label]) => {
          const n = CAMERAS.filter((c) => k === 'all' || (k === 'thermal' ? c.type === 'thermal' : c.platform === k)).length
          return n ? (
            <button key={k} className={group === k ? 'on' : ''} onClick={() => setGroup(k)} data-cam-group={k}>
              {label} <span className="dim">{n}</span>
            </button>
          ) : null
        })}
        <span className="dim small">{CAMERAS.length} hazardous-area cameras · only the tiles on screen are rendered</span>
      </div>
      <div className="cctv-wall" role="region" aria-label="CCTV camera wall">
        <Tile key={`big-${big.id}`} cam={big} big calledUp={callUp === big.id} />
        {small.map((c, i) => (
          <Tile key={c.id} cam={c} slot={i} />
        ))}
      </div>
      <HazardAreasPanel />
      </div>
      <div className="cctv-side">
        {clip && <ReviewBox key={clip.url} clip={clip} />}
        <CallUpBox />
        <PromptsBox cam={big.id} />
        <LogBox />
        <ModelBox />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- a monitor tile

const Tile = memo(function Tile({ cam, big, calledUp, slot }: { cam: CctvCameraEx; big?: boolean; calledUp?: boolean; slot?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const setSelected = useCctv((s) => s.setSelected)
  const callUpReason = useCctv((s) => s.callUpReason)
  const ackCallUp = useCctv((s) => s.ackCallUp)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    registerFeed(cam.id, el)
    return () => unregisterFeed(cam.id, el)
  }, [cam.id])
  const w = big ? BIG_W : FEED_W
  const h = big ? BIG_H : FEED_H
  // small tiles fill the right-hand column (3) beside the big monitor, then rows of 4 below it
  const style = big ? undefined : slot! < 3 ? { gridColumn: 4, gridRow: slot! + 1 } : { gridColumn: 1 + ((slot! - 3) % 4), gridRow: 4 + Math.floor((slot! - 3) / 4) }
  const steer = usePtzSteer(cam, !!big)
  return (
    <div
      className={`cctv-tile ${big ? 'big ptz' : ''} ${calledUp ? 'callup' : ''} ${cam.type}`}
      style={style}
      onClick={big ? undefined : () => setSelected(cam.id)}
      title={big ? `${cam.id} · ${cam.model} · drag to pan and tilt, scroll to zoom, double-click to reset` : `${cam.id}: click to show on the main monitor`}
      data-cam={cam.id}
      {...steer}
    >
      <canvas ref={canvas} width={w} height={h} />
      <SegLayer cam={cam.id} big={!!big} />
      <ModelBadge cam={cam.id} />
      <Boxes cam={cam.id} big={!!big} />
      <Osd cam={cam} big={!!big} />
      <DetectorPanel cam={cam} big={!!big} />
      {big && <PtzPad cam={cam} />}
      {calledUp && (
        <div className="cctv-callup">
          <span className="blink">● CALL-UP</span> {callUpReason ?? 'F&G alarm'}
          <button
            onClick={(e) => {
              e.stopPropagation()
              ackCallUp()
            }}
          >
            Acknowledge
          </button>
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------- 360° PTZ on the main monitor

const CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const cardinal = (deg: number) => CARDINAL[Math.round(deg / 45) % 8]
const SWEEP_DEG_S = 15

/** pointer, wheel and keyboard steering for the big tile; the small tiles get no handlers */
function usePtzSteer(cam: CctvCameraEx, on: boolean) {
  const drag = useRef<{ x: number; y: number; id: number } | null>(null)
  const idle = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(idle.current), [])
  if (!on) return {}
  const st = () => useCctv.getState()
  const nudge = () => {
    // keep the main monitor on the fast render path for a moment after the last input
    st().setSteering(true)
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => !drag.current && !st().sweep && st().setSteering(false), 400)
  }
  const pose = () => st().ptz[cam.id] ?? PTZ_HOME
  const degPerPx = (el: HTMLElement) => aimOf(cam, pose()).fov / el.clientHeight
  return {
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, input, select, .cctv-ptz')) return
      drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.classList.add('grabbing')
      st().setSweep(false)
      nudge()
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const k = degPerPx(e.currentTarget)
      const p = pose()
      // grab the picture: dragging right turns the head left, dragging down tilts it up
      st().setPtz(cam.id, { pan: p.pan - (e.clientX - d.x) * k, tilt: p.tilt + (e.clientY - d.y) * k })
      d.x = e.clientX
      d.y = e.clientY
      nudge()
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (drag.current?.id !== e.pointerId) return
      drag.current = null
      e.currentTarget.classList.remove('grabbing')
      nudge()
    },
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => {
      st().setPtz(cam.id, { zoom: pose().zoom * Math.exp(-e.deltaY * 0.0015) })
      nudge()
    },
    onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button, .cctv-ptz')) return
      st().setSweep(false)
      st().resetPtz(cam.id)
      nudge()
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      const p = pose()
      const step = Math.max(1, aimOf(cam, p).fov / 8)
      const move: Record<string, Partial<typeof p>> = {
        ArrowLeft: { pan: p.pan - step },
        ArrowRight: { pan: p.pan + step },
        ArrowUp: { tilt: p.tilt + step },
        ArrowDown: { tilt: p.tilt - step },
        '+': { zoom: p.zoom * 1.25 },
        '=': { zoom: p.zoom * 1.25 },
        '-': { zoom: p.zoom / 1.25 },
      }
      const m = move[e.key]
      if (!m) return
      e.preventDefault()
      e.stopPropagation()
      st().setPtz(cam.id, m)
      nudge()
    },
  }
}

/** heading, tilt and zoom in the OSD (bottom left of the main monitor) */
function PtzReadout({ cam }: { cam: CctvCameraEx }) {
  const p = useCctv((s) => s.ptz[cam.id]) ?? PTZ_HOME
  const a = aimOf(cam, p)
  return (
    <span className="sub">
      {cam.platform.toUpperCase()} · HDG {Math.round(a.heading).toString().padStart(3, '0')}° {cardinal(a.heading)} · TILT {a.elevation >= 0 ? '+' : '−'}
      {Math.abs(Math.round(a.elevation))}° · {p.zoom.toFixed(1)}× · FOV {Math.round(a.fov)}° ·{' '}
    </span>
  )
}

/** the on-screen PTZ pad: a heading dial, nudge buttons, zoom, home and the 360° sweep */
function PtzPad({ cam }: { cam: CctvCameraEx }) {
  const p = useCctv((s) => s.ptz[cam.id]) ?? PTZ_HOME
  const sweep = useCctv((s) => s.sweep)
  const setPtz = useCctv((s) => s.setPtz)
  const setSweep = useCctv((s) => s.setSweep)
  const resetPtz = useCctv((s) => s.resetPtz)
  const setSteering = useCctv((s) => s.setSteering)
  const a = aimOf(cam, p)
  const step = Math.max(2, a.fov / 4)
  // 360° sweep: turn the head steadily; the renderer runs the main monitor on its fast path meanwhile
  useEffect(() => {
    if (!sweep) return
    setSteering(true)
    let last = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const cur = useCctv.getState().ptz[cam.id] ?? PTZ_HOME
      useCctv.getState().setPtz(cam.id, { pan: cur.pan + ((now - last) / 1000) * SWEEP_DEG_S })
      last = now
    }, 50)
    return () => {
      window.clearInterval(id)
      setSteering(false)
    }
  }, [sweep, cam.id, setSteering])
  // stop sweeping when the main monitor changes camera
  useEffect(() => () => useCctv.getState().setSweep(false), [cam.id])
  const btn = (label: string, title: string, fn: () => void, cls = '') => (
    <button className={cls} title={title} aria-label={title} onClick={(e) => (e.stopPropagation(), fn())}>
      {label}
    </button>
  )
  return (
    <div className="cctv-ptz" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="cctv-ptz-dial" title={`Heading ${Math.round(a.heading)}°`}>
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="21" />
          <path className="cone" d={coneOf(a.heading, a.fov)} />
          <text x="24" y="9.5">N</text>
        </svg>
      </div>
      <div className="cctv-ptz-grid">
        <span />
        {btn('▲', 'Tilt up', () => setPtz(cam.id, { tilt: p.tilt + step }))}
        <span />
        {btn('◀', 'Pan left', () => setPtz(cam.id, { pan: p.pan - step }))}
        {btn('⌂', 'Back to the installed aim', () => (setSweep(false), resetPtz(cam.id)), 'home')}
        {btn('▶', 'Pan right', () => setPtz(cam.id, { pan: p.pan + step }))}
        <span />
        {btn('▼', 'Tilt down', () => setPtz(cam.id, { tilt: p.tilt - step }))}
        <span />
      </div>
      <div className="cctv-ptz-col">
        {btn('+', 'Zoom in', () => setPtz(cam.id, { zoom: p.zoom * 1.5 }))}
        {btn('−', 'Zoom out', () => setPtz(cam.id, { zoom: p.zoom / 1.5 }))}
      </div>
      {btn('360°', sweep ? 'Stop the 360° sweep' : 'Sweep 360°', () => setSweep(!sweep), `sweep ${sweep ? 'on' : ''}`)}
    </div>
  )
}

/** the field of view as a wedge on the heading dial (0° = north, up) */
function coneOf(heading: number, fov: number) {
  const r = 19
  const a0 = THREE_DEG * (heading - fov / 2 - 90)
  const a1 = THREE_DEG * (heading + fov / 2 - 90)
  const large = fov > 180 ? 1 : 0
  return `M24 24 L${24 + r * Math.cos(a0)} ${24 + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${24 + r * Math.cos(a1)} ${24 + r * Math.sin(a1)} Z`
}
const THREE_DEG = Math.PI / 180

function Osd({ cam, big }: { cam: CctvCameraEx; big: boolean }) {
  const t = useS((s) => s.t) ?? 0
  return (
    <>
      <div className="cctv-osd tl">
        <div>
          <b>{cam.id}</b> {cam.name.toUpperCase()}
        </div>
        <div className="sub">
          {cam.type === 'thermal' ? 'THERMAL · FLAME DET' : 'PTZ COLOUR'} · {cam.ex.split(' · ')[0]}
        </div>
      </div>
      <div className="cctv-osd bl">
        {big && <PtzReadout cam={cam} />}
        <span className="rec">● REC</span>
      </div>
      <div className="cctv-osd br">{fmtClock(t)}</div>
      {cam.type === 'thermal' && big && (
        <div className="cctv-scale">
          <span>-10 °C</span>
          <i />
          <span>350 °C</span>
        </div>
      )}
    </>
  )
}

/** detection boxes over the picture (normalised image coords) */
function Boxes({ cam, big }: { cam: string; big: boolean }) {
  const all = useCctv((s) => s.live[cam]) ?? EMPTY_DET
  const seg = useCctv((s) => s.seg)
  // with masks on, the main monitor shows people as masks: keep only violations and hazards as boxes
  const live = useMemo(() => (big && seg ? all.filter((d) => d.kind !== 'person') : all), [all, big, seg])
  const roster = useWorkers((s) => s.roster) ?? EMPTY_ROSTER
  const names = useMemo(() => new Map(roster.map((w) => [w.id, w.name])), [roster])
  return (
    <div className="cctv-boxes">
      {live.map((d) => {
        const [x0, y0, x1, y1] = d.box
        const who = d.workerId && (big || d.kind === 'zone0Entry') ? ` · ${names.get(d.workerId) ?? d.workerId}` : ''
        const label = `${detLabel(d)}${(d.kind === 'person' && big) || d.kind === 'zone0Entry' || (d.kind === 'zonePpe' && big) ? who : ''} ${Math.round(d.confidence * 100)}%`
        return (
          <div key={d.id} className={`cctv-det ${KIND_CLASS[d.kind]} ${d.kind} ${d.zone !== undefined ? `z${d.zone}` : ''} ${y0 < 0.07 ? 'top' : ''}`} style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}>
            {(big || d.kind !== 'person') && <span>{label}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- F&G detectors the camera covers

const detCache = new WeakMap<object, Map<string, Detector[]>>()
function camDetectors(plant: object, cam: CctvCameraEx, get: () => Detector[]): Detector[] {
  let m = detCache.get(plant)
  if (!m) detCache.set(plant, (m = new Map()))
  let d = m.get(cam.id)
  if (!d) m.set(cam.id, (d = get()))
  return d
}

const sev = (d: Detector, r: DetectorSim | undefined) => {
  if (!r) return 0
  if (r.state === 'high') return 3
  if (r.state === 'low') return 2
  if (r.state === 'fault' || r.state === 'inhibited') return 1
  return d.type === 'GD' ? r.value / 100 : d.type === 'OGD' ? r.value / OGD_MAX : 0
}

function DetectorPanel({ cam, big }: { cam: CctvCameraEx; big: boolean }) {
  const plant = usePlant()
  const readings = useS((s) => s.detectors) ?? (EMPTY_OBJ as Record<string, DetectorSim>)
  const fg = useS((s) => s.fg) ?? (EMPTY_OBJ as Record<string, ZoneStatus>)
  const dets = camDetectors(plant, cam, () => cam.zones.flatMap((z) => zoneDetectors(plant, z)).filter((d) => d.type === 'GD' || d.type === 'OGD' || d.type === 'FD'))
  // big monitor: the worst 7; small tiles: only detectors off normal (worst 3), else a one-line summary
  const rows = useMemo(() => {
    const sorted = [...dets].sort((a, b) => sev(b, readings[b.tag]) - sev(a, readings[a.tag]))
    return big ? sorted.slice(0, 7) : sorted.filter((d) => sev(d, readings[d.tag]) >= 1 || (d.type !== 'FD' && (readings[d.tag]?.value ?? 0) >= GAS_LOW / 2)).slice(0, 3)
  }, [dets, readings, big])
  const gas = dets.filter((d) => d.type !== 'FD')
  const gasN = gas.length
  const fdN = dets.length - gasN
  const maxLel = gas.reduce((m, d) => (d.type === 'GD' ? Math.max(m, readings[d.tag]?.value ?? 0) : m), 0)
  const fdOn = dets.filter((d) => d.type === 'FD' && (readings[d.tag]?.state === 'high' || readings[d.tag]?.state === 'low')).length
  return (
    <div className={`cctv-fg ${big ? 'big' : ''}`}>
      <div className="zones">
        {cam.zones.map((z) => (
          <ZoneChip key={z} id={z} st={fg[z]} big={big} />
        ))}
      </div>
      {rows.map((d) => (
        <DetRow key={d.tag} d={d} r={readings[d.tag]} />
      ))}
      {big ? (
        <div className="cnt">
          {gasN} gas · {fdN} flame detectors in view zones
        </div>
      ) : (
        rows.length === 0 && (
          <div className="cnt">
            GD max {maxLel.toFixed(0)} %LEL · FD {fdN - fdOn}/{fdN} OK
          </div>
        )
      )}
    </div>
  )
}

function ZoneChip({ id, st, big }: { id: string; st: ZoneStatus | undefined; big: boolean }) {
  const plant = usePlant()
  const fire = st && st.fire !== 'normal'
  const gas = st && st.gas !== 'normal'
  const cls = fire || st?.gas === 'high' || st?.gas === 'confirmed' ? 'alarm' : gas || (st && st.smoke !== 'normal') ? 'warn' : ''
  const text = fire ? `FIRE ${st!.fire.toUpperCase()}` : gas ? `GAS ${st!.gas.toUpperCase()}` : st?.deluge ? 'DELUGE' : 'NORMAL'
  return (
    <span className={`chip ${cls}`} title={zoneById(plant, id)?.name ?? id}>
      {id}
      {(big || cls) && <b> {text}</b>}
    </span>
  )
}

function DetRow({ d, r }: { d: Detector; r: DetectorSim | undefined }) {
  const st = r?.state ?? 'normal'
  if (d.type === 'FD') {
    const on = st === 'high' || st === 'low' || (r?.value ?? 0) >= 1
    return (
      <div className={`row ${on ? 'alarm' : st === 'fault' || st === 'inhibited' ? 'warn' : ''}`}>
        <span className="tag">{d.tag}</span>
        <span className="fd">{on ? 'FLAME' : st === 'normal' ? 'OK' : st.toUpperCase()}</span>
      </div>
    )
  }
  const ogd = d.type === 'OGD'
  const v = Math.max(0, r?.value ?? 0)
  const lo = ogd ? OGD_LOW : GAS_LOW
  const hi = ogd ? OGD_HIGH : GAS_HIGH
  const max = ogd ? OGD_MAX : 100
  const cls = v >= hi || st === 'high' ? 'alarm' : v >= lo || st === 'low' ? 'warn' : st === 'fault' || st === 'inhibited' ? 'warn' : ''
  return (
    <div className={`row ${cls}`}>
      <span className="tag">{d.tag}</span>
      <span className="bar">
        <i style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
        <em style={{ left: `${(lo / max) * 100}%` }} />
        <em style={{ left: `${(hi / max) * 100}%` }} />
      </span>
      <span className="v">
        {st === 'fault' || st === 'inhibited' ? st.slice(0, 4).toUpperCase() : `${ogd ? v.toFixed(1) : v.toFixed(0)}${ogd ? ' LEL·m' : ' %LEL'}`}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- right column

function CallUpBox() {
  const callUp = useCctv((s) => s.callUp)
  const reason = useCctv((s) => s.callUpReason)
  const at = useCctv((s) => s.callUpAt)
  const ack = useCctv((s) => s.ackCallUp)
  const cam = cameraById(callUp)
  return (
    <Box title="Camera call-up" right={cam ? <button onClick={ack}>Acknowledge</button> : null} className={cam ? 'cctv-callbox on' : 'cctv-callbox'}>
      {cam ? (
        <p className="h-note">
          <b className="mono">{cam.id}</b> {cam.name} called up at {fmtClock(at ?? 0)}: <b>{reason}</b>.
        </p>
      ) : (
        <p className="h-note">No call-up. An F&G alarm (gas high / confirmed, flame) calls the camera covering its zone up to the main monitor.</p>
      )}
    </Box>
  )
}

function LogBox() {
  const log = useCctv((s) => s.log) ?? EMPTY_DET
  const roster = useWorkers((s) => s.roster) ?? EMPTY_ROSTER
  const workersOn = useStore((s) => s.workers)
  const setWorkers = useStore((s) => s.setWorkers)
  const names = useMemo(() => new Map(roster.map((w) => [w.id, w.name])), [roster])
  const rows = useMemo(() => log.slice(0, 80), [log])
  return (
    <Box title="Detection log" right={<span className="dim">{log.length}</span>} className="cctv-log">
      {!workersOn && (
        <p className="h-note">
          Field workers are off, so there is nobody on the decks to watch.{' '}
          <button className="link" onClick={() => setWorkers(true)}>
            Turn on field workers
          </button>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="h-note">No violations or hazards seen yet.</p>
      ) : (
        <div className="scroll">
          <table className="h-tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Cam</th>
                <th>Detection</th>
                <th>Who</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const cam = cameraById(d.camera)
                return (
                  <tr key={d.id} className={KIND_CLASS[d.kind]}>
                    <td className="mono">{fmtClock(d.t, false)}</td>
                    <td className="mono">{d.camera.replace('CCTV-', '')}</td>
                    <td>
                      <span className={`cctv-k ${KIND_CLASS[d.kind]}`} title={d.tag}>
                        {d.kind === 'zone0Entry' || d.kind === 'zonePpe' ? detLabel(d) : DETECTION_LABEL[d.kind]}
                      </span>{' '}
                      <span className="dim">{Math.round(d.confidence * 100)}%</span>
                    </td>
                    <td title={d.workerId ? names.get(d.workerId) : undefined}>{d.workerId ? names.get(d.workerId) ?? d.workerId : '-'}</td>
                    <td className="act">
                      {cam && (
                        <button onClick={() => walkToTag(cam.watches[0])} title={`Walk to ${cam.watches[0]} (${cam.name})`}>
                          Walk
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  )
}

const EMPTY_SEG: SegInstance[] = EMPTY_ARR

/** is SAM 3.1 answering for this camera? Re-checked each second, because a silent model sends no update */
function useSamLive(cam: string) {
  const frames = useSam((s) => s.frames)
  const [, tick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return samLive(cam, frames)
}

/** says which detector this tile's boxes come from */
function ModelBadge({ cam }: { cam: string }) {
  const live = useSamLive(cam)
  const meta = useSam((s) => s.source === 'meta')
  return (
    <div className={`cctv-model-badge ${live ? 'live' : ''}`} data-model-badge={live ? 'sam-3.1' : 'sim'}>
      {live ? (meta ? 'SAM 3.1 · Meta API' : 'SAM 3.1') : 'SIM'}
    </div>
  )
}

const SAM_COLOURS: Record<string, string> = { person: '#22d3ee', 'hard hat': '#facc15', 'high-visibility vest': '#4ade80', flame: '#fb7185', smoke: '#a78bfa' }

/** real SAM 3.1 masks from the last answer. Hard hats and vests are small, so labels stack instead of overlapping */
function SamLayer({ cam, big, masksOn }: { cam: string; big: boolean; masksOn: boolean }) {
  const frame = useSam((s) => s.frames[cam])
  const meta = useSam((s) => s.source === 'meta')
  const roster = useWorkers((s) => s.roster)
  const masks = useMemo(() => frame?.masks ?? [], [frame])
  const labels = useMemo(() => {
    const used: [number, number][] = []
    return masks.map((m) => {
      const x = Math.min(0.93, Math.max(0.07, (m.box[0] + m.box[2]) / 2))
      let y = Math.max(0.05, m.box[1] - 0.008)
      while (used.some(([ux, uy]) => Math.abs(ux - x) < 0.15 && Math.abs(uy - y) < 0.035)) y -= 0.036
      used.push([x, y])
      return { m, x, y: Math.max(0.04, y), name: roster.find((w) => w.id === m.workerId)?.name.split(' ').at(-1) }
    })
  }, [masks, roster])
  return (
    <div className="cctv-seg" data-sam-layer>
      {masksOn && (
        <svg key={frame?.at} className="cctv-sam-mask" viewBox="0 0 1 1" preserveAspectRatio="none">
          {masks.flatMap((m, i) => m.polygons.map((p, j) => <polygon key={`${i}-${j}`} points={p.map((q) => q.join(',')).join(' ')} style={{ ['--c' as string]: SAM_COLOURS[m.label] ?? '#e5e7eb' }} />))}
        </svg>
      )}
      {big && masksOn && labels.map(({ m, x, y, name }, i) => (
        <span key={`${frame?.at}-${i}`} className="cctv-seglbl cctv-sam-lbl" style={{ left: `${x * 100}%`, top: `${y * 100}%`, ['--c' as string]: SAM_COLOURS[m.label] ?? '#e5e7eb' }}>
          {m.label} <b>{m.score.toFixed(2)}</b>
          {name && <i>{name}</i>}
        </span>
      ))}
      {big && (
        <div className="cctv-segtag">
          SAM 3.1 · live model · {masks.length} instances
          {meta && frame && ` · scan from ${Math.round((performance.now() - frame.at) / 1000)} s ago`}
        </div>
      )}
    </div>
  )
}

/** simulated SAM 3.1 masks + concept labels over the main monitor, or the real ones while the model is answering */
function SegLayer({ cam, big }: { cam: string; big: boolean }) {
  const on = useCctv((s) => s.seg)
  const live = useSamLive(cam)
  const inst = useCctv((s) => s.segLive[cam]) ?? EMPTY_SEG
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    const img = segFrames.get(cam)
    if (!el || !img) return
    el.width = img.width
    el.height = img.height
    el.getContext('2d')?.putImageData(img, 0, 0)
  }, [inst, cam])
  // greedy label placement: no overlaps, clear of the OSD (top-left) and the detector panel (top-right)
  const labels = useMemo(() => {
    const placed: { k: SegInstance; x: number; y: number; r: [number, number, number, number] }[] = []
    const blocked: [number, number, number, number][] = [
      [0, 0, 0.5, 0.09],
      [0.69, 0, 1, 0.36],
      [0, 0.94, 1, 1],
    ]
    const hit = (a: [number, number, number, number], b: [number, number, number, number]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
    // people and PPE first (they matter most), then the largest masks
    const order = [...inst].sort((a, b) => Number(b.cls === 'person' || b.cls === 'hardHat' || b.cls === 'vest') - Number(a.cls === 'person' || a.cls === 'hardHat' || a.cls === 'vest') || b.pixels - a.pixels)
    for (const k of order) {
      if (placed.length >= 14) break
      const chars = SEG_BY_ID[k.cls].prompt.length + 12
      const w = chars * 0.0068
      const h = 0.034
      const x = Math.min(1 - w / 2 - 0.005, Math.max(w / 2 + 0.005, k.anchor[0]))
      // try above the mask, then inside its top edge, then lower down
      for (const y of [k.anchor[1], k.anchor[1] + h + 0.01, (k.box[1] + k.box[3]) / 2 + h / 2]) {
        const r: [number, number, number, number] = [x - w / 2, y - h, x + w / 2, y]
        if (r[1] < 0 || r[3] > 1 || blocked.some((b) => hit(r, b)) || placed.some((p) => hit(r, p.r))) continue
        placed.push({ k, x, y, r })
        break
      }
    }
    return placed
  }, [inst])
  if (live) return <SamLayer cam={cam} big={big} masksOn={on} />
  if (!on || !big) return null
  return (
    <div className="cctv-seg">
      <canvas ref={ref} />
      {labels.map(({ k, x, y }) => {
        const c = SEG_BY_ID[k.cls]
        const tag = k.cls === 'person' || k.cls === 'hardHat' || k.cls === 'vest' ? k.name.split(' ')[0] : k.ref
        return (
          <span key={k.id} className="cctv-seglbl" style={{ left: `${x * 100}%`, top: `${y * 100}%`, ['--c' as string]: c.color }}>
            {c.prompt} <b>{k.score.toFixed(2)}</b>
            {k.cls !== 'hardHat' && k.cls !== 'vest' && <i>{tag}</i>}
          </span>
        )
      })}
      <div className="cctv-segtag">SAM 3.1 · simulated · {inst.length} instances</div>
    </div>
  )
}

/** what SAM 3.1 is really being asked for, with what it found in the last frame */
function SamPrompts({ cam }: { cam: string }) {
  const masks = useSam((s) => s.frames[cam]?.masks) ?? EMPTY_ARR
  const asked = useSam((s) => s.frames[cam]?.asked)
  return (
    <div className="cctv-prompts" data-sam-prompts>
      {Object.entries(SAM_COLOURS).filter(([prompt]) => !asked || asked.includes(prompt)).map(([prompt, colour]) => (
        <span key={prompt} className="cctv-prompt on" style={{ ['--c' as string]: colour }}>
          <i />
          {prompt}
          <b>{masks.filter((m) => m.label === prompt).length}</b>
        </span>
      ))}
    </div>
  )
}

/** concept prompts (what the segmenter is asked to find) with live instance counts */
function PromptsBox({ cam }: { cam: string }) {
  const on = useCctv((s) => s.seg)
  const prompts = useCctv((s) => s.prompts)
  const inst = useCctv((s) => s.segLive[cam]) ?? EMPTY_SEG
  const ms = useCctv((s) => s.segMs)
  const workers = useStore((s) => s.workers)
  const live = useSamLive(cam)
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const k of inst) m[k.cls] = (m[k.cls] ?? 0) + 1
    return m
  }, [inst])
  return (
    <Box
      title={`Segmentation: SAM 3.1 (${live ? 'live model' : 'simulated'})`}
      right={
        <button className={on ? 'on' : ''} onClick={() => useCctv.getState().setSeg(!on)} data-seg-toggle>
          {on ? 'Masks on' : 'Masks off'}
        </button>
      }
    >
      {live ? (
        <SamPrompts cam={cam} />
      ) : (
      <div className="cctv-prompts">
        {SEG_CLASSES.map((c) => (
          <button key={c.id} className={`cctv-prompt ${prompts[c.id] ? 'on' : ''}`} style={{ ['--c' as string]: c.color }} onClick={() => useCctv.getState().togglePrompt(c.id)} title={`Text prompt: "${c.prompt}"`}>
            <i />
            {c.prompt}
            <b>{counts[c.id] ?? 0}</b>
          </button>
        ))}
      </div>
      )}
      <div className="dim small" style={{ marginTop: 6 }}>
        {live ? `Text prompts → real masks from SAM 3.1 on ${cam}.` : `Text prompts → instance masks on the main monitor (${cam}). ${on && ms ? `Last pass ${ms.toFixed(0)} ms in the browser.` : ''}`}{' '}
        {!workers && (
          <>
            People, hard hats and vests need field workers:{' '}
            <button className="link" onClick={() => useStore.getState().setWorkers(true)}>
              turn them on
            </button>
            .
          </>
        )}
      </div>
    </Box>
  )
}

const TRACK_COLOURS = ['#22d3ee', '#facc15', '#4ade80', '#fb7185', '#a78bfa', '#fb923c', '#38bdf8', '#f472b6']

/** a recorded clip with SAM 3.1's tracks on it, in its own panel so the live monitor stays uncovered */
function ReviewBox({ clip }: { clip: ReviewClip }) {
  const video = useRef<HTMLVideoElement>(null)
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const v = video.current
    if (!v) return
    let id = 0
    const seen: VideoFrameRequestCallback = (_, shown) => {
      setFrame(frameAt(clip.times, shown.mediaTime))
      id = v.requestVideoFrameCallback(seen)
    }
    id = v.requestVideoFrameCallback(seen)
    return () => v.cancelVideoFrameCallback(id)
  }, [clip])
  const tracked = clip.frames[frame] ?? EMPTY_ARR
  const colour = (id: string) => TRACK_COLOURS[clip.ids.indexOf(id) % TRACK_COLOURS.length]
  const people = clip.ids.length
  return (
    <Box title={`Review: ${clip.camera}`} right={<button onClick={closeReview} data-review-close>Close</button>} className="cctv-review">
      <div className="cctv-replay" data-review-replay>
        <video ref={video} src={clip.url} autoPlay loop muted playsInline controls />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {tracked.flatMap((p) => p.polygons.map((g, i) => <polygon key={`${p.id}-${i}`} points={g.map((q) => q.join(',')).join(' ')} style={{ ['--c' as string]: colour(p.id) }} />))}
        </svg>
        {tracked.map((p) => (
          <span key={p.id} className="cctv-seglbl" style={{ left: `${(p.box[0] + p.box[2]) * 50}%`, top: `${Math.max(p.box[1] * 100, 8)}%`, ['--c' as string]: colour(p.id) }} data-review-track={p.id}>
            person {p.id} <b>{p.score.toFixed(2)}</b>
          </span>
        ))}
        <div className="cctv-replay-tag">Recorded clip, not live</div>
      </div>
      <p className="h-note" data-review-summary>
        {people ? `${people} ${people === 1 ? 'person' : 'people'} tracked by real SAM 3.1 through the Meta Model API. Each keeps one number through the clip.` : 'SAM 3.1 tracked nobody in this clip.'} Ends at {fmtClock(clip.t)}. Only people were looked for.
      </p>
    </Box>
  )
}

/** the one way a clip is sent. The cost is on screen before the press */
function ReviewRow() {
  const r = useReview()
  const ready = r.have >= CLIP_S
  return (
    <div data-review-row>
      <button onClick={() => void reviewLastSeconds()} disabled={!ready || r.busy} title="One clip, sent once, looking only for people" data-review>
        {r.busy ? 'Tracking the clip' : `Review the last ${CLIP_S} s`}
      </button>{' '}
      <span className="dim" data-review-cost>
        {ready || r.busy ? '' : `Recording, ${r.have} of ${CLIP_S} s. `}One press sends one clip: at least {CLIP_FRAMES} frames, about ${CLIP_USD.toFixed(2)}. It counts as {CLIP_IMAGES} images towards the limit.
      </span>
    </div>
  )
}

/** the operator's own Meta Model API key. Off on every load, and the running cost stays on screen while it runs */
function MetaRow({ cam }: { cam: string }) {
  const m = useMeta()
  const clips = useReview((s) => s.clips)
  const [draft, setDraft] = useState('')
  const key = cleanKey(draft)
  const worst = worstScan(m.ppe, m.fire)
  const scans = m.images - clips * CLIP_IMAGES
  const save = () => {
    if (!key) return
    void m.save(key)
    setDraft('')
  }
  return (
    <tr>
      <td className="dim">Meta API</td>
      <td className="cctv-meta" data-meta-row>
        {!m.saved ? (
          <form onSubmit={(e) => (e.preventDefault(), save())}>
            <input type="password" autoComplete="off" spellCheck={false} placeholder="API key from dev.meta.ai" aria-label="Meta Model API key" value={draft} onChange={(e) => setDraft(e.target.value)} data-meta-key />
            <button type="submit" disabled={!key} data-meta-save>
              Save
            </button>
            <div className="dim">Runs real SAM 3.1 on your own Meta account. Billed by Meta at about $2.50 per 1,000 images. The key stays encrypted in this browser and goes to Meta only with each scan, through this site's server.</div>
          </form>
        ) : (
          <>
            <div>
              <button className={m.on ? 'on' : ''} onClick={() => m.setOn(!m.on)} data-meta-toggle>
                {m.on ? 'On: click to turn off' : 'Turn on'}
              </button>{' '}
              <button onClick={() => void testKey()} disabled={m.busy} title="One billed image on the main monitor" data-meta-test>
                Test key
              </button>{' '}
              <button onClick={() => void m.forget()} data-meta-forget>
                Forget key
              </button>
            </div>
            <div>
              <label>
                <input type="checkbox" checked={m.ppe} onChange={(e) => m.set({ ppe: e.target.checked })} /> Hard hat and vest
              </label>{' '}
              <label>
                <input type="checkbox" checked={m.fire} onChange={(e) => m.set({ fire: e.target.checked })} /> Flame and smoke
              </label>{' '}
              <label>
                every{' '}
                <select value={m.every} onChange={(e) => m.set({ every: Number(e.target.value) })} aria-label="Seconds between scans">
                  {EVERY_S.map((s) => (
                    <option key={s} value={s}>
                      {s} s
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="dim" data-meta-spend>
              {scans} {scans === 1 ? 'image' : 'images'}{clips > 0 && ` + ${clips} ${clips === 1 ? 'clip' : 'clips'}`} · about ${(m.images * IMAGE_USD).toFixed(4)} since this page loaded{' · '}{m.on ? `${m.run} of ${CAP_IMAGES} before it stops itself` : `at most ${worst} per scan, about $${((worst * IMAGE_USD * 3600) / m.every).toFixed(2)}/h`}
            </div>
            {m.on && !samCamera(cam) && <div className="dim">Thermal camera on the main monitor: no calls until a colour camera is up.</div>}
            {m.on && samCamera(cam) && canRecord() && <ReviewRow />}
          </>
        )}
        {m.note && <div data-meta-note>{m.note}</div>}
      </td>
    </tr>
  )
}

function ModelBox() {
  const live = useCctv((s) => s.live)
  useS((s) => s.t) // refresh the measured rates with the sim clock (2 Hz)
  const selected = useCctv((s) => s.callUp ?? s.selected)
  const sam = useSam()
  const samOn = useSamLive(selected)
  const now = Object.values(live).flat()
  const people = now.filter((d) => d.kind === 'person').length
  const ppe = now.filter((d) => d.kind === 'noHardHat' || d.kind === 'noVest' || d.kind === 'restrictedZone' || d.kind === 'zone0Entry' || d.kind === 'zonePpe').length
  const hazards = now.filter((d) => d.kind === 'fire' || d.kind === 'gasCloud').length
  const per = 1000 / FEED_INTERVAL_MS
  const others = Math.max(1, feedCanvases.size - 1)
  const bigFps = feedStats.get(selected)?.fps
  return (
    <Box title="Detector model">
      <div className="h-kpis cctv-kpis">
        <Kpi label="People in view" value={String(people)} />
        <Kpi label="PPE / zone violations" value={String(ppe)} abn={ppe > 0} />
        <Kpi label="Hazards" value={String(hazards)} bad={hazards > 0} />
      </div>
      <table className="h-tbl cctv-model">
        <tbody>
          <tr>
            <td className="dim">Active</td>
            <td data-detector-active>
              {samOn && sam.source === 'meta' ? (
                <>
                  <b>SAM 3.1 through the Meta Model API</b> : real masks and scores on the main monitor only, billed to your key. {sam.rtt.toFixed(0)} ms round trip. The video stays live, and masks fade until the next scan. Moving the camera clears them, and it scans again once the camera rests. Every other camera, and anything SAM isn't asked about, stays simulated.
                </>
              ) : samOn ? (
                <>
                  <b>SAM 3.1 on a Modal GPU</b> : real masks and scores on the 11 colour cameras, in turn. {sam.rtt.toFixed(0)} ms round trip, {sam.gpu} ms on the GPU. The video stays live and masks fade between answers. Thermal cameras stay simulated.
                </>
              ) : (
                <>
                  <b>Simulated SAM 3.1 (twin ground truth)</b> : instance masks from an id render pass of the camera view (true occlusion), PPE boxes from worker flags, hazards from live incidents
                </>
              )}
            </td>
          </tr>
          {sam.connected && (
            <tr>
              <td className="dim">SAM 3.1</td>
              <td>
                <button
                  className={sam.on ? 'on' : ''}
                  onClick={() => {
                    useMeta.getState().setOn(false)
                    sam.setOn(!sam.on)
                  }}
                  data-sam-toggle
                >
                  {sam.on ? 'On' : 'Off'}
                </button>{' '}
                {!sam.on ? 'Simulated until turned on' : !samCamera(selected) ? 'Thermal camera: simulated detector' : sam.state === 'waking' ? 'Waking the GPU, up to a minute. Simulated until then' : sam.state === 'error' ? 'Not answering. Simulated until it does' : sam.state === 'live' ? 'Connected' : ''}
              </td>
            </tr>
          )}
          <MetaRow cam={selected} />
          <tr>
            <td className="dim">Frame rate</td>
            <td className="mono">
              main {bigFps ? bigFps.toFixed(1) : (per / 2).toFixed(1)} fps · others {(per / 2 / others).toFixed(2)} fps each ({FEED_INTERVAL_MS} ms round-robin)
            </td>
          </tr>
          <tr>
            <td className="dim">Classes</td>
            <td>{SEG_CLASSES.length} segmentation prompts · person · no hard hat · no hi-vis vest · flame · gas cloud · hazardous-area zone (Zone 0 entry / Zone 1–2 PPE: zone map per camera; gas monitor from the worn tag)</td>
          </tr>
        </tbody>
      </table>
    </Box>
  )
}
