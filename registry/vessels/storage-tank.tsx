// API 650 atmospheric storage tank: one-foot-method shell courses, cone or dome roof, spiral stairway, roof handrail, manways, PV vent, wind girder, ringwall. API 650, API 2000.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { grating, manway, member, nozzle } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, stairFlight, type Rating } from '../lib/standards'
import { paint } from '../lib/materials'
import { textMaterial } from '../lib/textures'
import { TAU, at, deg, holeR, skinGeometry, type Hole, dirOf, earthBoss, phiOf, platform, projector, ringSector, seam, shellNozzle, smoothLathe, capNps } from './_vessel'

export interface StorageTankProps {
  /** shell diameter, m */
  diameter?: number
  /** shell height, m */
  height?: number
  roof?: 'cone' | 'dome'
  /** product identification band colour */
  productColor?: string
  inletNps?: number
  outletNps?: number
  drainNps?: number
  /** liquid specific gravity (sets the course thicknesses) */
  gravity?: number
  /** foam chambers and a shell cooling spray ring (NFPA 11 / NFPA 15) */
  fireProtection?: boolean
  tag?: string
}

export const defaults = {
  diameter: 12,
  height: 10,
  roof: 'cone' as 'cone' | 'dome',
  productColor: '#7A4A24',
  inletNps: 8,
  outletNps: 8,
  drainNps: 3,
  gravity: 0.9,
  fireProtection: true,
  tag: 'TK-100',
}

type P = typeof defaults

/** Nozzles kept in proportion to the shell (typical upper bounds). */
const fit = (p: P): P => ({ ...p, inletNps: capNps(p.inletNps, p.diameter * 0.08), outletNps: capNps(p.outletNps, p.diameter * 0.08), drainNps: capNps(p.drainNps, p.diameter * 0.04) })

const RATING: Rating = 150
const HF = 0.3 // ringwall height, typical
const A = { inlet: deg(215), outlet: deg(125), drain: deg(275), stair: deg(-62), mw1: deg(160), mw2: deg(250) }

function layout(p: P) {
  const D = p.diameter
  const R = D / 2
  const H = p.height
  const n = Math.max(1, Math.ceil(H / 2.4 - 0.01))
  const tMin = D < 15 ? 5 : D < 36 ? 6 : D < 60 ? 8 : 10
  // API 650 5.6.3 one-foot method: design (Sd 160 MPa, CA 1.5 mm) vs hydrotest (St 171 MPa), mm
  const courses = Array.from({ length: n }, (_, i) => {
    const y0 = i * 2.4
    const h = i === n - 1 ? H - y0 : 2.4
    const Hl = H - y0
    const td = (4.9 * D * (Hl - 0.3) * p.gravity) / 160 + 1.5
    const tt = (4.9 * D * (Hl - 0.3)) / 171
    const t = Math.max(tMin, Math.ceil(Math.max(td, tt))) / 1000
    return { y0: HF + y0, h, t, r: R + t }
  })
  const yTop = HF + H
  const Rb = courses[0].r
  const Rt = courses[n - 1].r
  const rise = p.roof === 'cone' ? (R + 0.05) / 6 : D - Math.sqrt(D * D - R * R) // cone 1:6; dome radius = D
  const roofY = (r: number) => (p.roof === 'cone' ? yTop + ((R - r) / (R + 0.05)) * rise : yTop + Math.sqrt(D * D - Math.min(r, R) ** 2) - Math.sqrt(D * D - R * R))
  const so = (nps: number) => nozzleStandout(nps, RATING)
  const noz = {
    inlet: { a: A.inlet, y: HF + 0.6, nps: p.inletNps },
    outlet: { a: A.outlet, y: HF + 0.5, nps: p.outletNps },
    drain: { a: A.drain, y: HF + 0.25, nps: p.drainNps },
  }
  const face = (k: keyof typeof noz) => at(noz[k].a, Rb + so(noz[k].nps), noz[k].y)
  return { R, H, D, courses, yTop, Rb, Rt, rise, roofY, so, noz, face }
}

export function ports(props: StorageTankProps = {}): Port[] {
  const p = fit({ ...defaults, ...props } as P)
  const L = layout(p)
  return [
    port('inlet', 'Inlet', L.face('inlet'), dirOf(A.inlet), p.inletNps, RATING),
    port('outlet', 'Outlet', L.face('outlet'), dirOf(A.outlet), p.outletNps, RATING),
    port('drain', 'Drain', L.face('drain'), dirOf(A.drain), p.drainNps, RATING, 'drain'),
  ]
}

