// Shared vessel geometry: smooth 2:1 shells, conforming pads, skirts, legs, ring platforms, caged ladders, davits, bridles, nameplates.
import * as THREE from 'three'
import { Kit, mat4, type MatKey, type Profile, type V3 } from '../lib/kit'
import { flange, gasket, ladder, member, nozzle, pipeRun, tagPlate } from '../lib/parts'
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js'
import { gratingMaterial, levelFlagMaterial } from '../lib/textures'
import { ACCESS, NPS_SIZES, elbow90, flange as flangeDims, pipeOD, pipeWall, psv as psvDims, type Orifice, type Rating } from '../lib/standards'

export const TAU = Math.PI * 2
export const deg = (d: number) => (d * Math.PI) / 180
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
/** Azimuth a (rad) measured from +X towards -Z, seen from above. Front (+Z) is -90°. */
export const dirOf = (a: number): V3 => [Math.cos(a), 0, -Math.sin(a)]
export const at = (a: number, r: number, y: number): V3 => [Math.cos(a) * r, y, -Math.sin(a) * r]
/** Kit lathe phi for azimuth a (lathe puts phi = 0 on +Z). */
export const phiOf = (a: number) => a + Math.PI / 2
export const add = (p: V3, d: V3, s = 1): V3 => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s]
const V = (p: V3) => new THREE.Vector3(...p)

// ------------------------------------------------------------------ smooth lathe

