/**
 * Walk-mode overlay: centre crosshair, key hints, the "Go to…" search, a plan minimap (drag to pan,
 * wheel to zoom, click deck to teleport, click an item to walk to it, landmarks such as the CCR always
 * reachable) and the "sit at the console" prompt in a control room.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlant } from '../state/plantStore'
import { WALK_DIST, useStore } from '../state/store'
import { footprints } from '../model/footprint'
import type { Module, Plant, PlanRect, WalkLevel } from '../model/types'
import { levelAt, placeWalker, walkAuto, walkLevels, walkPose } from '../scene/Walk'
import { EMBARK } from '../scene/env/lqQuarters'
import { LQ } from '../model/site'
import './hmi/hmi.css'
import './minimap.css'
import { walkSurfaces } from '../scene/walkSurfaces'
import { enterRoom, goToTag } from './walkTo'
import { HAZ_COLOR, PPE_LABEL, ZONE_RULES, personZone, type HazZone } from '../safety/hazardAreas'

export function WalkHud() {
  const walk = useStore((s) => s.walk)
  const lookAt = useStore((s) => s.lookAt)
  const setWalk = useStore((s) => s.setWalk)
  const view = useStore((s) => s.walkView)
  const setView = useStore((s) => s.setWalkView)
  if (!walk) return null
  return (
    <>
      {view === 'first' && <div className={`crosshair ${lookAt ? 'on' : ''}`} />}
      <div className="walk-hint small">
        <b>Walkthrough</b> · ↑↓ walk · ←→ turn · Q/E step sideways · drag to look · Shift run · walk up stairs & ladders (or 1–4 to jump decks) · doors open as you approach · click an item to pin it ·{' '}
        <button className="link" onClick={() => setView(view === 'third' ? 'first' : 'third')} title="V">
          {view === 'third' ? 'Hide person' : 'Show person'} (V)
        </button>{' '}
        · scroll or − / + to zoom{' '}
        · <button className="link" onClick={() => setWalk(false)}>Exit (Esc)</button>
      </div>
      <CamControl />
      <MapPanel />
      <Levels />
      <ConsolePrompt />
      <HazardZoneChip />
    </>
  )
}

/**
 * Walk-mode camera: through the eyes, behind the person, or in front of them (to see the face and kit), and how
 * far away — a slider plus Reset (3.6 m). The mouse wheel and the − / + keys move the same distance.
 */
function CamControl() {
  const view = useStore((s) => s.walkView)
  const dist = useStore((s) => s.walkDist)
  const front = useStore((s) => s.walkFront)
  const st = useStore.getState
  const mode = view === 'first' ? 'eyes' : front ? 'front' : 'behind'
  const setMode = (m: 'eyes' | 'behind' | 'front') => {
    if (m === 'eyes') return st().setWalkView('first')
    st().setWalkView('third')
    st().setWalkFront(m === 'front')
  }
  return (
    <div className="walk-cam-ctl small" aria-label="Walk camera">
      <span className="lbl">Camera</span>
      <div className="seg">
        {(['eyes', 'behind', 'front'] as const).map((m) => (
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} title={m === 'eyes' ? 'Through the eyes (V)' : m === 'behind' ? 'Behind the person (V)' : 'In front, looking back at the person'}>
            {m === 'eyes' ? 'Eyes' : m === 'behind' ? 'Behind' : 'Front'}
          </button>
        ))}
      </div>
      <label className="dist" title="Distance from the person — or scroll / − +">
        <span className="faint">Close</span>
        <input
          type="range"
          min={WALK_DIST.min}
          max={WALK_DIST.max}
          step={0.1}
          value={dist}
          disabled={mode === 'eyes'}
          onChange={(e) => st().setWalkDist(Number(e.target.value))}
          onPointerUp={(e) => (e.currentTarget as HTMLInputElement).blur()}
        />
        <span className="faint">Far</span>
        <span className="mono val">{mode === 'eyes' ? '—' : `${dist.toFixed(1)} m`}</span>
      </label>
      <button
        className="reset"
        onClick={() => {
          st().setWalkView('third')
          st().setWalkFront(false)
          st().setWalkDist(WALK_DIST.def)
        }}
        disabled={mode === 'behind' && Math.abs(dist - WALK_DIST.def) < 0.05}
        title={`Back to the default: behind the person, ${WALK_DIST.def} m`}
      >
        Reset
      </button>
    </div>
  )
}

