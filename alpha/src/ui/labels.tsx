/**
 * Equipment tag chips as a plain DOM overlay (outside the WebGL canvas). A projector inside the
 * canvas positions them; they fade with distance and hide when behind the camera. Avoids per-label
 * React roots.
 *
 * Decluttered in screen space: chips are placed greedily by priority (selected, hovered, then big
 * equipment first, nearer first) and a chip whose rectangle would overlap one already placed is faded
 * out (grid-bucket test). Seen from far away a platform collapses to its big items. Cheap: nothing
 * runs while the camera and the state are still; while moving, chips follow every frame but the
 * declutter re-runs at most every 100 ms, and the DOM is only written when a value changes.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Equipment } from '../model/types'
import { useStore } from '../state/store'
import { usePlant } from '../state/plantStore'
import { footprints } from '../model/footprint'
import { isRunning, runState, useSim } from '../state/sim'

const els = new Map<string, HTMLButtonElement>()

export function labelHeight(e: Equipment) {
  switch (e.kind) {
    case 'horizontalVessel':
      return e.position[1] + e.id / 2 + 1.1
    case 'verticalVessel':
      return e.elevation + e.tt + e.id / 2 + 1.6
    case 'module':
      return e.size[1] + 1.2
    case 'compressorPackage':
      return 4.6
    case 'gasTurbineGenerator':
      return e.position[1] + e.enclosureHeight + e.stackHeight + 1.2
    case 'caissonPump':
      return e.position[1] + (e.driver === 'diesel' ? 3.2 : 4.2)
    case 'transformer':
      return e.position[1] + e.size[1] + 1.6
    case 'proxy':
      return e.position[1] + e.size[1] + 1
    case 'xmasTree':
      return e.position[1] + e.wellheadHeight + 2.6
    case 'shellTube':
      return e.position[1] + 1.4
    default:
      return 2.4
  }
}

/** DOM side — render in the app shell */
const RUNS = new Set(['pumpPackage', 'compressorPackage', 'gasTurbineGenerator', 'caissonPump', 'chemSkid', 'proxy'])
const chipState = (tag: string) => {
  const st = runState(tag)
  return st === 'running' ? (isRunning(tag) ? 'run' : 'stop') : st === 'standby' || st === 'starting' ? 'stby' : st === 'tripped' ? 'trip' : 'stop'
}

export function LabelOverlay() {
  const plant = usePlant()
  const selected = useStore((s) => s.selected?.tag)
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.requestFocus)
  // perf: re-render only when a run-state dot actually changes (not on every simulation tick)
  useSim(() => {
    let k = ''
    for (const e of plant.equipment) if (RUNS.has(e.kind)) k += chipState(e.tag)[0]
    return k
  })
  return (
    <div className="label-layer">
      {plant.equipment.map((e) => (
        <button
          key={e.tag}
          ref={(el) => {
            if (el) {
              els.set(e.tag, el)
              el.style.transition = 'opacity .2s ease, background .12s'
            } else {
              els.delete(e.tag)
              chips.delete(e.tag)
            }
          }}
          className={`tag-chip${selected === e.tag ? ' is-active' : ''}`}
          style={{ visibility: 'hidden' }}
          onClick={() => {
            select({ tag: e.tag, kind: 'equipment' })
            focus(e.tag)
          }}
        >
          {RUNS.has(e.kind) && !(e.kind === 'proxy' && (e.role === 'bop' || e.role === 'custom')) && <span className={`chip-dot ${chipState(e.tag)}`} />}
          {e.tag}
        </button>
      ))}
    </div>
  )
}

