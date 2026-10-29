// LPG pressure sphere on equator legs: UG-27(d) shell, orange-peel plate seams, tie-rod bracing with turnbuckles, fireproofed legs, stair + curved stair to the top platform, twin PSVs, deluge ring. ASME VIII-1, API 2510.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, grating, manway, member, nozzle, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { ACCESS, flange as flangeDims, nozzleStandout, pipeOD, psv, type Rating } from '../lib/standards'
import { paint } from '../lib/materials'
import { gratingMaterial } from '../lib/textures'
import { TAU, add, at, deg, dirOf, earthBoss, holeR, mateFlange, pipeSkin, railArc, reliefValve, skinGeometry, type Hole } from './_vessel'

export interface SphericalTankProps {
  /** inside diameter, m */
  diameter?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  inletNps?: number
  outletNps?: number
  /** relief header size */
  psvNps?: number
  /** number of legs (0 = by diameter) */
  legs?: number
  fireproofing?: boolean
  deluge?: boolean
  tag?: string
}

export const defaults = {
  diameter: 14,
  pressure: 17,
  rating: 300 as Rating,
  inletNps: 6,
  outletNps: 6,
  psvNps: 6,
  legs: 0,
  fireproofing: true,
  deluge: true,
  tag: 'TK-500',
}

type P = typeof defaults

const A = { stair: deg(-65), riser: deg(200), inlet: deg(30), outlet: deg(210), psvX: 0 }

function layout(p: P) {
  const Ri = p.diameter / 2
  // UG-27(d) sphere: t = PR/(2SE − 0.2P) + CA, SA-537 Cl.1 S ≈ 138 MPa, CA 3 mm (typical)
  const P = p.pressure * 0.1
  const t = Math.ceil(((P * (Ri + 0.003)) / (2 * 138 - 0.2 * P) + 0.003) * 1000) / 1000
  const Ro = Ri + t
  const yc = Ro + 1.9 // bottom clearance for the outlet piping, typical
  const nLeg = p.legs > 0 ? Math.round(p.legs) : p.diameter < 10 ? 6 : p.diameter < 15 ? 8 : p.diameter < 19 ? 10 : 12
  const legOD = Math.min(0.9, Math.max(0.32, p.diameter * 0.036))
  const so = (nps: number) => nozzleStandout(nps, p.rating)
  const bot = (r: number) => yc - Math.sqrt(Ro * Ro - r * r)
  const top = (r: number) => yc + Math.sqrt(Ro * Ro - r * r)
  const rN = Math.min(1.4, Ro * 0.2)
  const inlet = { base: at(A.inlet, rN, bot(rN)), nps: p.inletNps }
  const outlet = { base: at(A.outlet, rN, bot(rN)), nps: p.outletNps }
  const psvR = 0.75
  const yP = top(1.0) + 0.15 // top platform floor
  const rP = Math.min(2.5, Math.max(1.8, Ro * 0.32)) // top platform outer radius, typical
  return { Ri, t, Ro, yc, nLeg, legOD, so, bot, top, inlet, outlet, psvR, yP, rP }
}

function relief(p: P, L: ReturnType<typeof layout>) {
  const faces = [-1, 1].map((s) => [s * L.psvR, L.top(L.psvR) + L.so(3), 0] as V3)
  const hz = 0.42
  const yH = faces[0][1] + psv('J', p.rating).centreToInlet
  const end: V3 = [L.psvR + 0.75, yH, hz]
  return { faces, hz, yH, end }
}

export function ports(props: SphericalTankProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const L = layout(p)
  const r = relief(p, L)
  return [
    port('inlet', 'Inlet', add(L.inlet.base, [0, -1, 0], L.so(p.inletNps)), [0, -1, 0], p.inletNps, p.rating),
    port('outlet', 'Outlet', add(L.outlet.base, [0, -1, 0], L.so(p.outletNps)), [0, -1, 0], p.outletNps, p.rating),
    port('psv', 'Relief header', r.end, [1, 0, 0], p.psvNps, 150, 'relief'),
  ]
}

