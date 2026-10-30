/**
 * CCTV & PPE: the control-room camera wall (plan 07).
 *
 *  - One big tile (the operator's camera, or the camera CALLED UP by an F&G alarm: red border + banner)
 *    and seven smaller tiles; click a tile to put it on the big monitor.
 *  - Every tile is a live feed rendered from inside the twin (scene/CctvRenderer.tsx paints the canvas)
 *    with a camera OSD, the warning levels of the F&G detectors in the zones the camera covers (%LEL bars,
 *    flame detector states, zone status) and the detector's boxes (people, no hard hat, no hi-vis vest,
 *    flame, gas cloud).
 *  - Right column: the call-up, the detection log (Walk to), and the detector-model card. Detections are
 *    simulated from the twin's ground truth today; SAM 3.1 on a Modal GPU is the planned replacement.
 */
import { memo, useEffect, useMemo, useRef } from 'react'
import { Box, Kpi } from './common'
import { EMPTY_ARR, EMPTY_OBJ, useS } from './simApi'
import { CAMERAS, FEED_H, FEED_INTERVAL_MS, FEED_W, SEG_BY_ID, SEG_CLASSES, cameraById, feedStats, registerFeed, segFrames, unregisterFeed, useCctv, type CctvCameraEx, type SegInstance } from '../../safety/cctv'
import { useWorkers } from '../../safety/workers'
import { DETECTION_LABEL, type Detection, type DetectionKind, type WorkerInfo } from '../../safety/types'
import { fmtClock, type DetectorSim, type ZoneStatus } from '../../sim/types'
import { usePlant } from '../../state/plantStore'
import { useStore } from '../../state/store'
import { zoneById, zoneDetectors, GAS_HIGH, GAS_LOW, OGD_HIGH, OGD_LOW, OGD_MAX, type Detector } from '../../sim/fg'
import { walkToTag } from '../walkTo'
import './cctv.css'

const BIG_W = 960
const BIG_H = 540
const KIND_CLASS: Record<DetectionKind, string> = { person: 'person', noHardHat: 'ppe', noVest: 'ppe', restrictedZone: 'ppe', fire: 'fire', gasCloud: 'gas' }
const EMPTY_DET: Detection[] = EMPTY_ARR
const EMPTY_ROSTER: WorkerInfo[] = EMPTY_ARR