/** what is currently written to each chip's style (DOM writes only on change) */
interface Chip {
  vis: boolean
  op: string
  tx: string
  pe: boolean
  /** placed by the declutter (false: fading out / hidden) */
  on: boolean
  /** when a faded-out chip may go to visibility: hidden */
  hideAt: number
  w: number
  h: number
}
const chips = new Map<string, Chip>()
function chipOf(tag: string): Chip {
  let c = chips.get(tag)
  if (!c) chips.set(tag, (c = { vis: false, op: '', tx: '', pe: true, on: false, hideAt: 0, w: 0, h: 0 }))
  return c
}
function setVis(el: HTMLElement, c: Chip, v: boolean) {
  if (c.vis !== v) {
    c.vis = v
    el.style.visibility = v ? 'visible' : 'hidden'
  }
}
function setOp(el: HTMLElement, c: Chip, o: string) {
  if (c.op !== o) {
    c.op = o
    el.style.opacity = o
  }
}
function setPe(el: HTMLElement, c: Chip, on: boolean) {
  if (c.pe !== on) {
    c.pe = on
    el.style.pointerEvents = on ? 'auto' : 'none'
  }
}

const FADE_MS = 220
/** cameras farther than this from an item only label big equipment (m, and plan area m²) */
const FAR = 140
const BIG_AREA = 30
const CELL = 96
const PAD = 3