export function SphericalTank(props: SphericalTankProps & GroupProps) {
  const { diameter, pressure, rating, inletNps, outletNps, psvNps, legs, fireproofing, deluge, tag, ...group } = { ...defaults, ...props }
  const p = { diameter, pressure, rating, inletNps, outletNps, psvNps, legs, fireproofing, deluge, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SphericalTank

function build(k: Kit, p: P) {
  const L = layout(p)
  const { Ro, yc, so } = L
  const m: MatKey = paint('#E6E7E2')
  const R = relief(p, L)
  const radar = at(deg(90), 0.75, L.top(0.75))
  const holes: Hole[] = [
    { p: [0, yc + Ro, 0], d: [0, 1, 0], r: holeR(24) },
    { p: [0, yc - Ro, 0], d: [0, -1, 0], r: holeR(24) },
    { p: L.inlet.base, d: [0, -1, 0], r: holeR(p.inletNps) },
    { p: L.outlet.base, d: [0, -1, 0], r: holeR(p.outletNps) },
    ...R.faces.map((f): Hole => ({ p: [f[0], L.top(L.psvR), 0], d: [0, 1, 0], r: holeR(3) })),
    { p: radar, d: [0, 1, 0], r: holeR(4) },
  ]
  // sphere = zero-length cylinder with hemispherical heads
  const sk = skinGeometry({ Ro, bo: Ro, e0: yc, e1: yc, holes, seg: 96 })
  k.add(m, sk.g.clone(), sk.M)
  k.add('vesselInner', sk.g, sk.M)
  // orange-peel seams: equator band, temperate bands, polar caps
  const lat = [-55, -22, 22, 55].map(deg)
  for (const f of lat) k.torus(m, Ro * Math.cos(f) + 0.002, 0.005, [0, yc + Ro * Math.sin(f), 0], 'y', 6, 96)
  const meridians = (n: number, f0: number, f1: number, phase: number) => {
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * TAU
      const pts: V3[] = []
      for (let j = 0; j <= 8; j++) {
        const f = f0 + ((f1 - f0) * j) / 8
        pts.push(at(a, (Ro + 0.002) * Math.cos(f), yc + (Ro + 0.002) * Math.sin(f)))
      }
      k.tube(m, pts, 0.005, 4, 0.05)
    }
  }
  meridians(L.nLeg * 2, lat[1], lat[2], 0.13)
  meridians(L.nLeg, lat[2], lat[3], 0.4)
  meridians(L.nLeg, lat[0], lat[1], 0.4)

  legsAndBracing(k, p, L, m)

  // nozzles, manways, instruments
  manway(k, [0, yc + Ro, 0], [0, 1, 0], 0.3, 24, Math.min(p.rating, 600) as Rating, m)
  manway(k, [0, yc - Ro, 0], [0, -1, 0], 0.3, 24, Math.min(p.rating, 600) as Rating, m)
  for (const z of [L.inlet, L.outlet]) nozzle(k, { base: z.base, dir: [0, -1, 0], nps: z.nps, rating: p.rating, standout: so(z.nps), mat: m })
  const rf = nozzle(k, { base: radar, dir: [0, 1, 0], nps: 4, rating: p.rating, standout: so(4), mat: m, blind: true })
  k.cyl('stainless', 0.04, 0.14, add(rf, [0, 1, 0], 0.1), 'y', 16)
  k.rbox('actuatorBlue', [0.17, 0.15, 0.15], 0.03, add(rf, [0, 1, 0], 0.25))

  // twin PSVs into a relief header (branches open into the header bore)
  const on = psv('J', p.rating).outletNps
  const hR = pipeOD(p.psvNps) / 2
  for (const f of R.faces) {
    nozzle(k, { base: [f[0], L.top(L.psvR), 0], dir: [0, 1, 0], nps: 3, rating: p.rating, standout: so(3), mat: m, studs: false })
    const out = reliefValve(k, f, p.rating, 'J', [0, 0, 1])
    const hub = mateFlange(k, on, 150, out, [0, 0, 1])
    k.pipe('pipePaint', hub, [out[0], out[1], R.hz - hR * 0.6], pipeOD(on), 0.006)
  }
  const x0 = -L.psvR - 0.25
  const fe = flangeDims(p.psvNps, 150)
  pipeSkin(k, 'pipePaint', [x0, R.yH, R.hz], [R.end[0] - fe.hubLength - fe.raisedFaceHeight, R.yH, R.hz], 2 * hR, R.faces.map((f): Hole => ({ p: [f[0], R.yH, R.hz - hR], d: [0, 0, -1], r: pipeOD(on) / 2 - 0.004 })))
  k.dome('pipePaint', hR, [x0, R.yH, R.hz], '-x', Math.PI / 2, 0.5, 20)
  k.dome('vesselInner', hR, [x0, R.yH, R.hz], '-x', Math.PI / 2, 0.5, 20)
  flange(k, p.psvNps, 150, R.end, [1, 0, 0], true)

  topPlatform(k, L)
  stair(k, L)
  if (p.deluge) delugeRing(k, L)
  // nameplate on the stair-side leg
  const a0 = (Math.round(A.stair / (TAU / L.nLeg)) * TAU) / L.nLeg
  const lp = at(a0, Ro + L.legOD / 2 + (p.fireproofing ? 0.06 : 0) + 0.01, 1.6)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dirOf(a0)))
  k.box('nameplate', [0.34, 0.22, 0.004], lp, q)
  tagPlate(k, p.tag, add(lp, dirOf(a0), 0.003), dirOf(a0), 0.3)
}