/** Lathe about +Y with normals smoothed across joints shallower than `crease` degrees (curved heads without banding). */
export function smoothLathe(profile: Profile, seg = 48, phiStart = 0, phiLength = TAU, crease = 30): THREE.BufferGeometry {
  type S = { r0: number; y0: number; r1: number; y1: number; nr: number; ny: number; l: number }
  const segs: S[] = []
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]
    const [r1, y1] = profile[i + 1]
    const l = Math.hypot(r1 - r0, y1 - y0)
    if (l > 1e-7) segs.push({ r0, y0, r1, y1, nr: (y1 - y0) / l, ny: -(r1 - r0) / l, l })
  }
  const cosC = Math.cos((crease * Math.PI) / 180)
  const smooth = (a?: S, b?: S): [number, number] | null => {
    if (!a || !b || Math.abs(a.r1 - b.r0) > 1e-6 || Math.abs(a.y1 - b.y0) > 1e-6 || a.nr * b.nr + a.ny * b.ny < cosC) return null
    const l = Math.hypot(a.nr + b.nr, a.ny + b.ny) || 1
    return [(a.nr + b.nr) / l, (a.ny + b.ny) / l]
  }
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let vb = 0
  let vAcc = 0
  segs.forEach((s, i) => {
    const nS = smooth(segs[i - 1], s) ?? [s.nr, s.ny]
    const nE = smooth(s, segs[i + 1]) ?? [s.nr, s.ny]
    for (let k = 0; k <= seg; k++) {
      const phi = phiStart + (k / seg) * phiLength
      const sn = Math.sin(phi)
      const cs = Math.cos(phi)
      pos.push(s.r0 * sn, s.y0, s.r0 * cs, s.r1 * sn, s.y1, s.r1 * cs)
      nor.push(nS[0] * sn, nS[1], nS[0] * cs, nE[0] * sn, nE[1], nE[0] * cs)
      uv.push(k / seg, vAcc, k / seg, vAcc + s.l)
    }
    for (let k = 0; k < seg; k++) {
      const a = vb + k * 2
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
    vb += (seg + 1) * 2
    vAcc += s.l
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/** 2:1 vessel outline (r, y) from the bottom pole to the top pole; b = 0 gives flat ends. */
export function vesselProfile(a: number, b: number, y0: number, y1: number, n = 28, bottom = true, top = true): Profile {
  const p: Profile = []
  if (bottom) for (let i = 0; i <= n; i++) {
    const t = (Math.PI / 2) * (1 - i / n)
    p.push([a * Math.cos(t), y0 - b * Math.sin(t)])
  }
  else p.push([0, y0], [a, y0])
  if (top) for (let i = 0; i <= n; i++) {
    const t = (Math.PI / 2) * (i / n)
    p.push([a * Math.cos(t), y1 + b * Math.sin(t)])
  }
  else p.push([a, y1], [0, y1])
  return p
}

/** Closed rectangular ring section, optionally a sector (azimuths a0 → a0 + len). */
export function ringSector(k: Kit, mat: MatKey, r0: number, r1: number, y0: number, y1: number, a0 = 0, len = TAU, seg = 48) {
  k.lathe(mat, [[r1, y0], [r1, y1], [r0, y1], [r0, y0], [r1, y0]], [0, 0, 0], 'y', Math.max(4, Math.round((seg * len) / TAU)), phiOf(a0), len)
}

/** Raised weld bead ring on a vertical shell of radius R at height y. */
export function seam(k: Kit, mat: MatKey, R: number, y: number, seg = 64, axis: 'x' | 'y' = 'y', c: V3 = [0, 0, 0]) {
  const w = 0.022
  const h = 0.003
  const g = smoothLathe([[R - 0.002, y - w / 2], [R + h * 0.7, y - w / 4], [R + h, y], [R + h * 0.7, y + w / 4], [R - 0.002, y + w / 2]], seg, 0, TAU, 60)
  k.add(mat, g, mat4(c, axis))
}

/** Opening cut into a skin: base point on the surface (world), outward nozzle axis, cut radius (inside the neck wall). */
export interface Hole {
  p: V3
  d: V3
  r: number
}

/** Cut radius for a flanged nozzle neck: midway through the Sch 80 wall so the cut edge hides inside the neck. */
export const holeR = (nps: number) => pipeOD(nps) / 2 - pipeWall(nps, '80') / 2

export interface SkinOpts {
  Ro: number
  /** head depth (0 = open end) */
  bo: number
  e0: number
  e1: number
  top?: boolean
  bottom?: boolean
  holes?: Hole[]
  axis?: 'x' | 'y'
  centre?: V3
  seg?: number
}

interface SideWin {
  a: number
  y: number
  r: number
  h: number
  da: number
}

const wrap = (a: number) => ((a % TAU) + TAU) % TAU
const angIn = (t: number, a: number, da: number) => Math.abs(Math.atan2(Math.sin(t - a), Math.cos(t - a))) < da - 1e-9

/** Vessel skin (cylinder + 2:1 heads) with real openings at every nozzle. Returns the geometry in the local frame and its matrix. */
export function skinGeometry(o: SkinOpts) {
  const seg = o.seg ?? 72
  const M = o.axis === 'x' ? mat4(o.centre ?? [0, 0, 0], 'x') : mat4(o.centre ?? [0, 0, 0])
  const Mi = M.clone().invert()
  const { Ro, bo, e0, e1 } = o
  const side: SideWin[] = []
  const caps: { top: { x: number; z: number; r: number }[]; bottom: { x: number; z: number; r: number }[] } = { top: [], bottom: [] }
  for (const h of o.holes ?? []) {
    const p = V(h.p).applyMatrix4(Mi)
    const d = V(h.d).transformDirection(Mi)
    if (Math.abs(d.y) < 0.5) {
      const hh = h.r * 1.25 + 0.015
      const y0 = Math.max(e0 + 0.002, p.y - hh)
      const y1 = Math.min(e1 - 0.002, p.y + hh)
      if (p.y - h.r < e0 || p.y + h.r > e1) continue
      side.push({ a: wrap(Math.hypot(p.x, p.z) > 0.5 * Ro ? Math.atan2(-p.z, p.x) : Math.atan2(-d.z, d.x)), y: p.y, r: h.r, h: Math.min(p.y - y0, y1 - p.y), da: Math.asin(Math.min(0.9, hh / Ro)) })
    } else (d.y > 0 ? caps.top : caps.bottom).push({ x: p.x, z: p.z, r: h.r })
  }
  // global angle list: uniform + every window edge, so neighbouring pieces share vertices
  const G = Array.from({ length: seg }, (_, i) => (i / seg) * TAU)
  for (const w of side) G.push(wrap(w.a - w.da), wrap(w.a + w.da))
  G.sort((a, b) => a - b)
  const A = G.filter((a, i) => i === 0 || a - G[i - 1] > 1e-6)
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const vtx = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    pos.push(x, y, z)
    nor.push(nx, ny, nz)
    return pos.length / 3 - 1
  }
  const cyl = (t: number, y: number) => vtx(Ro * Math.cos(t), y, -Ro * Math.sin(t), Math.cos(t), 0, -Math.sin(t))
  // cylinder bands
  const ys = new Set<number>([e0, e1])
  for (const w of side) ys.add(w.y - w.h).add(w.y + w.h)
  const band = [...ys].sort((a, b) => a - b)
  for (let b = 0; b < band.length - 1; b++) {
    const y0 = band[b]
    const y1 = band[b + 1]
    if (y1 - y0 < 1e-6) continue
    const ym = (y0 + y1) / 2
    const act = side.filter((w) => Math.abs(ym - w.y) < w.h)
    for (let i = 0; i < A.length; i++) {
      const t0 = A[i]
      const t1 = i + 1 < A.length ? A[i + 1] : A[0] + TAU
      if (act.some((w) => angIn((t0 + t1) / 2, w.a, w.da))) continue
      const a0 = cyl(t0, y0)
      const a1 = cyl(t1, y0)
      const a2 = cyl(t1, y1)
      const a3 = cyl(t0, y1)
      idx.push(a0, a1, a2, a0, a2, a3)
    }
  }
  // window patches: unrolled rectangle with the bore curve as a hole, tessellated, wrapped back onto the cylinder
  const patch = (shape: THREE.Shape, maxEdge: number, map: (u: number, v: number) => [THREE.Vector3, THREE.Vector3]) => {
    let g: THREE.BufferGeometry = new THREE.ShapeGeometry(shape, 1)
    g = new TessellateModifier(maxEdge, 10).modify(g)
    const P = g.getAttribute('position')
    const base = pos.length / 3
    for (let i = 0; i < P.count; i++) {
      const [q, n] = map(P.getX(i), P.getY(i))
      vtx(q.x, q.y, q.z, n.x, n.y, n.z)
    }
    for (let i = 0; i < P.count; i += 3) {
      const a = V([pos[(base + i) * 3], pos[(base + i) * 3 + 1], pos[(base + i) * 3 + 2]])
      const b = V([pos[(base + i + 1) * 3], pos[(base + i + 1) * 3 + 1], pos[(base + i + 1) * 3 + 2]])
      const c = V([pos[(base + i + 2) * 3], pos[(base + i + 2) * 3 + 1], pos[(base + i + 2) * 3 + 2]])
      const n = b.sub(a).cross(c.sub(a))
      const e = V([nor[(base + i) * 3], nor[(base + i) * 3 + 1], nor[(base + i) * 3 + 2]])
      if (n.dot(e) < 0) idx.push(base + i, base + i + 2, base + i + 1)
      else idx.push(base + i, base + i + 1, base + i + 2)
    }
    g.dispose()
  }
  for (const w of side) {
    const un = (t: number) => Ro * Math.atan2(Math.sin(t - w.a), Math.cos(t - w.a))
    const inner = A.filter((t) => angIn(t, w.a, w.da + 1e-6)).map(un).sort((a, b) => a - b)
    const U = Ro * w.da
    const xs = [-U, ...inner.filter((u) => u > -U + 1e-6 && u < U - 1e-6), U]
    const nv = Math.max(2, Math.ceil((2 * w.h) / (U / Math.max(1, xs.length - 1) + 0.02)))
    const sh = new THREE.Shape()
    sh.moveTo(xs[0], -w.h)
    for (const u of xs.slice(1)) sh.lineTo(u, -w.h)
    for (let j = 1; j <= nv; j++) sh.lineTo(U, -w.h + (2 * w.h * j) / nv)
    for (const u of [...xs].reverse().slice(1)) sh.lineTo(u, w.h)
    for (let j = 1; j < nv; j++) sh.lineTo(-U, w.h - (2 * w.h * j) / nv)
    sh.closePath()
    const hole = new THREE.Path()
    const nh = 40
    for (let j = 0; j <= nh; j++) {
      const f = (j / nh) * TAU
      const u = Ro * Math.asin(Math.min(1, (w.r * Math.cos(f)) / Ro))
      if (j === 0) hole.moveTo(u, w.r * Math.sin(f))
      else hole.lineTo(u, w.r * Math.sin(f))
    }
    sh.holes.push(hole)
    let maxSeg = 0
    for (let j = 1; j < xs.length; j++) maxSeg = Math.max(maxSeg, xs[j] - xs[j - 1])
    patch(sh, Math.max(maxSeg, (2 * w.h) / nv) * 1.05, (u, v) => {
      const t = w.a + u / Ro
      return [V([Ro * Math.cos(t), w.y + v, -Ro * Math.sin(t)]), V([Math.cos(t), 0, -Math.sin(t)])]
    })
  }
  // heads: knuckle ring as a lathe on the shared angles, crown as a tessellated height field with the holes
  const head = (sgn: 1 | -1, list: { x: number; z: number; r: number }[]) => {
    const y0 = sgn > 0 ? e1 : e0
    if (bo <= 0) return
    const fits = list.filter((h) => Math.hypot(h.x, h.z) + h.r < 0.9 * Ro)
    const rCut = clamp(Math.max(0.6 * Ro, ...fits.map((h) => Math.hypot(h.x, h.z) + h.r + 0.04)), 0.6 * Ro, 0.92 * Ro)
    const nk = 14
    const tc = Math.acos(rCut / Ro)
    const ell = (t: number, a: number) => {
      const r = Ro * Math.cos(t)
      const y = y0 + sgn * bo * Math.sin(t)
      const n = V([Math.cos(t) / Ro * Math.cos(a), (sgn * Math.sin(t)) / bo, -(Math.cos(t) / Ro) * Math.sin(a)]).normalize()
      return vtx(r * Math.cos(a), y, -r * Math.sin(a), n.x, n.y, n.z)
    }
    for (let j = 0; j < nk; j++) {
      const t0 = (tc * j) / nk
      const t1 = (tc * (j + 1)) / nk
      for (let i = 0; i < A.length; i++) {
        const p0 = A[i]
        const p1 = i + 1 < A.length ? A[i + 1] : A[0] + TAU
        const a0 = ell(t0, p0)
        const a1 = ell(t0, p1)
        const a2 = ell(t1, p1)
        const a3 = ell(t1, p0)
        if (sgn > 0) idx.push(a0, a1, a2, a0, a2, a3)
        else idx.push(a0, a2, a1, a0, a3, a2)
      }
    }
    const sh = new THREE.Shape()
    A.forEach((t, i) => (i ? sh.lineTo(rCut * Math.cos(t), rCut * Math.sin(t)) : sh.moveTo(rCut * Math.cos(t), rCut * Math.sin(t))))
    sh.closePath()
    for (const h of fits) {
      const hp = new THREE.Path()
      for (let j = 0; j <= 32; j++) {
        const f = (j / 32) * TAU
        const x = h.x + h.r * Math.cos(f)
        const z = h.z + h.r * Math.sin(f)
        if (j === 0) hp.moveTo(x, -z)
        else hp.lineTo(x, -z)
      }
      sh.holes.push(hp)
    }
    let maxSeg = 0
    for (let i = 0; i < A.length; i++) maxSeg = Math.max(maxSeg, rCut * ((i + 1 < A.length ? A[i + 1] : A[0] + TAU) - A[i]))
    patch(sh, maxSeg * 1.05, (sx, sy) => {
      const x = sx
      const z = -sy
      const q = Math.max(0, 1 - (x * x + z * z) / (Ro * Ro))
      const y = y0 + sgn * bo * Math.sqrt(q)
      return [V([x, y, z]), V([x / (Ro * Ro), (y - y0) / (bo * bo), z / (Ro * Ro)]).normalize()]
    })
  }
  if (o.top ?? true) head(1, caps.top)
  if (o.bottom ?? true) head(-1, caps.bottom)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  return { g, M, side }
}

export interface ShellOpts {
  Ro: number
  bo: number
  e0: number
  e1: number
  mat: MatKey
  insulated?: boolean
  /** insulation + cladding thickness, m */
  ins?: number
  bottom?: boolean
  top?: boolean
  axis?: 'x' | 'y'
  centre?: V3
  /** shell course width for seams, m */
  course?: number
  seg?: number
  /** nozzle openings (world frame) */
  holes?: Hole[]
}

/** Vessel shell with openings at every nozzle, a dark interior, circumferential + staggered longitudinal seams, or clad insulation with bands. */
export function shell(k: Kit, o: ShellOpts) {
  const seg = o.seg ?? 72
  const axis = o.axis ?? 'y'
  const c = o.centre ?? [0, 0, 0]
  const top = o.top ?? true
  const bottom = o.bottom ?? true
  const holes = o.holes ?? []
  const steel = skinGeometry({ Ro: o.Ro, bo: o.bo, e0: o.e0, e1: o.e1, top, bottom, holes, axis, centre: c, seg })
  k.add(o.mat, steel.g.clone(), steel.M)
  k.add('vesselInner', steel.g, steel.M)
  // open ends get an inside-only cap so the interior reads closed through the nozzles
  for (const [has, y, s] of [[bottom, o.e0, -1], [top, o.e1, 1]] as const)
    if (!has || o.bo <= 0) k.with(steel.M, () => k.disc('vesselInner', o.Ro, [0, y, 0], s > 0 ? 'y' : '-y', seg))
  const gapped = (R: number, y: number, mat: MatKey, wins: SideWin[], rr = R) => {
    const cut = wins.filter((w) => Math.abs(y - w.y) < w.h + 0.03)
    if (!cut.length) return seam(k, mat, rr, y, seg, axis, c)
    const ang = cut.map((w) => [wrap(w.a - w.da - 0.02), 2 * w.da + 0.04] as const).sort((a, b) => a[0] - b[0])
    for (let i = 0; i < ang.length; i++) {
      const s0 = ang[i][0] + ang[i][1]
      const s1 = i + 1 < ang.length ? ang[i + 1][0] : ang[0][0] + TAU
      if (s1 - s0 > 0.01) k.add(mat, smoothLathe([[rr - 0.002, y - 0.011], [rr + 0.002, y - 0.0055], [rr + 0.003, y], [rr + 0.002, y + 0.0055], [rr - 0.002, y + 0.011]], Math.max(4, Math.round((seg * (s1 - s0)) / TAU)), phiOf(s0), s1 - s0, 60), steel.M)
    }
  }
  if (o.insulated) {
    const t = o.ins ?? 0.06
    const jh = holes.map((h) => ({ ...h, r: h.r + 0.012 }))
    const jacket = skinGeometry({ Ro: o.Ro + t, bo: o.bo + t, e0: o.e0, e1: o.e1, top, bottom, holes: jh, axis, centre: c, seg })
    k.add('insulation', jacket.g, jacket.M)
    for (let y = o.e0 + 0.9; y < o.e1 - 0.1; y += 0.9) gapped(o.Ro + t, y, 'insulation', jacket.side)
    return
  }
  const tt = o.e1 - o.e0
  const n = Math.max(1, Math.round(tt / (o.course ?? 2.4)))
  for (let i = 0; i <= n; i++) gapped(o.Ro, o.e0 + (i * tt) / n, o.mat, steel.side)
  for (let i = 0; i < n; i++) {
    const a = i % 2 ? deg(150) : deg(-30)
    const y = o.e0 + ((i + 0.5) * tt) / n
    const hl = tt / n - 0.02
    if (steel.side.some((w) => angIn(a, w.a, w.da + 0.03) && Math.abs(w.y - y) < hl / 2 + w.h)) continue
    const pt = at(a, o.Ro + 0.0012, y)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    k.with(steel.M, () => k.box(o.mat, [0.004, hl, 0.02], pt, q))
  }
}

// ------------------------------------------------------------------ surface projection + conforming pads

export type Projector = (q: THREE.Vector3, d: THREE.Vector3) => number | null

function roots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) return Math.abs(b) < 1e-12 ? [] : [-c / b]
  const D = b * b - 4 * a * c
  if (D < 0) return []
  const s = Math.sqrt(D)
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)]
}