/** Canvas side — projects label anchors and declutters them */
export function LabelProjector({ equipment, worldY }: { equipment: Equipment[]; worldY: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const visible = useStore((s) => s.layers.labels)
  const selected = useStore((s) => s.selected?.tag)
  const hovered = useStore((s) => s.hovered?.tag)
  const ceiling = useStore((s) => s.layers.ceiling)
  const section = useStore((s) => s.section)
  const plant = usePlant()
  // floor each item stands on: hide labels of things that are cut away (section box) or lifted off (weather deck hidden)
  const pts = useMemo(() => {
    const levels = plant.deck.walk ?? []
    const floorOf = (y: number) => levels.reduce((f, l) => (l.y <= y + 0.5 && l.y > f ? l.y : f), -Infinity)
    const fp = footprints(equipment, 0)
    return equipment.map((e, i) => ({
      tag: e.tag,
      floor: floorOf(e.position[1]),
      x: e.position[0],
      z: e.position[2],
      area: fp[i] ? (fp[i].x1 - fp[i].x0) * (fp[i].z1 - fp[i].z0) : 0,
      p: new THREE.Vector3(e.position[0], labelHeight(e) + worldY, e.position[2]),
      // per-frame scratch
      sx: 0,
      sy: 0,
      d: 0,
      o: 0,
      rank: 0,
    }))
  }, [equipment, worldY, plant])
  const v = useMemo(() => new THREE.Vector3(), [])
  const centre = useMemo(() => new THREE.Vector3(0, worldY, 0), [worldY])
  const last = useRef({ pos: new THREE.Vector3(NaN, 0, 0), q: new THREE.Quaternion(), fov: 0, w: 0, h: 0, key: '', declutterAt: 0, fading: false })

  useFrame(() => {
    const L = last.current
    const cam = camera as THREE.PerspectiveCamera
    const now = performance.now()
    const moved = !L.pos.equals(cam.position) || !L.q.equals(cam.quaternion) || L.fov !== cam.fov || L.w !== size.width || L.h !== size.height
    const key = `${visible}|${selected}|${hovered}|${ceiling}|${section.enabled}|${section.min}|${section.max}|${pts.length}|${els.size}`
    const stateChanged = key !== L.key
    if (!moved && !stateChanged && !L.fading) return
    L.pos.copy(cam.position)
    L.q.copy(cam.quaternion)
    L.fov = cam.fov
    L.w = size.width
    L.h = size.height
    L.key = key
    const redo = stateChanged || !moved || now - L.declutterAt >= 100
    const far = camera.position.distanceTo(centre) > 70

    // 1. project everything that may show
    const cands: (typeof pts)[number][] = []
    for (const pt of pts) {
      const el = els.get(pt.tag)
      if (!el) continue
      const c = chipOf(pt.tag)
      const cut =
        (!ceiling && pt.floor >= 9.5) ||
        (section.enabled && (pt.floor > section.max[1] || pt.x < section.min[0] || pt.x > section.max[0] || pt.z < section.min[2] || pt.z > section.max[2]))
      v.copy(pt.p).project(camera)
      const active = pt.tag === selected
      pt.sx = ((v.x + 1) / 2) * size.width
      pt.sy = ((1 - v.y) / 2) * size.height
      pt.d = camera.position.distanceTo(pt.p)
      pt.o = active ? 1 : far ? 1 : THREE.MathUtils.clamp(1 - (pt.d - 18) / 12, 0, 1)
      const onScreen = v.z <= 1 && pt.sx > -60 && pt.sx < size.width + 60 && pt.sy > -30 && pt.sy < size.height + 30
      if (cut || !visible || !onScreen || pt.o <= 0.02) {
        // gone at once (cut away, behind, off screen, too far in close-up mode)
        c.on = false
        setVis(el, c, false)
        continue
      }
      cands.push(pt)
    }

    // 2. declutter: greedy placement by priority, overlap test on a coarse screen grid
    if (redo) {
      L.declutterAt = now
      const need = cands.filter((pt) => !chipOf(pt.tag).w)
      if (need.length) {
        // one layout pass for all chips not measured yet
        for (const pt of need) {
          const el = els.get(pt.tag)!
          const c = chipOf(pt.tag)
          c.w = el.offsetWidth || 60
          c.h = el.offsetHeight || 20
        }
      }
      for (const pt of cands) pt.rank = pt.tag === selected ? 3e9 : pt.tag === hovered ? 2e9 : pt.area * 1000 - pt.d
      cands.sort((a, b) => b.rank - a.rank)
      const grid = new Map<number, number[]>()
      const rects: number[] = []
      for (const pt of cands) {
        const c = chipOf(pt.tag)
        const special = pt.rank >= 2e9
        let place = special || !(pt.d > FAR && pt.area < BIG_AREA)
        const x0 = pt.sx - c.w / 2 - PAD
        const y0 = pt.sy - c.h / 2 - PAD
        const x1 = x0 + c.w + PAD * 2
        const y1 = y0 + c.h + PAD * 2
        const gx0 = Math.floor(x0 / CELL)
        const gx1 = Math.floor(x1 / CELL)
        const gy0 = Math.floor(y0 / CELL)
        const gy1 = Math.floor(y1 / CELL)
        if (place && !special) {
          for (let gx = gx0; gx <= gx1 && place; gx++)
            for (let gy = gy0; gy <= gy1 && place; gy++) {
              const list = grid.get(gx * 4096 + gy)
              if (!list) continue
              for (const r of list)
                if (x0 < rects[r + 2] && x1 > rects[r] && y0 < rects[r + 3] && y1 > rects[r + 1]) {
                  place = false
                  break
                }
            }
        }
        c.on = place
        if (!place) continue
        const r = rects.length
        rects.push(x0, y0, x1, y1)
        for (let gx = gx0; gx <= gx1; gx++)
          for (let gy = gy0; gy <= gy1; gy++) {
            const k = gx * 4096 + gy
            const list = grid.get(k)
            if (list) list.push(r)
            else grid.set(k, [r])
          }
      }
    }

    // 3. write: placed chips follow the camera; the others fade out, then hide
    let fading = false
    for (const pt of cands) {
      const el = els.get(pt.tag)!
      const c = chipOf(pt.tag)
      if (c.on) {
        c.hideAt = 0
        const appear = !c.vis
        if (appear) {
          // appearing: shown transparent where it belongs this frame, faded in from the next one
          setOp(el, c, '0')
          setVis(el, c, true)
          fading = true
        }
        const tx = `translate(-50%, -50%) translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px)`
        if (c.tx !== tx) {
          c.tx = tx
          el.style.transform = tx
        }
        setPe(el, c, true)
        if (!appear) setOp(el, c, pt.o.toFixed(2))
      } else if (c.vis) {
        setPe(el, c, false)
        setOp(el, c, '0')
        if (!c.hideAt) c.hideAt = now + FADE_MS
        if (now >= c.hideAt) setVis(el, c, false)
        else fading = true
        // keep following the camera while it fades
        const tx = `translate(-50%, -50%) translate(${pt.sx.toFixed(1)}px, ${pt.sy.toFixed(1)}px)`
        if (c.tx !== tx) {
          c.tx = tx
          el.style.transform = tx
        }
      }
    }
    L.fading = fading
  })
  return null
}
