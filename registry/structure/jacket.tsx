// Fixed steel jacket (ISO 19902): battered tubular legs, X or K braced faces, horizontal frames, conductor guide framing, risers with clamps, boat landing, anodes and mudmats.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { pipeOD, type Rating } from '../lib/standards'
import { ladderFlight } from './_access'
import { gratingBay, railRun } from './_steel'

export interface JacketProps {
  /** 4, 6 or 8 legs (2 rows along X) */
  legs?: number
  /** mean sea level to seabed, m */
  waterDepth?: number
  /** jacket top (y = 0) above mean sea level, m */
  airGap?: number
  /** leg centre spacing at the top, m */
  spanX?: number
  spanZ?: number
  /** leg batter, 1 horizontal in n vertical */
  batter?: number
  legDiameter?: number
  bracing?: 'X' | 'K'
  conductors?: number
  risers?: number
  riserNps?: number
  riserRating?: Rating
  boatLanding?: boolean
  anodes?: boolean
  seaLevelMarker?: boolean
}

export const defaults = {
  legs: 4,
  waterDepth: 60,
  airGap: 20,
  spanX: 16,
  spanZ: 12,
  batter: 10,
  legDiameter: 1.5,
  bracing: 'X' as 'X' | 'K',
  conductors: 6,
  risers: 2,
  riserNps: 12,
  riserRating: 600 as Rating,
  boatLanding: true,
  anodes: true,
  seaLevelMarker: true,
}

type P = typeof defaults

const RISER_OFF = 1.4

function geo(p: P) {
  const nx = Math.max(2, Math.round((p.legs || 4) / 2))
  const sx = p.spanX / 2
  const sz = p.spanZ / 2
  const b = Math.max(4, p.batter)
  const hx = (y: number) => sx + Math.max(0, -y) / b
  const hz = (y: number) => sz + Math.max(0, -y) / b
  const xTop = Array.from({ length: nx }, (_, i) => -1 + (2 * i) / (nx - 1))
  const leg = (i: number, j: number, y: number): V3 => [xTop[i] * hx(y), y, (j ? 1 : -1) * hz(y)]
  const ySea = -p.airGap
  const yBed = -(p.airGap + p.waterDepth)
  return { nx, hx, hz, leg, ySea, yBed }
}

function riserTops(p: P): V3[] {
  const n = Math.max(0, Math.round(p.risers))
  return Array.from({ length: n }, (_, i) => [p.spanX / 2 + RISER_OFF, 0, (i - (n - 1) / 2) * 1.6] as V3)
}

export function ports(props: JacketProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  return riserTops(p).map((t, i) => port(`riser-${i + 1}`, `Riser ${i + 1} top`, t, [0, 1, 0], p.riserNps, p.riserRating))
}