/** Ray solver for a cylinder (radius a, axis x or y through centre, half length halfL) closed by 2:1 heads of depth b. */
export function projector(axis: 'x' | 'y', centre: V3, halfL: number, a: number, b: number): Projector {
  return (q, d) => {
    const qa = axis === 'x' ? q.x - centre[0] : q.y - centre[1]
    const da = axis === 'x' ? d.x : d.y
    const q1 = axis === 'x' ? q.y - centre[1] : q.x - centre[0]
    const d1 = axis === 'x' ? d.y : d.x
    const q2 = q.z - centre[2]
    const d2 = d.z
    const c: number[] = []
    for (const t of roots(d1 * d1 + d2 * d2, 2 * (q1 * d1 + q2 * d2), q1 * q1 + q2 * q2 - a * a)) if (Math.abs(qa + t * da) <= halfL + 1e-6) c.push(t)
    if (b > 0)
      for (const s of [-1, 1]) {
        const X = qa - s * halfL
        const A = (da * da) / (b * b) + (d1 * d1 + d2 * d2) / (a * a)
        const B = 2 * ((X * da) / (b * b) + (q1 * d1 + q2 * d2) / (a * a))
        const C = (X * X) / (b * b) + (q1 * q1 + q2 * q2) / (a * a) - 1
        for (const t of roots(A, B, C)) if (s * (X + t * da) >= -1e-6) c.push(t)
      }
    if (!c.length) return null
    return c.reduce((p, x) => (Math.abs(x) < Math.abs(p) ? x : p))
  }
}