function Levels() {
  const plant = usePlant()
  const level = useStore((s) => s.walkLevel)
  const setLevel = useStore((s) => s.setWalkLevel)
  const levels = walkLevels(plant)
  if (levels.length < 2) return null
  return (
    <div className="walk-levels seg">
      {levels.map((l, i) => (
        <button key={l.id} className={i === level ? 'on' : ''} onClick={() => setLevel(i)} title={`Key ${i + 1}`}>
          {l.label}
        </button>
      ))}
    </div>
  )
}

/** minimap sizes (px): normal and expanded */
const SIZES = { small: [300, 260], big: [520, 460] } as const
/** default metres across the map width; the narrowest zoom */
const SPAN0 = 120
const SPAN_MIN = 30
const DRAG_PX = 4

const inRects = (rs: PlanRect[], x: number, z: number) => rs.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** a place on the map that is always drawn and clickable, wherever the view is */
interface Landmark {
  id: string
  /** short map label */
  short: string
  title: string
  kind: 'ccr' | 'room' | 'boat' | 'heli'
  x: number
  z: number
  /** the walk level it stands on */
  li: number
  /** plan footprint to draw (rooms) */
  rect?: PlanRect
  /** circle radius to draw (helideck) */
  r?: number
  /** off-screen landmarks get an edge arrow */
  arrow: boolean
  go: () => void
}

/** module plan rectangle (quarter-turn rotations) */
function moduleRect(m: Module): PlanRect {
  const q = Math.abs(Math.round(m.rotationY / (Math.PI / 2))) % 2 === 1
  const hx = (q ? m.size[2] : m.size[0]) / 2
  const hz = (q ? m.size[0] : m.size[2]) / 2
  return { x0: m.position[0] - hx, x1: m.position[0] + hx, z0: m.position[2] - hz, z1: m.position[2] + hz }
}

/** teleport (stop any autopilot first; it would steer the walker away again) */
function teleport(x: number, z: number, face?: [number, number], li?: number) {
  if (walkAuto.active) walkAuto.onInterrupt?.()
  placeWalker(x, z, face, li)
  walkPose.pitch = -0.05
  if (li !== undefined && useStore.getState().walkLevel !== li) useStore.getState().setWalkLevel(li)
}

function landmarksOf(plant: Plant, levels: WalkLevel[]): Landmark[] {
  const out: Landmark[] = []
  // control rooms: the CCR first, then local control rooms / temporary refuges
  const rooms = plant.equipment.filter((e): e is Module => e.kind === 'module' && e.interior === 'controlRoom')
  rooms.sort((a, b) => (a.tag === 'B-9300' ? -1 : b.tag === 'B-9300' ? 1 : a.tag.localeCompare(b.tag)))
  for (const m of rooms) {
    const ccr = m.tag === 'B-9300'
    out.push({
      id: m.tag,
      short: ccr ? 'CCR' : 'LCR',
      title: `${m.tag} ${m.name} — click to go inside`,
      kind: ccr ? 'ccr' : 'room',
      x: m.position[0],
      z: m.position[2],
      li: levelAt(levels, m.position[1]),
      rect: moduleRect(m),
      arrow: true,
      go: () => enterRoom(m.tag),
    })
  }
  // Alpha field accommodation: lifeboat (TEMPSC) muster stations on the east embarkation deck, the helideck on the quarters roof
  const prod = levels.findIndex((l) => l.id === 'production')
  if (prod >= 0 && inRects(levels[prod].areas, EMBARK.x0 + 1.3, EMBARK.z0 + 5)) {
    const bx = (EMBARK.x0 + EMBARK.x1) / 2
    EMBARK.boats.forEach((z, i) =>
      out.push({
        id: `LB${i + 1}`,
        short: `LB${i + 1}`,
        title: `Lifeboat ${i + 1} (TEMPSC) muster station — click to go there`,
        kind: 'boat',
        x: bx,
        z,
        li: prod,
        arrow: false,
        go: () => teleport(bx - 0.6, z, [bx + 10, z], prod),
      }),
    )
    const h = LQ.helideck
    // the helideck is up the accommodation's east escape stair; land at its foot, facing up the flight
    out.push({
      id: 'HELI',
      short: 'H',
      title: 'Helideck (quarters roof) — click to go to the escape stair foot',
      kind: 'heli',
      x: h.x,
      z: h.z,
      r: h.r,
      li: prod,
      arrow: false,
      go: () => teleport(bx, EMBARK.z1 - 0.8, [bx, EMBARK.z1 + 6], prod),
    })
  }
  return out
}