export function Jacket(props: JacketProps & GroupProps) {
  const { legs, waterDepth, airGap, spanX, spanZ, batter, legDiameter, bracing, conductors, risers, riserNps, riserRating, boatLanding, anodes, seaLevelMarker, ...group } = { ...defaults, ...props }
  const p: P = { legs, waterDepth, airGap, spanX, spanZ, batter, legDiameter, bracing, conductors, risers, riserNps, riserRating, boatLanding, anodes, seaLevelMarker }
  const data = useKit((k) => build(k, p), [legs, waterDepth, airGap, spanX, spanZ, batter, legDiameter, bracing, conductors, risers, riserNps, riserRating, boatLanding, anodes, seaLevelMarker])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Jacket

const v = (a: V3) => new THREE.Vector3(...a)
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

function build(k: Kit, p: P) {
  const { nx, hx, hz, leg, ySea, yBed } = geo(p)
  const above = paint('#d9a521', { roughness: 0.55, weather: 1.2 }) // typical jacket yellow
  const splash = paint('#6b5d3a', { roughness: 0.75, clearcoat: 0, weather: 1.5 })
  const growth = paint('#4d5446', { roughness: 0.92, clearcoat: 0, metalness: 0.05, weather: 1.6 })
  const anodeMat = paint('#a3a6a2', { metalness: 0.55, roughness: 0.7, clearcoat: 0 })
  const sTop = ySea + 4
  const sBot = ySea - 3
  const matAt = (y: number) => (y > sTop ? above : y > sBot ? splash : growth)
  const R = p.legDiameter / 2
  const rH = Math.max(0.2, p.legDiameter * 0.24) // horizontal frame members
  const rD = Math.max(0.18, p.legDiameter * 0.21) // face diagonals

  // tube a→b split at the splash-zone limits so each part carries the right finish
  const tube = (a: V3, b: V3, r: number, seg = 14, r2?: number, wall = 0) => {
    const cuts = [0, 1]
    for (const y of [sTop, sBot]) {
      const t = (y - a[1]) / (b[1] - a[1])
      if (t > 0 && t < 1) cuts.push(t)
    }
    cuts.sort((x, y) => x - y)
    for (let i = 0; i < cuts.length - 1; i++) {
      const pa = lerp(a, b, cuts[i])
      const pb = lerp(a, b, cuts[i + 1])
      const ra = r2 === undefined ? r : r + (r2 - r) * cuts[i]
      const rb = r2 === undefined ? r : r + (r2 - r) * cuts[i + 1]
      if (wall > 0) k.pipe(matAt((pa[1] + pb[1]) / 2), pa, pb, 2 * ra, wall, seg)
      else k.rod(matAt((pa[1] + pb[1]) / 2), pa, pb, ra, seg, rb)
    }
  }
  // brace with oversized stubs at both ends (welded tubular joints)
  const brace = (a: V3, b: V3, r: number, ra = R, rb = R) => {
    const L = v(b).distanceTo(v(a))
    const d = v(b).sub(v(a)).normalize()
    const pa = v(a).addScaledVector(d, ra * 0.9)
    const pb = v(b).addScaledVector(d, -rb * 0.9)
    tube(pa.toArray() as V3, pb.toArray() as V3, r, 14)
    const s = Math.min(1.4, L * 0.15)
    for (const [q, dir] of [[pa, 1], [pb, -1]] as const) {
      const e = q.clone().addScaledVector(d, dir * s)
      tube(q.toArray() as V3, e.toArray() as V3, r + 0.035, 14)
      tube(e.toArray() as V3, e.clone().addScaledVector(d, dir * 0.2).toArray() as V3, r + 0.035, 14, r + 0.002)
    }
  }

  // ---- elevations: top frame, splash frame, underwater frames with bays growing with depth, mudline frame
  const levels = [-2]
  const splashFrame = ySea + Math.min(6, p.airGap * 0.4)
  if (splashFrame < -4.5) levels.push(splashFrame)
  const m = Math.max(2, Math.round(p.waterDepth / 22))
  const w = Array.from({ length: m }, (_, i) => 1.3 ** i)
  const tot = w.reduce((a, b) => a + b, 0)
  let acc = 0
  for (let i = 0; i < m; i++) {
    acc += w[i]
    levels.push(ySea - (p.waterDepth - 1.5) * (acc / tot))
  }

  // ---- legs with node cans, top caps, mudmats
  for (let i = 0; i < nx; i++)
    for (const j of [0, 1]) {
      const top = leg(i, j, 0)
      const bot = leg(i, j, yBed)
      tube(top, bot, R, 32, undefined, Math.max(0.04, p.legDiameter / 30))
      const d = v(bot).sub(v(top)).normalize()
      for (const y of levels) {
        const c = v(leg(i, j, y))
        const a = c.clone().addScaledVector(d, -1.2)
        const b = c.clone().addScaledVector(d, 1.2)
        tube(a.toArray() as V3, b.toArray() as V3, R + 0.05, 32)
        tube(a.clone().addScaledVector(d, -0.35).toArray() as V3, a.toArray() as V3, R + 0.003, 32, R + 0.05)
        tube(b.toArray() as V3, b.clone().addScaledVector(d, 0.35).toArray() as V3, R + 0.05, 32, R + 0.003)
      }
      k.pipe(above, [top[0], -0.3, top[2]], [top[0], 0, top[2]], 2 * R + 0.12, 0.06 + Math.max(0.04, p.legDiameter / 30), 32)
      // mudmat: plate with edge stiffeners round the leg foot
      const s = p.legDiameter * 2.6
      k.box(growth, [s, 0.06, s], [bot[0], yBed + 0.03, bot[2]])
      for (const ax of [1, 0]) k.box(growth, ax ? [s, 0.5, 0.04] : [0.04, 0.5, s], [bot[0], yBed + 0.31, bot[2]])
      if (p.seaLevelMarker) k.torus('safetyYellow', R + 0.06, 0.06, leg(i, j, ySea), 'y', 8, 40)
      // barge bumper on corner legs: vertical fender tube on stand-off arms through the splash zone
      if (i === 0 || i === nx - 1) {
        const out = new THREE.Vector3(i === 0 ? -1 : 1, 0, j ? 1 : -1).normalize()
        const off = R + 1.1
        const at = (y: number): V3 => {
          const c = leg(i, j, y)
          return [c[0] + out.x * off, y, c[2] + out.z * off]
        }
        const b0 = sBot - 2.5
        const b1 = sTop + 1.5
        tube(at(b0), at(b1), 0.3, 18)
        tube(at(b0 - 0.6), at(b0), 0.06, 18, 0.3)
        tube(at(b1), at(b1 + 0.6), 0.3, 18, 0.06)
        for (const y of [b0 + 0.4, ySea, b1 - 0.4]) brace(leg(i, j, y), at(y), 0.16, R, 0.3)
      }
    }

  // ---- faces: perimeter + interior transverse frames
  const faces: [[number, number], [number, number]][] = []
  for (let i = 0; i < nx - 1; i++) for (const j of [0, 1]) faces.push([[i, j], [i + 1, j]])
  for (let i = 0; i < nx; i++) faces.push([[i, 0], [i, 1]])
  for (const y of levels) for (const [A, B] of faces) brace(leg(A[0], A[1], y), leg(B[0], B[1], y), rH)
  for (let l = 0; l < levels.length - 1; l++) {
    const ya = levels[l]
    const yb = levels[l + 1]
    for (const [A, B] of faces) {
      const a0 = leg(A[0], A[1], ya)
      const b0 = leg(B[0], B[1], ya)
      const a1 = leg(A[0], A[1], yb)
      const b1 = leg(B[0], B[1], yb)
      if (p.bracing === 'K') {
        const mTop = lerp(a0, b0, 0.5)
        brace(a1, mTop, rD, R, rH)
        brace(b1, mTop, rD, R, rH)
      } else {
        brace(a0, b1, rD)
        brace(b0, a1, rD)
        const c = lerp(a0, b1, 0.5)
        const d = v(b1).sub(v(a0)).normalize()
        tube(v(c).addScaledVector(d, -1.0).toArray() as V3, v(c).addScaledVector(d, 1.0).toArray() as V3, rD + 0.04, 14)
      }
    }
  }

  // ---- plan framing: conductor guide frame tied to the legs, or plan X
  const nc = Math.max(0, Math.round(p.conductors))
  const rows = nc > 3 ? 2 : 1
  const cols = Math.ceil(nc / rows)
  const pitch = 2.3
  const cons: [number, number][] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols && cons.length < nc; c++) cons.push([(c - (cols - 1) / 2) * pitch, (r - (rows - 1) / 2) * pitch])
  const rcx = ((cols - 1) * pitch) / 2 + 1.15
  const rcz = ((rows - 1) * pitch) / 2 + 1.15
  const rP = rH * 0.8
  const rC = 0.762 / 2
  for (const y of levels) {
    if (nc) {
      const cn: V3[] = [[-rcx, y, -rcz], [rcx, y, -rcz], [rcx, y, rcz], [-rcx, y, rcz]]
      for (let i = 0; i < 4; i++) brace(cn[i], cn[(i + 1) % 4], rP * 0.8, 0.3, 0.3)
      for (let c = 1; c < cols; c++) {
        const x = (c - cols / 2) * pitch
        brace([x, y, -rcz], [x, y, rcz], rP * 0.6, 0.25, 0.25)
      }
      if (rows > 1) brace([-rcx, y, 0], [rcx, y, 0], rP * 0.6, 0.25, 0.25)
      const corners: [number, number][] = [[0, 0], [nx - 1, 0], [nx - 1, 1], [0, 1]]
      corners.forEach(([i, j], q) => brace(leg(i, j, y), cn[q], rP, R, 0.3))
      for (const [cx, cz] of cons) {
        k.cyl(matAt(y), rC + 0.06, 1.2, [cx, y, cz], 'y', 20)
        k.cyl(matAt(y), rC + 0.06, 0.35, [cx, y + 0.775, cz], 'y', 20, rC + 0.2, true)
      }
    } else {
      brace(leg(0, 0, y), leg(nx - 1, 1, y), rP)
      brace(leg(nx - 1, 0, y), leg(0, 1, y), rP)
    }
  }
  for (const [cx, cz] of cons) {
    tube([cx, 0, cz], [cx, yBed, cz], rC, 20, undefined, 0.025)
  }

  // ---- risers on the +X face: clamps at each frame, splash-zone sheath, bend onto the seabed
  const od = pipeOD(p.riserNps)
  const tops = riserTops(p)
  const rx = (y: number) => hx(y) + RISER_OFF
  for (const t of tops) {
    const z = t[2]
    const Rb = 5 * od
    const dir = v([1 / Math.max(4, p.batter), -1, 0]).normalize()
    const yEnd = yBed + Rb * (1 - Math.sin(Math.acos(-dir.y))) + od / 2 + 0.3
    const start: V3 = [rx(yEnd), yEnd, z]
    const L = flange(k, p.riserNps, p.riserRating, t, [0, 1, 0], true)
    k.pipe('pipePaint', [rx(-L), -L, z], [rx(Math.min(sTop, -L - 0.01)), Math.min(sTop, -L - 0.01), z], od)
    k.pipe('rubberBlack', [rx(sTop), sTop, z], [rx(sBot), sBot, z], od + 0.03)
    k.pipe(growth, [rx(sBot), sBot, z], start, od)
    const toward = v([1, 0, 0]).addScaledVector(dir, -dir.x).normalize()
    const ang = Math.acos(Math.min(1, dir.x === 0 ? 0 : v([1, 0, 0]).dot(dir))) // angle from dir to +X
    k.bend(growth, start, dir.toArray() as V3, toward.toArray() as V3, Rb, od, ang)
    const c = v(start).addScaledVector(toward, Rb)
    const end = c.clone().addScaledVector(toward, -Rb * Math.cos(ang)).addScaledVector(dir, Rb * Math.sin(ang))
    k.pipe(growth, end.toArray() as V3, [end.x + 12, end.y, end.z], od)
    for (const y of levels) {
      if (y < yEnd) continue
      const cx = rx(y)
      k.cyl(matAt(y), od / 2 + 0.05, 0.4, [cx, y, z], [1 / Math.max(4, p.batter), -1, 0], 20)
      tube([hx(y), y, z], [cx - od / 2 - 0.05, y, z], 0.14, 10)
    }
  }

  // ---- boat landing on the +Z face at sea level
  if (p.boatLanding) {
    const zf = (y: number) => hz(y)
    const zB = zf(ySea) + 2.2
    const yb0 = ySea - 4
    const yb1 = ySea + 4
    for (const x of [-1.6, 1.6]) {
      tube([x, yb0, zB], [x, yb1, zB], 0.32, 20)
      tube([x, yb0 - 0.6, zB], [x, yb0, zB], 0.08, 20, 0.32)
      for (const y of [ySea - 2.5, ySea + 2.6]) {
        const xi = x < 0 ? 0 : nx - 1
        brace([x, y, zB], leg(xi, 1, y), 0.17, 0.32, R)
        tube([x, y, zB], [x, y, zf(y)], 0.15, 12)
      }
    }
    const yL = ySea + 3.2
    gratingBay(k, -1.9, zf(yL) + 0.2, 1.9, zB + 0.45, yL, 'z')
    for (const s of [-1, 1]) k.rod(above, [s * 1.9, yL - 0.12, zf(yL) + 0.2], [s * 1.9, yL - 0.12, zB + 0.45], 0.06, 10)
    railRun(k, [-1.85, yL, zf(yL) + 0.25], [-1.85, yL, zB + 0.4])
    railRun(k, [1.85, yL, zf(yL) + 0.25], [1.85, yL, zB + 0.4])
    ladderFlight(k, 0, ySea - 2.5, yL, zB + 0.3, { cage: false, standoff: 0.15, extend: 1.1 })
  }

  // ---- stand-off anodes on the legs and underwater frames
  if (p.anodes) {
    const anode = (c: THREE.Vector3, along: THREE.Vector3, out: THREE.Vector3, rr: number) => {
      const p0 = c.clone().addScaledVector(out, rr + 0.28)
      k.rod(anodeMat, p0.clone().addScaledVector(along, -0.8).toArray() as V3, p0.clone().addScaledVector(along, 0.8).toArray() as V3, 0.12, 6)
      for (const s of [-0.75, 0.75]) k.rod('structSteelDark', c.clone().addScaledVector(along, s).addScaledVector(out, rr * 0.9).toArray() as V3, p0.clone().addScaledVector(along, s).toArray() as V3, 0.025, 6)
    }
    for (let i = 0; i < nx; i++)
      for (const j of [0, 1]) {
        const top = v(leg(i, j, 0))
        const d = v(leg(i, j, yBed)).sub(top).normalize()
        const out = new THREE.Vector3(Math.sign(leg(i, j, 0)[0]) || 0.0001, 0, j ? 1 : -1).normalize()
        for (let y = sBot - 3; y > yBed + 3; y -= 9) {
          const c = v(leg(i, j, y))
          anode(c, d, out, R)
        }
      }
    for (const y of levels.filter((yy) => yy < sBot))
      for (const [A, B] of faces) {
        const a = v(leg(A[0], A[1], y))
        const b = v(leg(B[0], B[1], y))
        const along = b.clone().sub(a).normalize()
        for (const t of [0.33, 0.67]) anode(a.clone().lerp(b, t), along, new THREE.Vector3(0, 1, 0), rH)
      }
  }
}