/** Reinforcement pad / doubler (annulus rIn…rOut, thickness t) wrapped onto the surface around base along dir. */
export function pad(k: Kit, mat: MatKey, proj: Projector, base: V3, dir: V3, rIn: number, rOut: number, t: number, seg = 40) {
  const d = V(dir).normalize()
  const u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize()
  const w = new THREE.Vector3().crossVectors(d, u).normalize()
  const pos: number[] = []
  const idx: number[] = []
  const vtx = (p: THREE.Vector3) => (pos.push(p.x, p.y, p.z), pos.length / 3 - 1)
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
  const tri = (a: number, b: number, c: number, expect: THREE.Vector3) => {
    const n = P(b).sub(P(a)).cross(P(c).sub(P(a)))
    if (n.dot(expect) < 0) idx.push(a, c, b)
    else idx.push(a, b, c)
  }
  const ti: number[] = []
  const to: number[] = []
  const rb: number[] = []
  const rt: number[] = []
  const ib: number[] = []
  const it: number[] = []
  const offs: THREE.Vector3[] = []
  const B = V(base)
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU
    const off = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a))
    offs.push(off)
    const qi = B.clone().addScaledVector(off, rIn)
    const qo = B.clone().addScaledVector(off, rOut)
    const si = proj(qi, d)
    const so = proj(qo, d)
    if (si === null || so === null) return
    qi.addScaledVector(d, si)
    qo.addScaledVector(d, so)
    ti.push(vtx(qi.clone().addScaledVector(d, t)))
    to.push(vtx(qo.clone().addScaledVector(d, t)))
    rt.push(vtx(qo.clone().addScaledVector(d, t)))
    rb.push(vtx(qo.clone().addScaledVector(d, -0.004)))
    if (rIn > 0) {
      it.push(vtx(qi.clone().addScaledVector(d, t)))
      ib.push(vtx(qi.clone().addScaledVector(d, -0.004)))
    }
  }
  for (let i = 0; i < seg; i++) {
    tri(ti[i], to[i], to[i + 1], d)
    tri(ti[i], to[i + 1], ti[i + 1], d)
    tri(rb[i], rb[i + 1], rt[i + 1], offs[i])
    tri(rb[i], rt[i + 1], rt[i], offs[i])
    if (rIn > 0) {
      const inn = offs[i].clone().negate()
      tri(ib[i], ib[i + 1], it[i + 1], inn)
      tri(ib[i], it[i + 1], it[i], inn)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  k.add(mat, g)
}

export interface ShellNozzle {
  base: V3
  dir: V3
  nps: number
  rating: Rating
  standout: number
  mat: MatKey
  proj?: Projector
  insulated?: boolean
  blind?: boolean
  /** pad thickness, m (0 = none) */
  padT?: number
  /** studs on the flange (false when a joint draws through-studs) */
  studs?: boolean
}

/** Flanged nozzle with studs and a conforming reinforcement pad (2× OD, omitted under insulation and below 2"). */
export function shellNozzle(k: Kit, o: ShellNozzle): V3 {
  const face = nozzle(k, { base: o.base, dir: o.dir, nps: o.nps, rating: o.rating, standout: o.standout, mat: o.mat, blind: o.blind, studs: o.studs ?? !o.blind })
  if (o.proj && !o.insulated && o.nps >= 2 && (o.padT ?? 0.016) > 0) pad(k, o.mat, o.proj, o.base, o.dir, pipeOD(o.nps) / 2, pipeOD(o.nps), o.padT ?? 0.016, 36)
  return face
}

// ------------------------------------------------------------------ supports

export interface SkirtOpening {
  a: number
  y: number
  /** opening (sleeve) diameter, m */
  d: number
  /** access openings get a doubler; pipe sleeves only a short sleeve */
  access?: boolean
}

/** Cylindrical skirt from the deck to y = top: openings with sleeves, doublers, vents, base ring and anchor chairs. */
export function skirt(k: Kit, mat: MatKey, Ro: number, top: number, ts: number, openings: SkirtOpening[], seg = 72, opts: { bandsOnly?: boolean; y0?: number } = {}) {
  const yBR = opts.y0 ?? 0.03
  const ys = new Set<number>([yBR, top])
  for (const o of openings) {
    ys.add(o.y - o.d / 2)
    ys.add(o.y + o.d / 2)
  }
  const band = [...ys].filter((y) => y >= yBR && y <= top).sort((a, b) => a - b)
  for (let i = 0; i < band.length - 1; i++) {
    const y0 = band[i]
    const y1 = band[i + 1]
    const mid = (y0 + y1) / 2
    const cut = openings
      .filter((o) => Math.abs(mid - o.y) < o.d / 2)
      .map((o) => {
        const h = Math.asin(Math.min(0.95, o.d / 2 / Ro))
        const s = (((o.a - h) % TAU) + TAU) % TAU
        return [s, s + 2 * h] as [number, number]
      })
      .sort((a, b) => a[0] - b[0])
    if (!cut.length) {
      ringSector(k, mat, Ro - ts, Ro, y0, y1, 0, TAU, seg)
      continue
    }
    for (let j = 0; j < cut.length; j++) {
      const s = cut[j][1]
      const e = j + 1 < cut.length ? cut[j + 1][0] : cut[0][0] + TAU
      if (e - s > 1e-3) ringSector(k, mat, Ro - ts, Ro, y0, y1, s, e - s, seg)
    }
  }
  if (opts.bandsOnly) return
  const sk = projector('y', [0, top / 2, 0], top / 2, Ro, 0)
  for (const o of openings) {
    const d = dirOf(o.a)
    const c = at(o.a, Ro, o.y)
    const r = o.d / 2
    const len = o.access ? 0.14 : 0.08
    k.lathe(mat, [[r, -ts - 0.02], [r, len], [r - 0.012, len], [r - 0.012, -ts - 0.02], [r, -ts - 0.02]], c, d, 32)
    if (o.access) pad(k, mat, sk, c, d, r, r * 1.45, 0.012, 40)
  }
  // vents near the skirt top
  if (top > 1.2)
    for (let i = 0; i < 4; i++) {
      const a = deg(45) + (i * Math.PI) / 2
      k.lathe(mat, [[0.037, -ts - 0.01], [0.037, 0.05], [0.03, 0.05], [0.03, -ts - 0.01], [0.037, -ts - 0.01]], at(a, Ro, top - 0.2), dirOf(a), 16)
    }
  // base ring + anchor chairs
  ringSector(k, mat, Ro - ts - 0.08, Ro + 0.12, 0, yBR, 0, TAU, seg)
  const nB = Math.max(4, 4 * Math.ceil((TAU * Ro) / 4.8))
  const hc = clamp(top * 0.1, 0.16, 0.28)
  for (let i = 0; i < nB; i++) {
    const a = ((i + 0.5) / nB) * TAU
    const d = dirOf(a)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    for (const s of [-1, 1]) k.box(mat, [0.11, hc, 0.016], add(at(a, Ro + 0.055, yBR + hc / 2), [-d[2], 0, d[0]], s * 0.065), q)
    k.box(mat, [0.12, 0.022, 0.16], at(a, Ro + 0.06, yBR + hc + 0.011), q)
    const bp = at(a, Ro + 0.065, 0)
    k.rod('nut', bp, [bp[0], yBR + hc + 0.1, bp[2]], 0.012, 8)
    k.hex('nut', 0.042, 0.026, [bp[0], yBR + hc + 0.035, bp[2]])
    k.cyl('nut', 0.03, 0.006, [bp[0], yBR + hc + 0.025, bp[2]], 'y', 12)
  }
}

/** Pipe legs welded tangent to a vertical shell (bottom tangent at e0): pad, base plate, anchor bolts. Returns leg radius. */
export function legs(k: Kit, mat: MatKey, Ro: number, e0: number, proj: Projector, n = 4, a0 = deg(45), lr?: number) {
  const r = lr ?? clamp(0.05 * (Ro / 0.6), 0.045, 0.11)
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n
    const c = at(a, Ro + r - 0.004, 0)
    const yTop = e0 + clamp(Ro * 0.5, 0.25, 0.6)
    k.cyl(mat, r, yTop - 0.02, [c[0], 0.02 + (yTop - 0.02) / 2, c[2]], 'y', 20)
    k.cyl(mat, r + 0.004, 0.012, [c[0], yTop + 0.006, c[2]], 'y', 20)
    pad(k, mat, proj, at(a, Ro, e0 + (yTop - e0) * 0.45), dirOf(a), 0, r * 2.4, 0.012, 24)
    const bp = r * 3.2
    k.box(mat, [bp, 0.02, bp], [c[0], 0.01, c[2]])
    const d = dirOf(a)
    const lat: V3 = [-d[2], 0, d[0]]
    for (const s of [-1, 1]) {
      k.box(mat, [r * 1.2, r * 1.4, 0.012], add([c[0], 0.02 + r * 0.7, c[2]], lat, s * (r + 0.006)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
      const b = add(add([c[0], 0, c[2]], d, bp * 0.32), lat, s * bp * 0.32)
      k.rod('nut', b, [b[0], 0.08, b[2]], 0.009, 8)
      k.hex('nut', 0.03, 0.018, [b[0], 0.032, b[2]])
    }
  }
  return r
}

/** Bottom outlet from the bottom head, LR elbow inside the skirt and horizontal run out through a skirt sleeve. Returns the flange face. */
export function skirtLine(k: Kit, start: V3, a: number, yRun: number, nps: number, rating: Rating, faceR: number, mat: MatKey = 'equipmentPaint') {
  const d = dirOf(a)
  const face = at(a, faceR, yRun)
  const f = flangeDims(nps, rating)
  const L = f.hubLength + f.raisedFaceHeight
  const end = add(face, d, -L)
  pipeRun(k, [start, [start[0], yRun, start[2]], end], nps, { mat })
  flange(k, nps, rating, face, d, true)
  return face
}

/** Elevation of the run that leaves the skirt: head tip − elbow − straight. */
export const skirtRunY = (tipY: number, nps: number) => tipY - elbow90(nps) - 0.12

// ------------------------------------------------------------------ access

export interface PlatformOpts {
  y: number
  /** steel shell radius (brackets weld here) */
  shellR: number
  /** inner edge radius (clears insulation) */
  rIn: number
  width?: number
  /** azimuth range, a0 < a1 */
  a0: number
  a1: number
  /** azimuth of a ladder arriving through the outer handrail */
  gate?: number
  /** ends left open (stair arrival) */
  open?: ('a0' | 'a1')[]
}

/** Bracketed ring platform (grating, edge bars, toe plate, ISO 14122-3 handrail with ladder gate) on a vertical vessel. */
export function platform(k: Kit, o: PlatformOpts) {
  const W = o.width ?? 0.95
  const rOut = o.rIn + W
  const len = o.a1 - o.a0
  const n = Math.max(8, Math.round((len * rOut) / 0.25))
  const ring = new THREE.RingGeometry(o.rIn, rOut, n, 1, o.a0, len)
  ring.rotateX(-Math.PI / 2)
  const p = ring.getAttribute('position') as THREE.BufferAttribute
  const uv = ring.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.3, p.getZ(i) / 0.3)
  k.add(gratingMaterial(), ring, mat4([0, o.y, 0]))
  ringSector(k, 'galvanised', o.rIn, o.rIn + 0.006, o.y - 0.03, o.y, o.a0, len, n)
  ringSector(k, 'galvanised', rOut - 0.008, rOut, o.y - 0.12, o.y, o.a0, len, n)
  ringSector(k, 'safetyYellow', rOut - 0.012, rOut - 0.006, o.y, o.y + ACCESS.handrail.toePlate, o.a0, len, n)
  // brackets: radial beam, knee brace, shell clip
  const nb = Math.max(2, Math.ceil((len * rOut) / 1.6))
  for (let i = 0; i <= nb; i++) {
    const a = o.a0 + (len * i) / nb
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    k.box('galvanised', [rOut - o.shellR, 0.1, 0.05], at(a, (o.shellR + rOut) / 2, o.y - 0.08), q)
    member(k, at(a, o.shellR + 0.01, o.y - 0.9), at(a, rOut - 0.15, o.y - 0.13), 'L50x50x5', 'galvanised')
    k.box('galvanised', [0.012, 1.0, 0.14], at(a, o.shellR + 0.006, o.y - 0.5), q)
  }
  // handrail
  const rr = rOut - 0.03
  const gap = o.gate !== undefined ? 0.33 / rr : 0
  const spans: [number, number][] = o.gate !== undefined ? [[o.a0, o.gate - gap], [o.gate + gap, o.a1]] : [[o.a0, o.a1]]
  for (const [s, e] of spans) {
    if (e - s < 1e-3) continue
    const m = Math.max(1, Math.ceil(((e - s) * rr) / ACCESS.handrail.postSpacingMax))
    for (let j = 0; j <= m; j++) {
      const a = s + ((e - s) * j) / m
      k.rod('safetyYellow', at(a, rr, o.y), at(a, rr, o.y + ACCESS.handrail.height), 0.024, 8)
    }
    const segs = Math.max(4, Math.ceil(((e - s) * rr) / 0.3))
    for (const h of [ACCESS.handrail.height, ACCESS.handrail.kneeRail]) {
      const pts: V3[] = []
      for (let j = 0; j <= segs; j++) pts.push(at(s + ((e - s) * j) / segs, rr, o.y + h))
      k.tube('safetyYellow', pts, h > 1 ? 0.024 : 0.018, 8, 0.05)
    }
  }
  // end rails / self-closing gates back to the shell
  for (const a of [o.a0, o.a1]) {
    if (o.open?.includes(a === o.a0 ? 'a0' : 'a1')) continue
    k.rod('safetyYellow', at(a, o.rIn + 0.1, o.y), at(a, o.rIn + 0.1, o.y + ACCESS.handrail.height), 0.024, 8)
    for (const h of [ACCESS.handrail.height, ACCESS.handrail.kneeRail]) k.rod('safetyYellow', at(a, o.rIn + 0.1, o.y + h), at(a, rr, o.y + h), h > 1 ? 0.024 : 0.018, 8)
  }
  if (o.gate !== undefined) {
    const g0 = at(o.gate - gap, rr - 0.04, 0)
    const g1 = at(o.gate + gap, rr - 0.04, 0)
    for (const h of [0.5, 1.0]) k.rod('safetyYellow', [g0[0], o.y + h, g0[2]], [g1[0], o.y + h, g1[2]], 0.016, 8)
    k.rod('safetyYellow', [g1[0], o.y + 0.45, g1[2]], [g1[0], o.y + 1.05, g1[2]], 0.018, 8)
  }
  return rOut
}

/** ISO 14122-4 caged ladder at azimuth a, stiles at radius r, from yFoot up to platform yTop, with wall brackets back to the shell. */
export function cagedLadder(k: Kit, a: number, r: number, yFoot: number, yTop: number, shellR: number) {
  const d = dirOf(a)
  const foot = at(a, r, yFoot)
  ladder(k, foot, yTop, d)
  const lat: V3 = [-d[2], 0, d[0]]
  for (let y = yFoot + 1.5; y < yTop - 0.4; y += 2.4)
    for (const s of [-1, 1]) {
      const p = add([foot[0], y, foot[2]], lat, s * ACCESS.ladder.width * 0.5)
      const back = add(p, d, -(r - shellR) + 0.004)
      member(k, p, back, 'L50x50x5', 'galvanised')
    }
}

/** Platform-mounted maintenance davit swinging over the top head (socket, mast, arm, brace, hook). */
export function topDavit(k: Kit, a: number, Ro: number, yPlat: number, yTip: number) {
  const m = at(a, Ro + 0.3, 0)
  k.cyl('safetyYellow', 0.075, 0.4, [m[0], yPlat + 0.2, m[2]], 'y', 20)
  k.box('galvanised', [0.3, 0.16, 0.02], at(a, Ro + 0.15, yPlat - 0.1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
  k.cyl('safetyYellow', 0.075, 0.25, [m[0], yPlat - 0.2, m[2]], 'y', 20)
  k.rod('safetyYellow', [m[0], yPlat - 0.3, m[2]], [m[0], yTip, m[2]], 0.05, 16)
  const reach = Ro + 0.3
  const d = dirOf(a)
  const tip = add([m[0], yTip - 0.04, m[2]], d, -reach * 0.95)
  k.rod('safetyYellow', [m[0], yTip - 0.03, m[2]], tip, 0.045, 12)
  k.rod('safetyYellow', [m[0], yTip - 0.6, m[2]], add([m[0], yTip - 0.05, m[2]], d, -reach * 0.4), 0.025, 8)
  k.rod('nut', add(tip, [0, -1, 0], 0.04), add(tip, [0, -1, 0], 0.45), 0.006, 6)
  k.torus('nut', 0.035, 0.008, add(tip, [0, -1, 0], 0.5), dirOf(a + Math.PI / 2), 6, 16, Math.PI * 1.5)
}

/** ASME nameplate on standoff brackets plus the stamped tag plate, facing radially out at azimuth a. */
export function nameplate(k: Kit, mat: MatKey, a: number, R: number, y: number, tag: string, s = 1) {
  const d = dirOf(a)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(d))
  const lat: V3 = [-d[2], 0, d[0]]
  for (const j of [-1, 1]) k.box(mat, [0.03, 0.07 * s, 0.07], add(at(a, R + 0.03, y), lat, j * 0.13 * s), q)
  k.box(mat, [0.4 * s, 0.27 * s, 0.006], at(a, R + 0.068, y), q)
  k.box('nameplate', [0.34 * s, 0.2 * s, 0.003], at(a, R + 0.072, y + 0.015 * s), q)
  tagPlate(k, tag, at(a, R + 0.072, y - 0.105 * s), d, 0.2 * s)
}

/** Earthing boss: welded pad with an M12 stud and nut, facing out along d. */
export function earthBoss(k: Kit, mat: MatKey, p: V3, d: V3) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(d).normalize())
  k.box(mat, [0.07, 0.05, 0.02], add(p, d, 0.01), q)
  k.rod('stainless', add(p, d, 0.02), add(p, d, 0.06), 0.006, 8)
  k.hex('stainless', 0.022, 0.01, add(p, d, 0.035), d)
  k.cyl('copper', 0.014, 0.003, add(p, d, 0.043), d, 10)
}