/** Bottom-left map panel: the Go to search above, the ticking map below. */
function MapPanel() {
  const [big, setBig] = useState(false)
  return (
    <div className={`minimap mm2 ${big ? 'big' : ''}`}>
      <GoTo />
      <Minimap big={big} setBig={setBig} />
    </div>
  )
}

interface View {
  cx: number
  cz: number
  span: number
  follow: boolean
  /** the level the view was set on: another level means follow the walker again */
  level: number
}

function Minimap({ big, setBig }: { big: boolean; setBig: (b: boolean) => void }) {
  const plant = usePlant()
  const lookAt = useStore((s) => s.lookAt?.tag)
  const selected = useStore((s) => s.selected?.tag)
  const level = useStore((s) => s.walkLevel)
  const [, setTick] = useState(0)
  useEffect(() => {
    let id = 0
    const loop = () => {
      setTick((t) => (t + 1) % 1e6)
      id = window.setTimeout(() => (raf = requestAnimationFrame(loop)), 66)
    }
    let raf = requestAnimationFrame(loop)
    return () => (cancelAnimationFrame(raf), clearTimeout(id))
  }, [])
  const [view, setView] = useState<View>({ cx: 0, cz: 0, span: SPAN0, follow: true, level })
  const [hover, setHover] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cz: number; k: number; moved: boolean; target: Element | null; id: number } | null>(null)

  // per-plant work, memoised (the map re-renders at ~15 Hz)
  const levels = walkLevels(plant)
  const lv = levels[level] ?? levels[0]
  const fps = useMemo(() => footprints(plant.equipment, 0), [plant])
  const eqs = useMemo(
    () => plant.equipment.map((e, i) => ({ e, f: fps[i], li: levelAt(walkLevels(plant), e.position[1]) })).filter((x) => x.e.kind !== 'proxy'),
    [plant, fps],
  )
  const marks = useMemo(() => landmarksOf(plant, walkLevels(plant)), [plant])
  const stairs = useMemo(
    () => walkSurfaces(plant).filter((s) => s.kind !== 'area' && Math.min(s.y0, s.y1) <= lv.y + 0.05 && Math.max(s.y0, s.y1) >= lv.y - 0.05),
    [plant, lv],
  )
  const ext = useMemo(
    () => ({
      x0: Math.min(...lv.areas.map((a) => a.x0)),
      x1: Math.max(...lv.areas.map((a) => a.x1)),
      z0: Math.min(...lv.areas.map((a) => a.z0)),
      z1: Math.max(...lv.areas.map((a) => a.z1)),
    }),
    [lv],
  )

  // the window: `span` metres across the width (height from the aspect), centred on the walker when following
  const [W, H] = SIZES[big ? 'big' : 'small']
  const lw = ext.x1 - ext.x0
  const lh = ext.z1 - ext.z0
  const fitSpan = Math.max(lw, (lh * W) / H) + 4
  const minSpan = Math.min(SPAN_MIN, fitSpan)
  const span = clamp(view.span, minSpan, fitSpan)
  const k = W / span
  const vw = span
  const vh = H / k
  const follow = view.follow || view.level !== level
  const centre = (lo: number, hi: number, size: number, c: number, keepInside: boolean) =>
    size >= hi - lo ? (lo + hi) / 2 : keepInside ? clamp(c, lo + size / 2, hi - size / 2) : clamp(c, lo, hi)
  const cx = centre(ext.x0, ext.x1, vw, follow ? walkPose.x : view.cx, follow)
  const cz = centre(ext.z0, ext.z1, vh, follow ? walkPose.z : view.cz, follow)
  const minX = cx - vw / 2
  const minZ = cz - vh / 2
  const maxX = minX + vw
  const maxZ = minZ + vh
  const vis = (r: PlanRect) => r.x1 > minX && r.x0 < maxX && r.z1 > minZ && r.z0 < maxZ
  const sx = (x: number) => (x - minX) * k
  const sz = (z: number) => (z - minZ) * k

  // wheel zoom around the cursor (a native, non-passive listener so the page doesn't scroll)
  const geo = useRef({ minX, minZ, k, minSpan, fitSpan, W, H, span })
  useEffect(() => {
    geo.current = { minX, minZ, k, minSpan, fitSpan, W, H, span }
  })
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const g = geo.current
      const r = el.getBoundingClientRect()
      const px = ev.clientX - r.left
      const py = ev.clientY - r.top
      const wx = g.minX + px / g.k
      const wz = g.minZ + py / g.k
      const ns = clamp(g.span * Math.exp(ev.deltaY * 0.0015), g.minSpan, g.fitSpan)
      const k2 = g.W / ns
      setView({ cx: wx - px / k2 + ns / 2, cz: wz - py / k2 + g.H / k2 / 2, span: ns, follow: false, level: useStore.getState().walkLevel })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (f: number) => setView({ cx, cz, span: clamp(span * f, minSpan, fitSpan), follow, level })
  const recentre = () => setView({ cx, cz, span: view.span, follow: true, level })

  const onDown = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (ev.button !== 0) return
    drag.current = { x: ev.clientX, y: ev.clientY, cx, cz, k, moved: false, target: ev.target as Element, id: ev.pointerId }
    ev.currentTarget.setPointerCapture(ev.pointerId)
  }
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== ev.pointerId) return
    const dx = ev.clientX - d.x
    const dy = ev.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) <= DRAG_PX) return
    if (!d.moved) setDragging(true)
    d.moved = true
    setView({ cx: d.cx - dx / d.k, cz: d.cz - dy / d.k, span, follow: false, level })
  }
  const onUp = (ev: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    drag.current = null
    setDragging(false)
    if (!d || d.id !== ev.pointerId) return
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId)
    if (d.moved) return
    const hit = d.target?.closest?.('[data-lm],[data-tag]')
    const lm = hit?.getAttribute('data-lm')
    const tag = hit?.getAttribute('data-tag')
    if (lm) marks.find((m) => m.id === lm)?.go()
    else if (tag) goToTag(tag)
    else {
      // empty deck: teleport there (the old behaviour)
      const r = ev.currentTarget.getBoundingClientRect()
      teleport(minX + (ev.clientX - r.left) / k, minZ + (ev.clientY - r.top) / k)
    }
    setView({ cx, cz, span: view.span, follow: true, level: useStore.getState().walkLevel })
  }

  const x = sx(walkPose.x)
  const y = sz(walkPose.z)
  const deg = (-walkPose.yaw * 180) / Math.PI
  const M = 16 // edge-arrow inset
  return (
    <div className="mm-map">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className={dragging ? 'dragging' : ''}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => ((drag.current = null), setDragging(false))}
        onPointerOver={(ev) => setHover((ev.target as Element).closest?.('[data-tip]')?.getAttribute('data-tip') ?? null)}
        onPointerLeave={() => setHover(null)}
      >
        {lv.areas.filter(vis).map((a, i) => (
          <rect key={`a${i}`} x={sx(a.x0)} y={sz(a.z0)} width={(a.x1 - a.x0) * k} height={(a.z1 - a.z0) * k} rx={2} className="mm-deck" />
        ))}
        {stairs.filter(vis).map((s, i) => (
          <rect key={`s${i}`} x={sx(s.x0)} y={sz(s.z0)} width={Math.max(1.5, (s.x1 - s.x0) * k)} height={Math.max(1.5, (s.z1 - s.z0) * k)} className="mm-stair" />
        ))}
        {(lv.obstacles ?? []).filter(vis).map((a, i) => (
          <rect key={`o${i}`} x={sx(a.x0)} y={sz(a.z0)} width={(a.x1 - a.x0) * k} height={(a.z1 - a.z0) * k} className="mm-obstacle" />
        ))}
        {eqs.map(({ e, f, li }) => {
          if (li !== level || !vis(f)) return null
          const tip = `${e.tag} — ${e.name}`
          return (
            <rect
              key={e.tag}
              data-tag={e.tag}
              data-tip={tip}
              x={sx(f.x0)}
              y={sz(f.z0)}
              width={Math.max(1.5, (f.x1 - f.x0) * k)}
              height={Math.max(1.5, (f.z1 - f.z0) * k)}
              className={`mm-eq ${e.tag === selected ? 'sel' : e.tag === lookAt ? 'look' : ''}`}
            >
              <title>{tip}</title>
            </rect>
          )
        })}
        {marks.map((m) => {
          const px = sx(m.x)
          const py = sz(m.z)
          const other = m.li !== level
          const inside = px > 6 && px < W - 6 && py > 6 && py < H - 6
          const dist = Math.round(Math.hypot(m.x - walkPose.x, m.z - walkPose.z))
          const tip = `${m.title}${other ? ` (${levels[m.li]?.label ?? 'another deck'})` : ''} · ${dist} m`
          if (!inside) {
            if (!m.arrow) return null
            // edge arrow: where the ray from the map centre to the landmark leaves the inset frame
            const dx = px - W / 2
            const dy = py - H / 2
            const t = Math.min(Math.abs((W / 2 - M) / (dx || 1e-6)), Math.abs((H / 2 - M) / (dy || 1e-6)))
            const ax = W / 2 + dx * t
            const ay = H / 2 + dy * t
            const ang = (Math.atan2(dy, dx) * 180) / Math.PI
            const lx = clamp(ax, 30, W - 30)
            const ly = ay > H / 2 ? ay - 13 : ay + 21
            return (
              <g key={`lm-${m.id}`} data-lm={m.id} data-tip={tip} className={`mm-lm mm-arrow ${m.kind}`}>
                <title>{tip}</title>
                <g transform={`translate(${ax} ${ay}) rotate(${ang})`}>
                  <circle r={11} className="mm-hit" />
                  <path d="M8 0 L-6 -7 L-3 0 L-6 7 Z" />
                </g>
                <text x={lx} y={ly} textAnchor="middle">
                  {m.short} {dist} m
                </text>
              </g>
            )
          }
          return (
            <g key={`lm-${m.id}`} data-lm={m.id} data-tip={tip} className={`mm-lm ${m.kind} ${other ? 'other' : ''}`}>
              <title>{tip}</title>
              {m.kind === 'heli' && m.r ? (
                <>
                  <circle cx={px} cy={py} r={m.r * k} className="mm-heli" />
                  <text x={px} y={py + 4} textAnchor="middle" className="mm-heli-h">
                    H
                  </text>
                </>
              ) : m.rect ? (
                <>
                  {m.kind === 'ccr' && <circle cx={px} cy={py} r={9} className="mm-pulse" />}
                  <rect
                    x={Math.min(sx(m.rect.x0), px - 6)}
                    y={Math.min(sz(m.rect.z0), py - 5)}
                    width={Math.max((m.rect.x1 - m.rect.x0) * k, 12)}
                    height={Math.max((m.rect.z1 - m.rect.z0) * k, 10)}
                    rx={3}
                    className="mm-room"
                  />
                  <text x={px} y={Math.min(sz(m.rect.z0), py - 5) - 3} textAnchor="middle">
                    {m.short}
                  </text>
                </>
              ) : (
                <>
                  <circle cx={px} cy={py} r={9} className="mm-hit" />
                  <rect x={px - 4} y={py - 2.5} width={8} height={5} rx={2.5} className="mm-boat" />
                </>
              )}
            </g>
          )
        })}
        <g transform={`translate(${x} ${y}) rotate(${deg})`} className="mm-walker">
          <path d="M0 0 L-14 -26 A30 30 0 0 1 14 -26 Z" className="mm-cone" />
          <circle r={4} className="mm-me" />
        </g>
      </svg>
      <div className="mm-tools">
        <button onClick={() => zoomBy(1 / 1.4)} title="Zoom in (or wheel on the map)">
          +
        </button>
        <button onClick={() => zoomBy(1.4)} title="Zoom out (or wheel on the map)">
          −
        </button>
        <button onClick={() => setBig(!big)} title={big ? 'Smaller map' : 'Bigger map'}>
          {big ? '⤡' : '⤢'}
        </button>
        {marks[0]?.kind === 'ccr' && (
          <button className="mm-ccr-btn" onClick={() => marks[0].go()} title="Go straight into the Central Control Room">
            CCR
          </button>
        )}
      </div>
      {!follow && (
        <button className="mm-recentre" onClick={recentre} title="Follow the walker again">
          ⌖ Recentre
        </button>
      )}
      <div className="muted small mm-foot">{hover ?? `N ↑ · ${lv.label} · drag to pan · wheel to zoom · click to go`}</div>
    </div>
  )
}

