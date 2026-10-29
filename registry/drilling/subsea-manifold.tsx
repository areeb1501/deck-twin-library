// Subsea production manifold (API 17P / 17D): dual headers, valved well-slot branches with ROV buckets, vertical jumper hubs, overtrawlable protection structure, mudmat.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { grating, member, pipeRun, tagPlate, weldCap } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, pipeID, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { anode, grabBar, hub, mudmat, subseaBall } from './_drill'

export interface SubseaManifoldProps {
  /** well slots (split over both long sides) */
  slots?: number
  /** slot branch size, inches */
  slotNps?: number
  /** header size, inches */
  headerNps?: number
  rating?: Rating
  tag?: string
}

export const defaults = { slots: 4, slotNps: 6, headerNps: 10, rating: 1500 as Rating, tag: 'PM-01' }

type P = typeof defaults

const HUB_LEN = 0.45

function layout(p: Omit<P, 'tag'>) {
  const n = Math.max(2, Math.min(8, Math.round(p.slots)))
  const perSide = Math.ceil(n / 2)
  const pitch = 2.2
  const Lm = Math.max(6.5, perSide * pitch + 3.2)
  const zH = 2.0
  const Wm = 2 * (zH + 1.5)
  const yHd = 1.0
  const zHd = 0.55
  const Lv = faceToFace('ball-full', p.slotNps, p.rating)
  const yB = yHd + pipeOD(p.headerNps) / 2 + Lv + 0.45
  const yHub = yB + 0.75
  const xOut = Lm / 2 - 1.1
  const x0 = -Lm / 2 + 0.9
  const slotsAt = Array.from({ length: n }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1
    const j = Math.floor(i / 2)
    const x = x0 + 0.7 + j * pitch + (side > 0 ? 0.3 : 0)
    return { x, side, face: [x, yHub + HUB_LEN, side * zH] as V3 }
  })
  const outlets = [
    { id: 'header-a', z: -zHd, face: [xOut, yHd + 0.9 + HUB_LEN, -zHd] as V3 },
    { id: 'header-b', z: zHd, face: [xOut, yHd + 0.9 + HUB_LEN, zHd] as V3 },
  ]
  return { n, Lm, Wm, yHd, zHd, Lv, yB, zH, yHub, xOut, x0, slotsAt, outlets, yRoof: yHub + HUB_LEN + 0.55 }
}

export function ports(props: SubseaManifoldProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    ...l.slotsAt.map((s, i) => port(`slot-${i + 1}`, `Well slot ${i + 1} hub`, s.face, [0, 1, 0], p.slotNps)),
    ...l.outlets.map((o) => port(o.id, o.id === 'header-a' ? 'Production header hub' : 'Test / second header hub', o.face, [0, 1, 0], p.headerNps)),
  ]
}