/** Small flanged hand valve (body, bonnet, handwheel) centred on p with its run along `run` and stem along `stem`. */
export function smallValve(k: Kit, p: V3, run: V3, stem: V3, od: number) {
  const L = od * 3.2
  k.rod('valveBody', add(p, run, -L / 2), add(p, run, L / 2), od * 0.62, 12)
  for (const s of [-1, 1]) k.cyl('flangeSteel', od * 1.05, od * 0.25, add(p, run, (s * L) / 2), run, 16)
  k.rod('valveBody', p, add(p, stem, od * 2.4), od * 0.32, 10)
  k.rod('stainless', add(p, stem, od * 2.4), add(p, stem, od * 3.4), od * 0.08, 6)
  k.handwheel('handwheel', od * 3, add(p, stem, od * 3.3), stem)
}

export interface BridleOpts {
  shellR: number
  a: number
  yLo: number
  yHi: number
  rating: Rating
  /** standpipe centre distance from the steel shell, m */
  off?: number
  insulated?: boolean
}

/** Level bridle: two isolated 2" tappings, 3" standpipe with vent and drain valves, magnetic gauge (LG) and GWR transmitter (LT) on top. */
export function levelBridle(k: Kit, o: BridleOpts) {
  const off = o.off ?? (o.insulated ? 0.6 : 0.5)
  const d = dirOf(o.a)
  const lat: V3 = [-d[2], 0, d[0]]
  const so = 0.2 + (o.insulated ? 0.075 : 0)
  const sp = 3
  const odS = pipeOD(sp)
  const C = (y: number) => at(o.a, o.shellR + off, y)
  for (const y of [o.yLo, o.yHi]) {
    const face = nozzle(k, { base: at(o.a, o.shellR, y), dir: d, nps: 2, rating: o.rating, standout: so, mat: 'equipmentPaint', studs: false })
    const vEnd = mateFlange(k, 2, o.rating, face, d)
    const vc = add(vEnd, d, 0.11)
    smallValve(k, vc, d, [0, 1, 0], pipeOD(2))
    k.pipe('stainless', add(vc, d, 0.16), add(C(y), d, -odS / 2 + 0.01), pipeOD(2), pipeWall(2, '80'))
  }
  const y0 = o.yLo - 0.25
  const y1 = o.yHi + 0.2
  k.pipe('stainless', C(y0), C(y1), odS, pipeWall(sp, '80'))
  k.cyl('stainless', odS / 2 + 0.004, 0.02, C(y0 - 0.01), 'y', 20)
  // drain valve below, LT flange + GWR head above
  smallValve(k, C(y0 - 0.16), [0, 1, 0], d, pipeOD(1))
  k.pipe('stainless', C(y0 - 0.32), C(y0 - 0.02), pipeOD(1), pipeWall(1, '80'))
  flange(k, sp, o.rating, C(y1 + 0.08), [0, 1, 0], true)
  k.pipe('stainless', C(y1 - 0.01), C(y1 + 0.02), odS, pipeWall(sp, '80'))
  const fd = flangeDims(sp, o.rating)
  k.cyl('flangeSteel', fd.od / 2, fd.thickness, C(y1 + 0.08 + fd.thickness / 2 + 0.004), 'y', 28)
  k.cyl('stainless', 0.03, 0.12, C(y1 + 0.16 + fd.thickness), 'y', 16)
  k.cyl('actuatorBlue', 0.075, 0.13, C(y1 + 0.28 + fd.thickness), 'y', 24)
  k.rbox('actuatorBlue', [0.15, 0.13, 0.15], 0.025, C(y1 + 0.42 + fd.thickness))
  k.cyl('brass', 0.013, 0.04, add(C(y1 + 0.42 + fd.thickness), lat, 0.09), lat, 10)
  // magnetic level gauge on the lateral side of the standpipe
  const gx = add(C(0), lat, odS / 2 + 0.05)
  const gh = o.yHi - o.yLo + 0.2
  const gy = (o.yLo + o.yHi) / 2
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(d))
  k.box('stainless', [0.07, gh, 0.06], [gx[0], gy, gx[2]], q)
  k.box(levelFlagMaterial(0.45), [0.03, gh * 0.96, 0.004], add([gx[0], gy, gx[2]], d, 0.031), q)
  for (const y of [o.yLo + 0.05, o.yHi - 0.05]) k.rod('stainless', add([gx[0], y, gx[2]], lat, -0.035), add(C(y), lat, odS / 2 - 0.005), 0.012, 8)
}