/** Equator legs (tangent columns), concrete fireproofing, pedestals and base plates, diagonal tie rods with turnbuckles. */
function legsAndBracing(k: Kit, p: P, L: ReturnType<typeof layout>, m: MatKey) {
  const { Ro, yc, nLeg, legOD } = L
  const r = legOD / 2
  const yTop = yc + legOD * 0.8
  const hp = 0.35
  for (let i = 0; i < nLeg; i++) {
    const a = (i / nLeg) * TAU
    const c = at(a, Ro, 0)
    k.box('concrete', [legOD * 2.2, hp, legOD * 2.2], [c[0], hp / 2, c[2]])
    k.box('equipmentPaintDark', [legOD * 1.7, 0.03, legOD * 1.7], [c[0], hp + 0.015, c[2]])
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const b: V3 = [c[0] + dx * legOD * 0.65, hp + 0.03, c[2] + dz * legOD * 0.65]
      k.rod('nut', b, add(b, [0, 1, 0], 0.09), 0.016, 8)
      k.hex('nut', 0.05, 0.03, add(b, [0, 1, 0], 0.03))
    }
    k.cyl(m, r, yTop - hp - 0.03, [c[0], (yTop + hp + 0.03) / 2, c[2]], 'y', 28)
    k.cyl(m, r + 0.01, 0.02, [c[0], yTop, c[2]], 'y', 28)
    if (p.fireproofing) k.cyl('concrete', r + 0.06, yc - 1.0 - hp - 0.05, [c[0], (yc - 1.0 + hp + 0.05) / 2, c[2]], 'y', 28)
    earthBoss(k, m, at(a, Ro + r + (p.fireproofing ? 0.06 : 0), 0.65), dirOf(a))
  }
  // bracing between neighbouring legs, rods offset so they pass each other
  const yHi = yc - 1.5
  const yLo = hp + 0.9
  for (let i = 0; i < nLeg; i++) {
    const a0 = (i / nLeg) * TAU
    const a1 = ((i + 1) / nLeg) * TAU
    const rr = Ro + r * 0.2
    for (const [s, ya, yb] of [[-1, yHi, yLo], [1, yLo, yHi]] as const) {
      const pa = at(a0, rr + s * 0.05, ya)
      const pb = at(a1, rr + s * 0.05, yb)
      k.rod('galvanised', pa, pb, 0.022, 8)
      const tb = [pa, pb].map((q) => q) as [V3, V3]
      const mid = (f: number): V3 => [tb[0][0] + (tb[1][0] - tb[0][0]) * f, tb[0][1] + (tb[1][1] - tb[0][1]) * f, tb[0][2] + (tb[1][2] - tb[0][2]) * f]
      const d: V3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
      k.cyl('galvanised', 0.04, 0.32, mid(0.3), d, 10)
      for (const f of [0, 1]) {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f ? a1 : a0)
        k.box('galvanised', [0.03, 0.22, r * 1.4], add(f ? pb : pa, [0, 0, 0]), q)
      }
    }
  }
}