interface Hit {
  tag: string
  label: string
  kind: 'equipment' | 'valve' | 'instrument'
  hay: string
  norm: string
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** "Go to…": type a tag or a name, pick a result, and you are walked to it (into it, for a control room). */
function GoTo() {
  const plant = usePlant()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const index = useMemo<Hit[]>(
    () => [
      ...plant.equipment
        .filter((e) => e.kind !== 'proxy')
        .map((e) => ({ tag: e.tag, label: e.name, kind: 'equipment' as const, hay: `${e.tag} ${e.name}`.toLowerCase(), norm: norm(e.tag) })),
      ...plant.valves.map((v) => ({ tag: v.tag, label: `${v.type} valve · ${v.line}`, kind: 'valve' as const, hay: `${v.tag} ${v.type} valve ${v.line}`.toLowerCase(), norm: norm(v.tag) })),
      ...plant.instruments.map((i) => {
        const on = 'equipment' in i.on ? i.on.equipment : i.on.line
        return { tag: i.tag, label: `${i.type} · on ${on}`, kind: 'instrument' as const, hay: `${i.tag} ${i.type} ${on}`.toLowerCase(), norm: norm(i.tag) }
      }),
    ],
    [plant],
  )
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    const n = norm(t)
    const words = t.split(/\s+/).filter(Boolean)
    const rank = { equipment: 0, valve: 1, instrument: 2 }
    const scored: { h: Hit; s: number }[] = []
    for (const h of index) {
      let s = 0
      if (n && h.norm === n) s = 100
      else if (n && h.norm.startsWith(n)) s = 80
      else if (n && h.norm.includes(n)) s = 60
      else if (words.every((w) => h.hay.includes(w))) s = 40
      else if (n.length >= 3) {
        // loose: the typed characters appear in order in the tag
        let j = 0
        for (const c of h.norm) if (c === n[j]) j++
        if (j === n.length) s = 15
      }
      if (s) scored.push({ h, s })
    }
    scored.sort((a, b) => b.s - a.s || rank[a.h.kind] - rank[b.h.kind] || a.h.tag.length - b.h.tag.length || a.h.tag.localeCompare(b.h.tag))
    return scored.slice(0, 8).map((x) => x.h)
  }, [q, index])
  const pick = (h: Hit | undefined) => {
    if (!h) return
    goToTag(h.tag)
    setQ('')
    setOpen(false)
    input.current?.blur() // hand the keyboard back to the walker
  }
  return (
    <div className="mm-goto">
      <input
        ref={input}
        value={q}
        placeholder="Go to… tag or name (e.g. K-2200, CCR)"
        spellCheck={false}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          // typing here must not walk, turn, switch decks or exit walk mode
          e.stopPropagation()
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(results.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(results[active] ?? results[0])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setQ('')
            setOpen(false)
            input.current?.blur()
          }
        }}
      />
      {open && results.length > 0 && (
        <ul className="mm-results" role="listbox">
          {results.map((h, i) => (
            <li
              key={`${h.kind}:${h.tag}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'on' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault() // keep focus until the pick
                pick(h)
              }}
            >
              <span className="mono">{h.tag}</span>
              <span className="dim">{h.label}</span>
              <span className={`mm-kind ${h.kind}`}>{h.kind === 'equipment' ? 'eq' : h.kind === 'valve' ? 'valve' : 'inst'}</span>
            </li>
          ))}
        </ul>
      )}
      {open && q.trim() && results.length === 0 && <div className="mm-results empty small muted">No match</div>}
    </div>
  )
}

/** the control room (module with a controlRoom interior) the walker is standing in, if any */
function controlRoomAt(plant: Plant): Module | null {
  const levels = walkLevels(plant)
  const lv = levels[walkPose.level]
  if (!lv || Math.abs(walkPose.floor - lv.y) > 0.5) return null // on a stair or ladder, not on the floor
  for (const e of plant.equipment) {
    if (e.kind !== 'module' || e.interior !== 'controlRoom' || levelAt(levels, e.position[1]) !== walkPose.level) continue
    // plan → module-local (inverse of the module's quarter-turn rotation)
    const c = Math.cos(e.rotationY)
    const s = Math.sin(e.rotationY)
    const dx = walkPose.x - e.position[0]
    const dz = walkPose.z - e.position[2]
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    if (Math.abs(lx) < e.size[0] / 2 - 0.2 && Math.abs(lz) < e.size[2] / 2 - 0.2) return e
  }
  return null
}

/** inside the CCR (B-9300) or the WHP-N local control room (B-N295): "Sit at the console — Enter" opens the HMI */
function ConsolePrompt() {
  const plant = usePlant()
  const hmi = useStore((s) => s.hmi)
  const [room, setRoom] = useState<Module | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      const r = walkAuto.active ? null : controlRoomAt(plant)
      setRoom((cur) => (cur?.tag === r?.tag ? cur : r))
    }, 250)
    return () => clearInterval(id)
  }, [plant])
  useEffect(() => {
    if (!room || hmi) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      e.preventDefault() // focus may still be on a toolbar button: Enter must not click it
      useStore.getState().setHmi('dashboard')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [room, hmi])
  if (!room || hmi) return null
  return (
    <div className="console-prompt" data-console-prompt={room.tag}>
      <span>
        {room.name} — <b>sit at the console</b>
      </span>
      <kbd>Enter</kbd>
      <button onClick={() => useStore.getState().setHmi('dashboard')}>Open console</button>
    </div>
  )
}

/** hazardous-area zone the walker stands in (chest height) and what it requires — plan 14 (4 Hz poll, no per-frame state) */
function HazardZoneChip() {
  const plant = usePlant()
  const [here, setHere] = useState<{ zone: HazZone; tag: string; reason: string } | null>(null)
  useEffect(() => {
    const id = window.setInterval(() => {
      const h = personZone(walkPose.x, walkPose.floor, walkPose.z, plant)
      const next = h ? { zone: h.zone, tag: h.volume.tag, reason: h.volume.reason } : null
      setHere((cur) => (cur?.zone === next?.zone && cur?.tag === next?.tag ? cur : next))
    }, 250)
    return () => clearInterval(id)
  }, [plant])
  const rule = ZONE_RULES.find((r) => r.zone === (here ? here.zone : 'safe'))!
  const c = here ? HAZ_COLOR[here.zone] : null
  const needs = rule.ppe.length ? rule.ppe.map((k) => PPE_LABEL[k]).join(' · ') : 'site minimum PPE'
  return (
    <div
      className="hz-walk-chip"
      data-hz-zone={here ? here.zone : 'safe'}
      title={here ? `${here.reason} — ${rule.entry}. ${rule.also.join('. ')}` : 'Unclassified (safe) area'}
      style={{
        position: 'absolute',
        zIndex: 11,
        left: '50%',
        top: 132, // under the toolbar, the value strip and the alarm banner
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px 4px 4px',
        borderRadius: 7,
        background: 'rgba(16,19,23,0.82)',
        border: `1px solid ${c ?? 'rgba(255,255,255,0.18)'}`,
        color: '#e8eaec',
        font: '12px/1.3 system-ui, sans-serif',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
    >
      <b style={{ padding: '1px 7px', borderRadius: 4, background: c ?? 'transparent', color: c ? '#111' : '#cfd3d6', border: c ? 'none' : '1px solid rgba(255,255,255,0.3)', fontSize: 11.5 }}>{here ? `ZONE ${here.zone}` : 'SAFE AREA'}</b>
      <span>
        {here ? (
          <>
            <span className="mono">{here.tag}</span> · {here.zone === 0 ? <b style={{ color: '#ff8a80' }}>no entry without a confined-space permit</b> : needs}
          </>
        ) : (
          'unclassified · site minimum PPE'
        )}
      </span>
    </div>
  )
}