/** typical: manway size for a shell ID (24" from 1.5 m, 20" from 1.0 m, 18" from 0.75 m, else a 12" handhole). */
export const manwayNps = (id: number) => (id >= 1.5 ? 24 : id >= 1.0 ? 20 : id >= 0.75 ? 18 : 12)

/** Handrail along an arc (azimuths a0 → a1) at radius r: posts ≤ 1.5 m, top and knee rails, optional toe plate. y may vary with azimuth. */
export function railArc(k: Kit, r: number, a0: number, a1: number, y: (a: number) => number, toe = true) {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 0.3))
  for (const h of [ACCESS.handrail.height, ACCESS.handrail.kneeRail]) {
    const pts: V3[] = []
    for (let j = 0; j <= n; j++) {
      const a = a0 + ((a1 - a0) * j) / n
      pts.push(at(a, r, y(a) + h))
    }
    k.tube('safetyYellow', pts, h > 1 ? 0.024 : 0.018, 8, 0.05)
  }
  const m = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / ACCESS.handrail.postSpacingMax))
  for (let j = 0; j <= m; j++) {
    const a = a0 + ((a1 - a0) * j) / m
    k.rod('safetyYellow', at(a, r, y(a)), at(a, r, y(a) + ACCESS.handrail.height), 0.024, 8)
  }
  if (toe) ringSector(k, 'safetyYellow', r - 0.003, r + 0.003, y(a0), y(a0) + ACCESS.handrail.toePlate, Math.min(a0, a1), Math.abs(a1 - a0), n)
}