/** Annular top platform around the polar nozzles on stools, with handrail and a stair opening. */
function topPlatform(k: Kit, L: ReturnType<typeof layout>) {
  const rIn = 1.05
  const rOut = L.rP
  const y = L.yP
  const ring = new THREE.RingGeometry(rIn, rOut, 64, 1)
  ring.rotateX(-Math.PI / 2)
  const pp = ring.getAttribute('position') as THREE.BufferAttribute
  const uv = ring.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pp.getX(i) / 0.3, pp.getZ(i) / 0.3)
  k.add(gratingMaterial(), ring, new THREE.Matrix4().makeTranslation(0, y, 0))
  for (const r of [rIn, rOut - 0.008]) k.lathe('galvanised', [[r + 0.008, y - 0.1], [r + 0.008, y], [r, y], [r, y - 0.1], [r + 0.008, y - 0.1]], [0, 0, 0], 'y', 64)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU
    for (const r of [rIn + 0.1, rOut - 0.15]) k.rod('galvanised', at(a, r, y - 0.05), at(a, r, L.top(r) - 0.03), 0.03, 8)
    member(k, at(a, rIn, y - 0.06), at(a, rOut, y - 0.06), 'UPN 100', 'galvanised')
  }
  const gap = 0.45 / rOut
  railArc(k, rOut - 0.03, A.stair + gap, A.stair + TAU - gap, () => y)
  railArc(k, rIn + 0.03, 0, TAU, () => y, false)
}

/** Straight 45° stair tangent to the shell at 45° latitude, continuing as a curved stair over the shell to the top platform. */
function stair(k: Kit, L: ReturnType<typeof layout>) {
  const { Ro, yc } = L
  const off = 0.45
  const Rs = Ro + off
  const w = 0.8
  const a = A.stair
  const d = dirOf(a)
  const lat: V3 = [-d[2], 0, d[0]]
  const pt = (r: number, y: number, s = 0): V3 => add(add([0, y, 0], d, r), lat, s)
  const f0 = deg(45)
  const P0 = { r: Rs * Math.cos(f0), y: yc + Rs * Math.sin(f0) }
  const riser = 0.2
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
  // straight 45° flights with 1 m landings at most every 3 m of rise (ISO 14122-3), from P0 back down to grade
  const nF = Math.ceil(P0.y / ACCESS.stair.landingEvery)
  const hF = P0.y / nF
  const steps = Math.max(2, Math.round(hF / riser))
  const rs = hF / steps
  const side = (s: number) => (s * (w + 0.1)) / 2
  for (let j = 0; j < nF; j++) {
    const rTop = P0.r + j * (hF + 1.0)
    const yTop = P0.y - j * hF
    const rBot = rTop + hF
    const yBot = yTop - hF
    for (let i = 1; i < steps; i++) k.at(pt(rBot - (i - 0.5) * rs, yBot + i * rs), q, () => grating(k, [0, 0, 0], rs + 0.03, w - 0.04))
    for (const s of [-1, 1]) {
      member(k, pt(rBot + 0.05, yBot + 0.02, (s * w) / 2), pt(rTop, yTop - 0.12, (s * w) / 2), 'UPN 200', 'galvanised', [-d[0], 1, -d[2]])
      for (const h of [1.0, 0.5]) k.rod('safetyYellow', pt(rBot, yBot + h, side(s)), pt(rTop, yTop + h, side(s)), h > 0.9 ? 0.024 : 0.018, 8)
      for (const f of [0, 0.5, 1]) k.rod('safetyYellow', pt(rBot - hF * f, yBot + hF * f, side(s)), pt(rBot - hF * f, yBot + hF * f + 1.0, side(s)), 0.024, 8)
    }
    if (j < nF - 1) {
      // landing below this flight, on two posts
      k.at(pt(rBot + 0.5, yBot), q, () => grating(k, [0, 0, 0], 1.0, w))
      for (const s of [-1, 1]) {
        member(k, pt(rBot, yBot - 0.1, (s * w) / 2), pt(rBot + 1.0, yBot - 0.1, (s * w) / 2), 'UPN 200', 'galvanised')
        member(k, pt(rBot + 0.95, 0, (s * w) / 2), pt(rBot + 0.95, yBot - 0.2, (s * w) / 2), 'HEA 140', 'galvanised')
        for (const h of [1.0, 0.5]) k.rod('safetyYellow', pt(rBot, yBot + h, side(s)), pt(rBot + 1.0, yBot + h, side(s)), h > 0.9 ? 0.024 : 0.018, 8)
        k.rod('safetyYellow', pt(rBot + 1.0, yBot, side(s)), pt(rBot + 1.0, yBot + 1.0, side(s)), 0.024, 8)
      }
    }
  }
  // curved flight over the shell (treads at constant rise; they lengthen as the shell flattens)
  const yEnd = L.yP
  let y = P0.y
  const path: { r: number; y: number }[] = [P0]
  while (y + riser <= yEnd + 1e-6) {
    y += riser
    const f = Math.asin(Math.min(1, (y - yc) / Rs))
    const r = Rs * Math.cos(f)
    if (r < L.rP - 0.05) break
    const prev = path[path.length - 1]
    k.at(pt((r + prev.r) / 2, y), q, () => grating(k, [0, 0, 0], prev.r - r + 0.03, w - 0.04))
    path.push({ r, y })
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < path.length - 1; i += 2) {
      const j = Math.min(i + 2, path.length - 1)
      member(k, pt(path[i].r, path[i].y - 0.1, (s * w) / 2), pt(path[j].r, path[j].y - 0.1, (s * w) / 2), 'UPN 160', 'galvanised')
      const sr = path[i].r - 0.02
      const sy = path[i].y - 0.18
      const f = Math.atan2(sy - yc, sr)
      k.rod('galvanised', pt(sr, sy, (s * w) / 2), pt(Ro * Math.cos(f), yc + Ro * Math.sin(f), (s * w) / 2), 0.025, 8)
    }
    const rail = (h: number): V3[] => path.map((c) => pt(c.r, c.y + h, (s * (w + 0.1)) / 2))
    k.tube('safetyYellow', rail(1.0), 0.024, 8, 0.1)
    k.tube('safetyYellow', rail(0.5), 0.018, 8, 0.1)
    for (let i = 0; i < path.length; i += 4) k.rod('safetyYellow', pt(path[i].r, path[i].y, (s * (w + 0.1)) / 2), pt(path[i].r, path[i].y + 1.0, (s * (w + 0.1)) / 2), 0.024, 8)
  }
}