export function StorageTank(props: StorageTankProps & GroupProps) {
  const { diameter, height, roof, productColor, inletNps, outletNps, drainNps, gravity, fireProtection, tag, ...group } = { ...defaults, ...props }
  const p = fit({ diameter, height, roof, productColor, inletNps, outletNps, drainNps, gravity, fireProtection, tag } as P)
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default StorageTank

function build(k: Kit, p: P) {
  const L = layout(p)
  const { R, courses, yTop, Rb, Rt, roofY } = L
  const m: MatKey = paint('#E6E7E2')
  const seg = 96

  // ringwall, annular bottom plate, shell courses with seams
  ringSector(k, 'concrete', R - 0.4, R + 0.45, 0, HF, 0, TAU, seg)
  k.cyl('concrete', R - 0.4, HF - 0.01, [0, (HF - 0.01) / 2, 0], 'y', seg)
  ringSector(k, 'equipmentPaintDark', 0, R + 0.065, HF, HF + 0.01, 0, TAU, seg)
  k.torus(m, Rb + 0.003, 0.008, [0, HF + 0.01, 0], 'y', 6, seg)
  const shellHoles: Hole[] = [
    ...(['inlet', 'outlet', 'drain'] as const).map((key): Hole => ({ p: at(L.noz[key].a, Rb, L.noz[key].y), d: dirOf(L.noz[key].a), r: holeR(L.noz[key].nps) })),
    ...[A.mw1, A.mw2].map((a): Hole => ({ p: at(a, Rb, HF + 0.75), d: dirOf(a), r: holeR(24) })),
  ]
  courses.forEach((c, i) => {
    if (i === 0) {
      const sk = skinGeometry({ Ro: c.r, bo: 0, e0: c.y0, e1: c.y0 + c.h, top: false, bottom: false, holes: shellHoles, seg })
      k.add(m, sk.g.clone())
      k.add('vesselInner', sk.g)
    } else {
      k.lathe(m, [[c.r, c.y0], [c.r, c.y0 + c.h]], [0, 0, 0], 'y', seg)
      k.lathe('vesselInner', [[c.r, c.y0], [c.r, c.y0 + c.h]], [0, 0, 0], 'y', seg)
    }
    if (i > 0) {
      const lo = courses[i - 1]
      k.lathe(m, [[lo.r, c.y0], [c.r, c.y0]], [0, 0, 0], 'y', seg)
      seam(k, m, Math.max(lo.r, c.r) - 0.001, c.y0, seg)
    }
    const nv = Math.max(3, Math.round((TAU * c.r) / 9.6))
    for (let j = 0; j < nv; j++) {
      const a = ((j + (i % 2) * 0.5) / nv) * TAU + 0.2
      k.box(m, [0.004, c.h - 0.03, 0.02], at(a, c.r + 0.0012, c.y0 + c.h / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
    }
  })
  // product band and tag stencil
  ringSector(k, paint(p.productColor), Rt - 0.001, Rt + 0.003, yTop - 1.1, yTop - 0.45, 0, TAU, seg)
  const c1 = courses[Math.min(1, courses.length - 1)]
  const sw = Math.min(6, R * 0.9)
  k.lathe(textMaterial(p.tag, '#E6E7E2', '#2a2d30', 1024, 192), [[c1.r + 0.004, c1.y0 + 0.5], [c1.r + 0.004, c1.y0 + 0.5 + sw * 0.1875]], [0, 0, 0], 'y', 24, phiOf(deg(230)) - sw / c1.r / 2, sw / c1.r)
  // top curb angle and intermediate wind girder (API 650 5.9.7: needed where H exceeds the stable height H1, V = 190 km/h)
  ringSector(k, m, Rt, Rt + 0.075, yTop - 0.008, yTop, 0, TAU, seg)
  ringSector(k, m, Rt + 0.067, Rt + 0.075, yTop - 0.075, yTop, 0, TAU, seg)
  const tTop = courses[courses.length - 1].t * 1000
  const H1 = 9.47 * tTop * Math.sqrt((tTop / L.D) ** 3)
  if (L.H > H1) {
    const yG = yTop - Math.min(H1, L.H / 2)
    const rg = courses.find((c) => yG >= c.y0 && yG <= c.y0 + c.h)?.r ?? Rb
    ringSector(k, m, rg, rg + 0.14, yG - 0.01, yG, 0, TAU, seg)
    ringSector(k, m, rg + 0.13, rg + 0.14, yG - 0.1, yG, 0, TAU, seg)
  }

  // roof: plate, crown ring, radial lap seams, rim fascia
  const prof: [number, number][] = []
  const nR = 28
  for (let i = 0; i <= nR; i++) {
    const r = (R + 0.05) * (1 - i / nR)
    prof.push([r, roofY(Math.min(r, R)) - (r > R ? 0.01 : 0)])
  }
  k.add(m, smoothLathe(prof, seg, 0, TAU, p.roof === 'cone' ? 5 : 30))
  k.add('vesselInner', smoothLathe(prof, seg, 0, TAU, p.roof === 'cone' ? 5 : 30))
  ringSector(k, m, R + 0.04, R + 0.05, yTop - 0.04, yTop, 0, TAU, seg)
  const rc = R * 0.18
  k.torus(m, rc, 0.006, [0, roofY(rc) + 0.004, 0], 'y', 6, 48)
  const nS = Math.max(8, Math.round((TAU * R) / 2.4))
  for (let j = 0; j < nS; j++) {
    const a = (j / nS) * TAU
    const pts: V3[] = []
    for (let i = 0; i <= 6; i++) {
      const r = rc + ((R - rc) * i) / 6
      pts.push(at(a, r, roofY(r) + 0.004))
    }
    k.tube(m, pts, 0.005, 4, 0.05)
  }

  // shell nozzles, manways, earth bosses
  const proj = projector('y', [0, HF + 1.2, 0], 1.2, Rb, 0)
  for (const key of ['inlet', 'outlet', 'drain'] as const) {
    const z = L.noz[key]
    shellNozzle(k, { base: at(z.a, Rb, z.y), dir: dirOf(z.a), nps: z.nps, rating: RATING, standout: L.so(z.nps), mat: m, proj, padT: 0.01 })
  }
  for (const a of [A.mw1, A.mw2]) manway(k, at(a, Rb, HF + 0.75), dirOf(a), 0.25, 24, RATING, m)
  for (let i = 0; i < 4; i++) earthBoss(k, m, at(deg(20) + (i * TAU) / 4, Rb, HF + 0.3), dirOf(deg(20) + (i * TAU) / 4))

  const top = stair(k, L, Rb)
  roofAccess(k, L, top, m, Rt)
  if (p.fireProtection) fire(k, L, top.aEnd, Rb, Rt)
}

/** Foam chambers with foam makers and risers, plus a cooling spray ring at the roof edge fed by its own riser. */
function fire(k: Kit, L: ReturnType<typeof layout>, aEnd: number, Rb: number, Rt: number) {
  const { yTop, D } = L
  const busy = [A.inlet, A.outlet, A.drain, A.mw1, A.mw2]
  const free0 = aEnd + 0.35
  const free1 = A.stair + TAU - 0.35
  const n = Math.max(2, Math.ceil((Math.PI * D) / 24))
  const pick = (f: number) => {
    let a = free0 + (free1 - free0) * f
    for (const b of busy) if (Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.18) a += 0.3
    return a
  }
  const riser = (a: number, y1: number, r: number) => {
    k.pipe('firewaterRed', at(a, r, 0.15), at(a, r, y1), pipeOD(4), 0.006)
    k.box('firewaterRed', [0.25, 0.3, 0.25], at(a, r, 0.15))
    for (let y = 1.5; y < y1 - 0.3; y += 2.4) k.box('galvanised', [r - Rb + 0.04, 0.05, 0.05], at(a, (r + Rb) / 2, y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
  }
  for (let i = 0; i < n; i++) {
    const a = pick((i + 0.5) / (n + 1))
    const d = dirOf(a)
    const c = at(a, Rt + 0.22, yTop - 0.45)
    k.cyl('firewaterRed', 0.16, 0.55, c, 'y', 20)
    k.dome('firewaterRed', 0.16, [c[0], c[1] + 0.275, c[2]], 'y', Math.PI / 2, 0.4, 20)
    k.box('firewaterRed', [0.06, 0.3, 0.22], at(a, Rt + 0.03, yTop - 0.45), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
    k.cyl('stainless', 0.06, 0.4, add(at(a, Rt + 0.55, yTop - 0.7), [0, 0, 0]), d, 16)
    k.pipe('firewaterRed', at(a, Rt + 0.22, yTop - 0.72), at(a, Rt + 0.35, yTop - 0.72), pipeOD(3), 0.005)
    riser(a, yTop - 0.72, Rt + 0.75)
    k.pipe('firewaterRed', at(a, Rt + 0.35, yTop - 0.72), at(a, Rt + 0.75, yTop - 0.72), pipeOD(4), 0.006)
  }
  // cooling ring at the shell top, spraying down the shell
  const rr = Rt + 0.1
  const yr = yTop + 0.12
  const ring: V3[] = []
  for (let i = 0; i <= 96; i++) ring.push(at((i / 96) * TAU, rr, yr))
  k.tube('firewaterRed', ring, pipeOD(3) / 2, 10, 0.2)
  const ns = Math.ceil((TAU * rr) / 1.5)
  for (let i = 0; i < ns; i++) {
    const a = (i / ns) * TAU
    k.cyl('brass', 0.016, 0.06, at(a, rr + 0.04, yr - 0.02), dirOf(a), 8)
    if (i % 2 === 0) k.box('galvanised', [0.03, 0.12, 0.03], at(a, rr, yr - 0.08))
  }
  const ar = pick(0.97)
  riser(ar, yr, Rt + 0.75)
  k.pipe('firewaterRed', at(ar, rr, yr), at(ar, Rt + 0.75, yr), pipeOD(4), 0.006)
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** Spiral stairway around the shell from grade to the roof edge landing (API 650 5.8.10: ≤ 50°, handrail on the open side). */
function stair(k: Kit, L: ReturnType<typeof layout>, Rb: number) {
  const rIn = Rb + 0.15
  const w = 0.8
  const rO = rIn + w
  const rC = rIn + w / 2
  const f = stairFlight(L.yTop, 42)
  const da = f.going / rC
  const slope = f.riser / da // m of rise per radian
  const a0 = A.stair
  const yAt = (a: number) => (a - a0) * slope
  for (let i = 1; i < f.steps; i++) {
    const a = a0 + (i - 0.5) * da
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    k.at(at(a, rC, i * f.riser), q, () => grating(k, [0, 0, 0], w - 0.04, f.going + 0.02))
  }
  const aEnd = a0 + (f.steps - 1) * da
  const aFoot = a0 + 0.2 / slope
  for (const r of [rIn, rO]) {
    const n = Math.max(4, Math.ceil(((aEnd - aFoot) * r) / 1.0))
    for (let j = 0; j < n; j++) {
      const s = aFoot + ((aEnd - aFoot) * j) / n
      const e = aFoot + ((aEnd - aFoot) * (j + 1)) / n
      member(k, at(s, r + (r === rIn ? -0.04 : 0.04), yAt(s) - 0.02), at(e, r + (r === rIn ? -0.04 : 0.04), yAt(e) - 0.02), 'UPN 200', 'galvanised')
    }
    k.box('galvanised', [0.25, 0.015, 0.2], at(aFoot, r, 0.008))
  }
  // open-side handrail
  const rr = rO + 0.08
  const n = Math.max(6, Math.ceil(((aEnd - aFoot) * rr) / 0.4))
  for (const h of [1.0, 0.5]) {
    const pts: V3[] = []
    for (let j = 0; j <= n; j++) {
      const a = aFoot + ((aEnd - aFoot) * j) / n
      pts.push(at(a, rr, yAt(a) + h + 0.08))
    }
    k.tube('safetyYellow', pts, h > 0.9 ? 0.024 : 0.018, 8, 0.05)
  }
  const np = Math.ceil(((aEnd - aFoot) * rr) / 1.4)
  for (let j = 0; j <= np; j++) {
    const a = aFoot + ((aEnd - aFoot) * j) / np
    k.rod('safetyYellow', at(a, rr, yAt(a) + 0.04), at(a, rr, yAt(a) + 1.08), 0.024, 8)
    k.box('galvanised', [0.1, 0.08, 0.012], at(a, rr - 0.04, yAt(a) + 0.06), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a))
  }
  // shell brackets: cantilever + knee brace
  const nb = Math.ceil(((aEnd - aFoot) * rC) / 2.2)
  for (let j = 1; j <= nb; j++) {
    const a = aFoot + ((aEnd - aFoot) * j) / (nb + 0.3)
    const y = yAt(a) - 0.2
    member(k, at(a, Rb, y), at(a, rO + 0.04, y), 'L75x75x8', 'galvanised')
    if (y > 1.1) member(k, at(a, Rb, y - 0.9), at(a, rO - 0.05, y - 0.05), 'L60x60x6', 'galvanised')
  }
  return { aEnd, rIn, w, rC }
}

/** Roof-edge landing, perimeter roof handrail with an opening, gauge hatch, radar gauge, PV vent and roof manway. */
function roofAccess(k: Kit, L: ReturnType<typeof layout>, s: { aEnd: number; rIn: number; w: number; rC: number }, m: MatKey, Rt: number) {
  const { R, yTop, roofY } = L
  const aL1 = s.aEnd + 1.4 / s.rC
  platform(k, { y: yTop, shellR: Rt, rIn: s.rIn, width: s.w, a0: s.aEnd, a1: aL1, open: ['a0'] })
  const aM = (s.aEnd + aL1) / 2
  const rh = R - 0.25
  const gap = 0.55 / rh
  const span = TAU - 2 * gap
  const n = Math.ceil((span * rh) / 0.35)
  for (const h of [1.1, 0.5]) {
    const pts: V3[] = []
    for (let j = 0; j <= n; j++) {
      const a = aM + gap + (span * j) / n
      pts.push(at(a, rh, roofY(rh) + h))
    }
    k.tube('safetyYellow', pts, h > 1 ? 0.024 : 0.018, 8, 0.05)
  }
  const np = Math.ceil((span * rh) / 1.5)
  for (let j = 0; j <= np; j++) {
    const a = aM + gap + (span * j) / np
    k.rod('safetyYellow', at(a, rh, roofY(rh)), at(a, rh, roofY(rh) + 1.1), 0.024, 8)
    k.box('safetyYellow', [0.1, 0.012, 0.1], at(a, rh, roofY(rh) + 0.006))
  }
  // roof walkway grating from the landing to the gauge hatch
  const rG = R - 1.1
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), aM)
  k.at(at(aM, (R + rG) / 2 - 0.2, roofY((R + rG) / 2) + 0.06), q, () => grating(k, [0, 0, 0], R - rG + 0.4, 0.7))
  const vert = (a: number, r: number, nps: number, standout: number, blind = false) =>
    nozzle(k, { base: at(a, r, roofY(r)), dir: [0, 1, 0], nps, rating: RATING, standout, mat: m, blind })
  // gauge hatch with hinged lid
  const gh = vert(aM + 0.6 / rG, rG, 8, 0.2)
  k.cyl('aluminium', 0.17, 0.03, [gh[0], gh[1] + 0.02, gh[2]], 'y', 24)
  k.rod('aluminium', [gh[0] - 0.12, gh[1] + 0.05, gh[2]], [gh[0] + 0.12, gh[1] + 0.05, gh[2]], 0.01, 6)
  // radar level transmitter
  const rl = vert(aM - 0.6 / rG, rG, 4, 0.2, true)
  k.cyl('stainless', 0.04, 0.12, [rl[0], rl[1] + 0.09, rl[2]], 'y', 16)
  k.rbox('actuatorBlue', [0.16, 0.14, 0.14], 0.03, [rl[0], rl[1] + 0.22, rl[2]])
  // PV (breather) valve per API 2000
  const rv = R * 0.35
  const pv = vert(aM + 0.5, rv, 6, 0.3)
  k.cyl('aluminium', 0.12, 0.3, [pv[0], pv[1] + 0.16, pv[2]], 'y', 24)
  k.cyl('aluminium', 0.2, 0.025, [pv[0], pv[1] + 0.33, pv[2]], 'y', 28)
  k.dome('aluminium', 0.2, [pv[0], pv[1] + 0.34, pv[2]], 'y', Math.PI / 2, 0.35, 28)
  const dv = dirOf(aM + 0.5 + Math.PI / 2)
  k.cyl('aluminium', 0.08, 0.22, [pv[0] + dv[0] * 0.2, pv[1] + 0.12, pv[2] + dv[2] * 0.2], dv, 20)
  k.cyl('aluminium', 0.12, 0.02, [pv[0] + dv[0] * 0.32, pv[1] + 0.12, pv[2] + dv[2] * 0.32], dv, 24)
  // emergency vent and roof manway
  const ev = vert(aM - 0.5, rv, 20, 0.25)
  k.cyl('aluminium', 0.36, 0.05, [ev[0], ev[1] + 0.06, ev[2]], 'y', 32)
  k.dome('aluminium', 0.34, [ev[0], ev[1] + 0.08, ev[2]], 'y', Math.PI / 2, 0.25, 32)
  manway(k, at(aM + Math.PI, R * 0.6, roofY(R * 0.6)), [0, 1, 0], 0.25, 24, RATING, m)
}