/** API 526 spring-loaded PSV bolted onto an upward flange face: body, side outlet flange, bonnet, cap and lever. Returns the outlet face. */
export function reliefValve(k: Kit, face: V3, rating: Rating, orifice: Orifice, outDir: V3) {
  const s = psvDims(orifice, rating)
  const mate = add(face, [0, 1, 0], GASKET_T)
  const Lf = mateFlange(k, s.inletNps, s.inletRating, face, [0, 1, 0])[1] - mate[1]
  const yc = face[1] + s.centreToInlet
  const c: V3 = [face[0], yc, face[2]]
  const rb = Math.max(pipeOD(s.inletNps) * 0.8, 0.05)
  k.cyl('valveBody', pipeOD(s.inletNps) * 0.55, yc - mate[1] - Lf + 0.02, [face[0], (mate[1] + Lf + yc) / 2, face[2]], 'y', 20)
  k.sphere('valveBody', rb, c, undefined, 20)
  const out = add(c, outDir, s.centreToOutlet)
  const fo = flangeDims(s.outletNps, s.outletRating)
  const Lo = fo.hubLength + fo.raisedFaceHeight
  k.cyl('valveBody', pipeOD(s.outletNps) * 0.55, s.centreToOutlet - Lo + 0.01, add(c, outDir, (s.centreToOutlet - Lo) / 2), outDir, 20)
  flange(k, s.outletNps, s.outletRating, out, outDir)
  const top = face[1] + s.height
  k.cyl('valveBody', rb * 1.15, 0.04, [c[0], yc + rb * 0.9, c[2]], 'y', 20)
  k.cyl('actuatorRed', rb * 0.78, top - yc - rb - 0.12, [c[0], (yc + rb + top - 0.12) / 2, c[2]], 'y', 20, rb * 0.5)
  k.cyl('actuatorRed', rb * 0.45, 0.12, [c[0], top - 0.06, c[2]], 'y', 16)
  k.rod('handwheel', [c[0], top - 0.1, c[2]], add([c[0], top - 0.2, c[2]], outDir, -rb * 1.2), 0.008, 6)
  return out
}