/** Firewater riser up a leg and over the shell to a spray ring round the top platform. */
function delugeRing(k: Kit, L: ReturnType<typeof layout>) {
  const { Ro, yc } = L
  const a = A.riser
  const pts: V3[] = [at(a, Ro + 0.65, 0.3), at(a, Ro + 0.65, yc)]
  for (let i = 1; i <= 10; i++) {
    const f = (deg(68) * i) / 10
    pts.push(at(a, (Ro + 0.65) * Math.cos(f), yc + (Ro + 0.3) * Math.sin(f) + 0.35 * Math.cos(f)))
  }
  const rr = L.rP + 0.3
  const yr = L.top(rr) + 0.25
  pts.push(at(a, rr, yr))
  k.tube('firewaterRed', pts, pipeOD(4) / 2, 12, 0.5)
  const ring: V3[] = []
  for (let i = 0; i <= 64; i++) ring.push(at(a + (i / 64) * TAU, rr, yr))
  k.tube('firewaterRed', ring, pipeOD(3) / 2, 10, 0.1)
  for (let i = 0; i < 16; i++) {
    const b = a + (i / 16) * TAU + TAU / 32
    const p0 = at(b, rr, yr - pipeOD(3) / 2)
    k.cyl('brass', 0.018, 0.06, add(p0, [0, -1, 0], 0.03), 'y', 8)
    const s = at(b, rr, L.top(rr))
    k.rod('galvanised', [s[0], s[1], s[2]], [p0[0], p0[1], p0[2]], 0.012, 6)
  }
  k.box('firewaterRed', [0.2, 0.3, 0.2], at(a, Ro + 0.65, 0.15))
}