export function CctvPage() {
  const selected = useCctv((s) => s.selected)
  const callUp = useCctv((s) => s.callUp)
  const setFeedsVisible = useCctv((s) => s.setFeedsVisible)
  useEffect(() => {
    setFeedsVisible(true)
    return () => setFeedsVisible(false)
  }, [setFeedsVisible])

  const bigId = callUp ?? selected
  const big = cameraById(bigId) ?? CAMERAS[0]
  const small = CAMERAS.filter((c) => c.id !== big.id)

  return (
    <div className="cctv">
      <div className="cctv-wall" role="region" aria-label="CCTV camera wall">
        <Tile key={`big-${big.id}`} cam={big} big calledUp={callUp === big.id} />
        {small.map((c, i) => (
          <Tile key={c.id} cam={c} slot={i} />
        ))}
      </div>
      <div className="cctv-side">
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
  // small tiles fill the right-hand column (3) and the bottom row (4) around the big monitor
  const style = big ? undefined : slot! < 3 ? { gridColumn: 4, gridRow: slot! + 1 } : { gridColumn: slot! - 2, gridRow: 4 }
  return (
    <div
      className={`cctv-tile ${big ? 'big' : ''} ${calledUp ? 'callup' : ''} ${cam.type}`}
      style={style}
      onClick={big ? undefined : () => setSelected(cam.id)}
      title={big ? `${cam.id} · ${cam.model}` : `${cam.id} — click to show on the main monitor`}
      data-cam={cam.id}
    >
      <canvas ref={canvas} width={w} height={h} />
      {big && <SegLayer cam={cam.id} />}
      <Boxes cam={cam.id} big={!!big} />
      <Osd cam={cam} big={!!big} />
      <DetectorPanel cam={cam} big={!!big} />
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
        {big && <span className="sub">{cam.platform.toUpperCase()} · FOV {cam.fov}° · </span>}
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
        const label = `${DETECTION_LABEL[d.kind]}${big && d.kind === 'person' && d.workerId ? ` · ${names.get(d.workerId) ?? d.workerId}` : ''} ${Math.round(d.confidence * 100)}%`
        return (
          <div key={d.id} className={`cctv-det ${KIND_CLASS[d.kind]} ${d.kind} ${y0 < 0.07 ? 'top' : ''}`} style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` }}>
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
                      <span className={`cctv-k ${KIND_CLASS[d.kind]}`}>{DETECTION_LABEL[d.kind]}</span> <span className="dim">{Math.round(d.confidence * 100)}%</span>
                    </td>
                    <td title={d.workerId ? names.get(d.workerId) : undefined}>{d.workerId ? names.get(d.workerId) ?? d.workerId : '—'}</td>
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

/** simulated SAM 3.1 masks + concept labels over the main monitor */
function SegLayer({ cam }: { cam: string }) {
  const on = useCctv((s) => s.seg)
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
  if (!on) return null
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

/** concept prompts (what the segmenter is asked to find) with live instance counts */
function PromptsBox({ cam }: { cam: string }) {
  const on = useCctv((s) => s.seg)
  const prompts = useCctv((s) => s.prompts)
  const inst = useCctv((s) => s.segLive[cam]) ?? EMPTY_SEG
  const ms = useCctv((s) => s.segMs)
  const workers = useStore((s) => s.workers)
  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const k of inst) m[k.cls] = (m[k.cls] ?? 0) + 1
    return m
  }, [inst])
  return (
    <Box
      title="Segmentation — SAM 3.1 (simulated)"
      right={
        <button className={on ? 'on' : ''} onClick={() => useCctv.getState().setSeg(!on)} data-seg-toggle>
          {on ? 'Masks on' : 'Masks off'}
        </button>
      }
    >
      <div className="cctv-prompts">
        {SEG_CLASSES.map((c) => (
          <button key={c.id} className={`cctv-prompt ${prompts[c.id] ? 'on' : ''}`} style={{ ['--c' as string]: c.color }} onClick={() => useCctv.getState().togglePrompt(c.id)} title={`Text prompt: "${c.prompt}"`}>
            <i />
            {c.prompt}
            <b>{counts[c.id] ?? 0}</b>
          </button>
        ))}
      </div>
      <div className="dim small" style={{ marginTop: 6 }}>
        Text prompts → instance masks on the main monitor ({cam}). {on && ms ? `Last pass ${ms.toFixed(0)} ms in the browser.` : ''}{' '}
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

function ModelBox() {
  const live = useCctv((s) => s.live)
  useS((s) => s.t) // refresh the measured rates with the sim clock (2 Hz)
  const selected = useCctv((s) => s.callUp ?? s.selected)
  const now = Object.values(live).flat()
  const people = now.filter((d) => d.kind === 'person').length
  const ppe = now.filter((d) => d.kind === 'noHardHat' || d.kind === 'noVest').length
  const hazards = now.filter((d) => d.kind === 'fire' || d.kind === 'gasCloud').length
  const per = 1000 / FEED_INTERVAL_MS
  const others = Math.max(1, CAMERAS.length - 1)
  const bigFps = feedStats.get(selected)?.fps
  return (
    <Box title="Detector model">
      <div className="h-kpis cctv-kpis">
        <Kpi label="People in view" value={String(people)} />
        <Kpi label="PPE violations" value={String(ppe)} abn={ppe > 0} />
        <Kpi label="Hazards" value={String(hazards)} bad={hazards > 0} />
      </div>
      <table className="h-tbl cctv-model">
        <tbody>
          <tr>
            <td className="dim">Active</td>
            <td>
              <b>Simulated SAM 3.1 (twin ground truth)</b> — instance masks from an id render pass of the camera view (true occlusion), PPE boxes from worker flags, hazards from live incidents
            </td>
          </tr>
          <tr>
            <td className="dim">Planned</td>
            <td>SAM 3.1 on a Modal GPU (plan 11, 9e): the same frames and text prompts in, the same masks and scores out</td>
          </tr>
          <tr>
            <td className="dim">Frame rate</td>
            <td className="mono">
              main {bigFps ? bigFps.toFixed(1) : (per / 2).toFixed(1)} fps · others {(per / 2 / others).toFixed(2)} fps each ({FEED_INTERVAL_MS} ms round-robin)
            </td>
          </tr>
          <tr>
            <td className="dim">Classes</td>
            <td>{SEG_CLASSES.length} segmentation prompts · person · no hard hat · no hi-vis vest · flame · gas cloud</td>
          </tr>
        </tbody>
      </table>
    </Box>
  )
}