/** Vertical-vessel internals: vane-type inlet distributor, mesh pad on a support ring, vortex breakers on bottom outlets. */
export function vInternals(k: Kit, o: { Ri: number; inlet?: { a: number; y: number; nps: number }; padY?: number; vortex?: V3[]; trays?: number[]; beds?: [number, number][] }) {
  const { Ri } = o
  if (o.inlet) {
    const od = pipeOD(o.inlet.nps)
    const f = dirOf(o.inlet.a + Math.PI)
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.inlet.a + Math.PI)
    const Ld = Ri * 1.3
    const h = od * 1.3
    const c = at(o.inlet.a, Ri - Ld / 2 - 0.02, o.inlet.y)
    for (const s of [-1, 1]) k.box('internalsSteel', [Ld, 0.008, od * 1.15], add(c, [0, 1, 0], (s * h) / 2), q)
    const lat: V3 = [-f[2], 0, f[0]]
    for (let j = 0; j < 6; j++) {
      const u = -Ld / 2 + Ld * (0.12 + 0.15 * j)
      for (const s of [-1, 1]) {
        const qq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s * 0.7))
        k.box('internalsSteel', [0.006, h, od * 0.45], add(add(c, f, u), lat, s * od * 0.5), qq)
      }
    }
  }
  if (o.padY !== undefined) {
    k.cyl('galvanised', Ri - 0.006, 0.15, [0, o.padY, 0], 'y', 48)
    ringSector(k, 'internalsSteel', Ri - 0.05, Ri - 0.001, o.padY - 0.09, o.padY - 0.075, 0, TAU, 48)
    for (const z of [-0.4, 0.4]) k.box('internalsSteel', [2 * Math.sqrt(Ri * Ri - (z * Ri) ** 2) - 0.01, 0.06, 0.01], [0, o.padY - 0.11, z * Ri])
  }
  for (const v of o.vortex ?? []) for (const r of [0, Math.PI / 2]) k.box('internalsSteel', [0.3, 0.15, 0.01], add(v, [0, 1, 0], 0.09), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r))
  for (const [ti, y] of (o.trays ?? []).entries()) {
    // sieve tray with a segmental downcomer, alternating sides
    const side = ti % 2 ? 1 : -1
    const cut = Ri * 0.7
    const sh = new THREE.Shape()
    const th = Math.acos(cut / Ri)
    sh.absarc(0, 0, Ri - 0.003, side > 0 ? th : Math.PI + th, side > 0 ? TAU - th : Math.PI - th + TAU, false)
    sh.closePath()
    k.extrude('internalsSteel', sh, 0.006, new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, y, 0), 24)
    k.box('internalsSteel', [0.006, 0.5, 2 * Ri * Math.sin(th) - 0.01], [side * cut, y - 0.22, 0])
  }
  for (const [y0, y1] of o.beds ?? []) {
    k.cyl('galvanised', Ri - 0.006, y1 - y0, [0, (y0 + y1) / 2, 0], 'y', 40)
    ringSector(k, 'internalsSteel', Ri - 0.06, Ri - 0.001, y0 - 0.03, y0, 0, TAU, 40)
    k.cyl('internalsSteel', Ri * 0.85, 0.06, [0, y1 + 0.35, 0], 'y', 32)
  }
}

/** Straight pipe from a to b as a skin with real branch openings (no solid run behind a branch) and a dark bore. */
export function pipeSkin(k: Kit, mat: MatKey, a: V3, b: V3, od: number, holes: Hole[] = [], seg = 40) {
  const A0 = V(a)
  const dir = V(b).sub(A0)
  const len = dir.length()
  const M = new THREE.Matrix4().compose(A0, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), new THREE.Vector3(1, 1, 1))
  const Mi = M.clone().invert()
  const local = holes.map((h): Hole => ({ p: V(h.p).applyMatrix4(Mi).toArray() as V3, d: V(h.d).transformDirection(Mi).toArray() as V3, r: h.r }))
  const sk = skinGeometry({ Ro: od / 2, bo: 0, e0: 0, e1: len, top: false, bottom: false, holes: local, seg })
  k.add(mat, sk.g.clone(), M)
  k.add('vesselInner', sk.g, M)
}

const GASKET_T = 0.0045

/** Through-studs with a nut at each end and a spiral-wound gasket for a joint whose first face is at `face`, pointing along d. */
export function jointBolts(k: Kit, nps: number, rating: Rating, face: V3, d: V3) {
  const f = flangeDims(nps, rating)
  gasket(k, nps, rating, add(face, d, GASKET_T / 2), d)
  const span = 2 * (f.thickness + f.raisedFaceHeight) + GASKET_T
  const len = span + f.boltDia * 3
  const start = add(face, d, -(f.thickness + f.raisedFaceHeight) - f.boltDia * 1.5)
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, start, d, f.boltDia, len, [f.boltDia * 0.95, len - f.boltDia * 0.95])
}

/** Mating weld-neck flange bolted to an existing face (gasket + through-studs). Returns the hub end, where the pipe continues. */
export function mateFlange(k: Kit, nps: number, rating: Rating, face: V3, d: V3, studs = true): V3 {
  const mate = add(face, d, GASKET_T)
  const Lf = flange(k, nps, rating, mate, [-d[0], -d[1], -d[2]])
  if (studs) jointBolts(k, nps, rating, face, d)
  return add(mate, d, Lf)
}

/** Largest standard NPS not above `nps` whose OD fits `maxOD` (keeps nozzles proportionate to small shells). */
export function capNps(nps: number, maxOD: number) {
  const sizes = [...NPS_SIZES].filter((s) => s <= nps).reverse()
  return sizes.find((s) => pipeOD(s) <= maxOD) ?? 0.5
}