export function SubseaManifold({ slots = defaults.slots, slotNps = defaults.slotNps, headerNps = defaults.headerNps, rating = defaults.rating, tag = defaults.tag, ...group }: SubseaManifoldProps & GroupProps) {
  const data = useKit((k) => build(k, { slots, slotNps, headerNps, rating, tag }), [slots, slotNps, headerNps, rating, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SubseaManifold

function build(k: Kit, p: P) {
  const l = layout(p)
  const { Lm, Wm, yHd, zHd, Lv, yB, zH, yHub, xOut, x0, slotsAt, outlets, yRoof } = l
  const Y: MatKey = paint('#e3b512', { weather: 1 })
  const PIPE: MatKey = paint('#d9dcd8', { weather: 0.8 })
  const t = mudmat(k, Lm, Wm, { mat: Y, skirt: 0.4 })
  const hOD = pipeOD(p.headerNps)
  const sOD = pipeOD(p.slotNps)

  // headers on saddles, blind (weld-capped) at the -X end, rising to vertical outlet hubs at +X
  for (const o of outlets) {
    pipeRun(k, [[x0, yHd, o.z], [xOut, yHd, o.z], [xOut, yHd + 0.9, o.z]], p.headerNps, { mat: PIPE, schedule: '80' })
    weldCap(k, p.headerNps, [x0, yHd, o.z], '-x', PIPE)
    hub(k, [xOut, yHd + 0.9, o.z], 'y', pipeID(p.headerNps, '80') / 2, HUB_LEN, PIPE)
    for (let x = x0 + 0.5; x < xOut - 0.4; x += 1.6) {
      k.box(Y, [0.2, yHd - hOD / 2 - t, 0.3], [x, (yHd - hOD / 2 + t) / 2, o.z])
      k.lathe(Y, [[hOD / 2 + 0.01, -0.1], [hOD / 2 + 0.03, -0.1], [hOD / 2 + 0.03, 0.1], [hOD / 2 + 0.01, 0.1]], [x, yHd, o.z], 'x', 32, Math.PI / 2, Math.PI)
    }
    // header pressure / temperature transmitter
    k.cyl(PIPE, 0.05, 0.16, [xOut - 0.8, yHd + hOD / 2 + 0.08, o.z], 'y', 16)
    k.rbox('stainless', [0.14, 0.2, 0.14], 0.02, [xOut - 0.8, yHd + hOD / 2 + 0.26, o.z])
  }

  // slot branches: hub → drop → run across to both header drops; each drop has an ROV-operated ball valve
  const R = Math.max(0.12, (pipeID(p.slotNps, '80') / 2) * 2.4)
  for (const s of slotsAt) {
    const zs = s.side * zH
    pipeRun(k, [[s.x, yHub, zs], [s.x, yB, zs], [s.x, yB, -s.side * zHd], [s.x, yB - 0.2, -s.side * zHd]], p.slotNps, { mat: PIPE, schedule: '80' })
    // tee for the near-header drop
    k.cyl(PIPE, sOD * 0.62, sOD * 1.5, [s.x, yB, s.side * zHd], 'z', 24)
    k.cyl(PIPE, sOD * 0.6, 0.2, [s.x, yB - 0.1, s.side * zHd], 'y', 24)
    for (const z of [zHd, -zHd]) {
      const yv = yB - 0.2
      k.with(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0)).setPosition(s.x, yv, z), () => subseaBall(k, p.slotNps, p.rating, Lv, { mat: PIPE }))
      k.pipe(PIPE, [s.x, yv - Lv + 0.002, z], [s.x, yHd + hOD * 0.3, z], sOD, pipeWall(p.slotNps, '80'))
    }
    hub(k, [s.x, yHub, zs], 'y', pipeID(p.slotNps, '80') / 2, HUB_LEN, PIPE)
    // hub support, guide posts and soft-landing funnel for the jumper connector
    k.box(Y, [0.3, yB - sOD / 2 - t, 0.3], [s.x, (yB - sOD / 2 + t) / 2, zs])
    const Rf = R + 0.2
    const yf = yHub + HUB_LEN - 0.12
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      member(k, [s.x + Math.cos(a) * Rf, t, zs + Math.sin(a) * Rf], [s.x + Math.cos(a) * Rf, yf, zs + Math.sin(a) * Rf], 'CHS 60.3x5', Y)
    }
    k.lathe(Y, [[Rf - 0.02, yf], [Rf, yf], [Rf + 0.3, yf + 0.25], [Rf + 0.28, yf + 0.25], [Rf - 0.02, yf]], [s.x, 0, zs], 'y', 36)
  }

  // protection structure: corner and intermediate columns, roof beams, sloped overtrawlable members, roof grating over the valves
  const fx = Lm / 2 - 0.15
  const fz = Wm / 2 - 0.15
  const rx = fx - 0.6
  const rz = zH + 0.75
  const cols: number[] = []
  for (let x = -rx; x <= rx + 1e-6; x += (2 * rx) / Math.max(2, Math.round((2 * rx) / 2.4))) cols.push(x)
  for (const x of cols)
    for (const sz of [-1, 1]) {
      member(k, [x, t, sz * rz], [x, yRoof, sz * rz], 'CHS 219.1x10', Y)
      member(k, [x * (fx / rx), t + 0.05, sz * fz], [x, yRoof, sz * rz], 'CHS 168.3x8', Y)
    }
  for (const sx of [-1, 1]) {
    member(k, [sx * fx, t + 0.05, 0], [sx * rx, yRoof, 0], 'CHS 168.3x8', Y)
    member(k, [sx * rx, yRoof, -rz], [sx * rx, yRoof, rz], 'CHS 219.1x10', Y)
  }
  for (const sz of [-1, 1]) member(k, [-rx, yRoof, sz * rz], [rx, yRoof, sz * rz], 'CHS 219.1x10', Y)
  for (const x of cols.slice(1, -1)) member(k, [x, yRoof, -rz], [x, yRoof, rz], 'HEA 200', Y)
  // roof grating over the header / valve zone, open strips over the slot hubs for jumper landing
  const zIn = zH - 0.75
  for (let i = 0; i < cols.length - 2; i++) {
    const xa = cols[i]
    const xb = cols[i + 1]
    grating(k, [(xa + xb) / 2, yRoof + 0.13, 0], xb - xa - 0.12, 2 * zIn)
    for (const sz of [-1, 1]) member(k, [xa, yRoof + 0.06, sz * zIn], [xb, yRoof + 0.06, sz * zIn], 'HEA 120', Y)
  }
  for (const sz of [-1, 1]) grabBar(k, [-rx * 0.6, yRoof - 0.45, sz * rz], [rx * 0.6, yRoof - 0.45, sz * rz], [0, 0, sz])
  // lift points on the roof corners
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box(Y, [0.4, 0.28, 0.05], [sx * rx, yRoof + 0.24, sz * rz])
      k.torus('nut', 0.07, 0.016, [sx * rx, yRoof + 0.3, sz * rz], 'z', 6, 16)
    }
  for (const x of cols) for (const sz of [-1, 1]) anode(k, [x, t + 0.7, sz * (rz + 0.17)], 'y', 0.6)
  k.box(Y, [1.4, 0.45, 0.03], [0, yRoof - 0.9, rz + 0.13])
  tagPlate(k, p.tag, [0, yRoof - 0.9, rz + 0.147], 'z', 1.2)
}
