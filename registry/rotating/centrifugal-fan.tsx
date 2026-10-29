// Belt-driven SWSI centrifugal fan (AMCA arrangement 9 style): scroll housing, inlet bellmouth, pillow-block bearings, V-belt drive under a guard, IEC motor, spring isolators.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, uvScale, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { liftingLug, member, motor, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, type RotorSpec } from '../lib/rotors'
import { meshGuardMaterial } from '../lib/textures'
import { anchorBolt, castExtrude, clamp, motorEnvelope, voluteShape } from './_pumps'

export type FanOutlet = 'up' | 'horizontal'

export interface CentrifugalFanProps {
  /** impeller diameter, m */
  wheelDiameter?: number
  /** motor rated power, kW */
  kw?: number
  outlet?: FanOutlet
  /** flexible duct connectors with companion flanges at inlet and outlet */
  flexible?: boolean
  color?: string
  tag?: string
  running?: boolean
}

export const defaults = {
  wheelDiameter: 0.8,
  kw: 15,
  outlet: 'up' as FanOutlet,
  flexible: true,
  color: '#8f9a9e',
  running: true,
}

type P = Omit<typeof defaults, 'running'> & { tag?: string }

const ISO = 0.16 // spring isolator height
const FRAME = 'UPN 140'

function layout(p: P) {
  const D = clamp(p.wheelDiameter, 0.3, 2.5)
  const r0 = D * 0.54
  const r1 = D * 0.88
  const out = D * 0.95
  const W = D * 0.62 // housing width (SWSI)
  const Di = D * 0.72 // inlet diameter
  const Lin = 0.08 + D * 0.2
  const hb = ISO + 0.14 + 0.008 // base frame top
  const ys = hb + r1 + 0.08
  const xh = 0
  const xIn = xh + W / 2 + Lin
  const xP = xh - W / 2 - 0.25 - D * 0.35 // pulley plane
  const m = motorEnvelope(clamp(p.kw, 0.37, 400), 4)
  const zM = r1 * 0.75 + m.R + 0.2
  const ysM = hb + m.H
  const xMf = xP + 0.12 + m.R * 0.2 // motor DE face (motor faces -X)
  const x0 = xP - 0.18
  const x1 = Math.max(xIn, xMf + m.L + Math.max(0.12, m.R * 0.6)) + 0.1
  const z0 = -r1 - 0.12
  const z1 = zM + m.R + 0.25
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const oa = r1 - r0
  // outlet face centre and direction in the unshifted frame
  const outC: V3 = p.outlet === 'up' ? [xh, ys + out, -(r0 + r1) / 2] : [xh, ys + (r0 + r1) / 2, out]
  const outD: V3 = p.outlet === 'up' ? [0, 1, 0] : [0, 0, 1]
  return { D, r0, r1, out, W, Di, Lin, hb, ys, xh, xIn, xP, m, zM, ysM, xMf, x0, x1, z0, z1, cx, cz, oa, outC, outD }
}

const flangeOut = 0.035 // duct companion-angle flange depth
const FLEX = 0.12 // flexible connector length, typical
const ext = (p: { flexible?: boolean }) => flangeOut + (p.flexible ? FLEX + flangeOut : 0)

// equivalent round duct diameter of a rectangle (ASHRAE), in inches
const ductNps = (a: number, b: number) => Math.round((1.3 * Math.pow(a * b, 0.625)) / Math.pow(a + b, 0.25) / 0.0254)

export function ports(props: CentrifugalFanProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const L = layout(p)
  const o = L.outC
  const d = L.outD
  return [
    port('inlet', 'Inlet', [L.xIn + ext(p) - L.cx, L.ys, -L.cz], [1, 0, 0], Math.round(L.Di / 0.0254), undefined, 'utility'),
    port('outlet', 'Outlet', [o[0] - L.cx + d[0] * ext(p), o[1] + d[1] * ext(p), o[2] - L.cz + d[2] * ext(p)], d, ductNps(L.oa, L.W), undefined, 'utility'),
  ]
}

export function CentrifugalFan({ tag, ...rest }: CentrifugalFanProps & GroupProps) {
  const { wheelDiameter, kw, outlet, flexible, color, running, ...group } = { ...defaults, ...rest }
  const { built, rotors } = useMemo(() => build({ wheelDiameter, kw, outlet, flexible, color, tag }), [wheelDiameter, kw, outlet, flexible, color, tag])
  useEffect(() => () => [built, ...rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [built, rotors])
  return (
    <group {...group}>
      <KitMesh data={built} />
      <Rotors rotors={rotors} running={running} />
    </group>
  )
}

export default CentrifugalFan

function build(p: P) {
  const k = new Kit()
  const L = layout(p)
  const rotors: RotorSpec[] = []
  k.at([-L.cx, 0, -L.cz], undefined, () => draw(k, p, L, rotors))
  for (const r of rotors) r.pos = [r.pos[0] - L.cx, r.pos[1], r.pos[2] - L.cz]
  return { built: k.build(), rotors }
}

function draw(k: Kit, p: P, L: ReturnType<typeof layout>, rotors: RotorSpec[]) {
  const H: MatKey = paint(p.color, { metalness: 0.4, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, weather: 0.8 })
  const { D, r0, r1, out, W, Di, Lin, hb, ys, xh, xIn, xP, m, zM, ysM, xMf, x0, x1, z0, z1, oa } = L
  const up = p.outlet === 'up'

  // scroll: wrapper + flanged side sheets
  const u = up ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0)
  const v = up ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
  const basis = (x: number) => new THREE.Matrix4().makeBasis(u, v, new THREE.Vector3().crossVectors(u, v)).setPosition(x, ys, 0)
  // hollow wrapper band (open at the outlet end), then side sheets: inlet side with the eye cut out
  const t = 0.006
  const band = scrollBand(r0, r1, out, t)
  k.extrude(H, band, W, basis(xh).multiply(new THREE.Matrix4().makeTranslation(0, 0, -W / 2)), 4)
  const back = voluteShape(r0, r1 + 0.012, out)
  const front = voluteShape(r0, r1 + 0.012, out)
  const eye = new THREE.Path()
  eye.absarc(0, 0, Di / 2, 0, Math.PI * 2, true)
  front.holes.push(eye)
  // side sheet normal = u x v; +X for 'up' and 'horizontal' alike
  const nx = new THREE.Vector3().crossVectors(u, v).x
  for (const [sh, s] of [[front, 1], [back, -1]] as [THREE.Shape, number][]) castExtrude(k, H, sh, 0.008, 0.002, basis(xh + s * nx * (W / 2 + 0.004)), 32)
  // outlet companion flange (angle frame) with bolts
  const oc = L.outC
  const od = new THREE.Vector3(...L.outD)
  const at = (a: number, b: number, c: number) => new THREE.Vector3(...oc).addScaledVector(od, c).addScaledVector(new THREE.Vector3(1, 0, 0), a).addScaledVector(up ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0), b).toArray() as V3
  const fq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), od)
  const ow = W + 0.06
  const oh = oa + 0.06
  for (const s of [-1, 1]) {
    k.box(H, [ow + 0.06, 0.04, flangeOut], at(0, s * (oh / 2 + 0.01), flangeOut / 2 - 0.004), fq)
    k.box(H, [0.04, oh + 0.06, flangeOut], at(s * (ow / 2 + 0.01), 0, flangeOut / 2 - 0.004), fq)
  }
  const nb = Math.max(3, Math.round(ow / 0.15))
  const c1 = p.flexible ? flangeOut + FLEX + flangeOut : flangeOut
  if (p.flexible) {
    // fabric connector (rectangular sleeve) and the duct-side companion frame
    for (const s of [-1, 1]) {
      k.box('rubberBlack', [W + 0.03, 0.008, FLEX], at(0, s * (oa / 2 + 0.012), flangeOut + FLEX / 2), fq)
      k.box('rubberBlack', [0.008, oa + 0.03, FLEX], at(s * (W / 2 + 0.012), 0, flangeOut + FLEX / 2), fq)
      k.box(H, [ow + 0.06, 0.04, flangeOut], at(0, s * (oh / 2 + 0.01), flangeOut * 1.5 + FLEX), fq)
      k.box(H, [0.04, oh + 0.06, flangeOut], at(s * (ow / 2 + 0.01), 0, flangeOut * 1.5 + FLEX), fq)
    }
  }
  for (let i = 0; i < nb; i++) for (const s of [-1, 1]) k.hex('nut', 0.018, 0.01, at(-ow / 2 + (ow * (i + 0.5)) / nb, s * (oh / 2 + 0.01), c1), L.outD)
  // inlet bellmouth + duct flange ring with bolts
  const ri = Di / 2
  const xs = xh + W / 2
  const bell: [number, number][] = [[ri * 1.0, 0], [ri * 1.3, 0.008], [ri * 1.32, 0.02], [ri * 1.08, 0.06], [ri, 0.12], [ri, Lin - 0.005]]
  k.lathe(H, bell, [xs, ys, 0], 'x', 48)
  k.lathe(H, bell.map(([r, y]) => [r - 0.003, y] as [number, number]).reverse(), [xs, ys, 0], 'x', 48)
  k.lathe(H, [[ri - 0.003, Lin - 0.006], [ri + 0.05, Lin - 0.006], [ri + 0.05, Lin + flangeOut], [ri - 0.003, Lin + flangeOut], [ri - 0.003, Lin - 0.006]], [xs, ys, 0], 'x', 48)
  if (p.flexible) {
    const xf = xs + Lin + flangeOut
    k.lathe('rubberBlack', [[ri + 0.004, 0], [ri + 0.02, FLEX / 2], [ri + 0.004, FLEX]], [xf, ys, 0], 'x', 40)
    k.lathe('rubberBlack', [[ri - 0.002, FLEX], [ri - 0.002, 0]], [xf, ys, 0], 'x', 40)
    k.lathe(H, [[ri - 0.003, FLEX], [ri + 0.05, FLEX], [ri + 0.05, FLEX + flangeOut], [ri - 0.003, FLEX + flangeOut], [ri - 0.003, FLEX]], [xf, ys, 0], 'x', 48)
  }
  k.around(Math.max(8, Math.round((Math.PI * Di) / 0.15)), ri + 0.03, [xIn + ext(p) + 0.005, ys, 0], 'x', (q) => k.hex('nut', 0.018, 0.01, q, 'x'))
  // inspection door, drain, lifting lugs, rotation arrow, nameplate
  const dz = up ? r1 * 0.2 : r1 * 0.75
  const dy = up ? -r1 * 0.55 : -r1 * 0.2
  k.rbox(H, [0.02, D * 0.3, D * 0.22], 0.01, [xs + 0.012, ys + dy, dz])
  for (const a of [-1, 1]) k.cyl('handwheel', 0.012, 0.04, [xs + 0.04, ys + dy + a * D * 0.1, dz], 'x', 8)
  k.cyl(H, 0.015, 0.06, [xh, ys - r1 * 0.98, 0], 'y', 10)
  k.hex('nut', 0.03, 0.02, [xh, ys - r1 * 0.98 - 0.035, 0])
  for (const s of [-1, 1]) liftingLug(k, [xh + s * (W / 2 + 0.006), ys + r1 * (up ? 0.3 : 0.9) - 0.02, up ? r0 * 0.5 : -r1 * 0.2], 'z', 0.8, H)
  k.box('actuatorRed', [0.004, 0.03, D * 0.18], [xs + 0.012, ys + r0 * 0.7, up ? 0.2 * r0 : -0.3 * r0])
  k.box('nameplate', [0.003, 0.08, 0.13], [xs + 0.011, ys - r0 * 0.6, -r0 * 0.6])
  if (p.tag) tagPlate(k, p.tag, [xs + 0.012, ys - r0 * 0.2, -r0 * 0.75], 'x', 0.14)
  // housing support legs to the base frame
  for (const s of [-1, 1]) {
    const zl = s * r0 * 0.75
    const yTop = ys - Math.sqrt(Math.max(0, r1 * r1 * 0.85 - zl * zl)) + 0.02
    k.box(H, [W + 0.02, Math.max(0.02, yTop - hb), 0.05], [xh, (yTop + hb) / 2, zl])
    k.box(H, [W + 0.1, 0.012, 0.14], [xh, hb + 0.006, zl])
  }

  // shaft, pillow-block bearings on a pedestal
  const rs = clamp(0.02 + D * 0.025, 0.025, 0.07)
  const xb0 = xh - W / 2 - 0.15
  const xb1 = xP + 0.15
  k.cyl('flangeSteel', rs, xs - xP + 0.06, [(xs + xP) / 2, ys, 0], 'x', 16)
  const ped = 0.1
  k.box(H, [xb0 - xb1 + 0.2, 0.02, ped * 2.6], [(xb0 + xb1) / 2, ys - rs * 2.6, 0])
  for (const sz of [-1, 1]) k.box(H, [xb0 - xb1 + 0.2, ys - rs * 2.6 - hb, 0.012], [(xb0 + xb1) / 2, (ys - rs * 2.6 + hb) / 2, sz * ped * 1.2])
  for (const xb of [xb0, xb1]) {
    k.box('castIron', [rs * 3, rs * 1.6, rs * 7], [xb, ys - rs * 1.8, 0])
    k.cyl('castIron', rs * 2.2, rs * 3, [xb, ys, 0], 'x', 24)
    k.cyl('brass', 0.006, 0.02, [xb, ys + rs * 2.3, 0], 'y', 8)
    k.sphere('brass', 0.009, [xb, ys + rs * 2.3 + 0.014, 0], undefined, 8)
    for (const sz of [-1, 1]) k.hex('nut', rs * 0.9, rs * 0.5, [xb, ys - rs * 0.95, sz * rs * 2.8])
  }

  // V-belt drive: pulleys, belts, guard (mesh faces, yellow rim)
  const Ra = clamp(D * 0.2, 0.08, 0.4)
  const Rb = Ra * 0.6
  const A = new THREE.Vector2(0, ys) // (z, y)
  const B = new THREE.Vector2(zM, ysM)
  const nB = Math.max(2, Math.min(5, Math.round(p.kw / 8) + 1))
  const bw = 0.025
  const n2 = new THREE.Vector2().subVectors(B, A).normalize()
  const nn = new THREE.Vector2(-n2.y, n2.x)
  for (let i = 0; i < nB; i++) {
    const x = xP + (i - (nB - 1) / 2) * bw
    k.torus('rubberBlack', Ra + 0.004, 0.008, [x, A.y, A.x], 'x', 6, 40)
    k.torus('rubberBlack', Rb + 0.004, 0.008, [x, B.y, B.x], 'x', 6, 32)
    for (const s of [-1, 1]) k.rod('rubberBlack', [x, A.y + nn.y * s * (Ra + 0.004), A.x + nn.x * s * (Ra + 0.004)], [x, B.y + nn.y * s * (Rb + 0.004), B.x + nn.x * s * (Rb + 0.004)], 0.008, 6)
  }
  const gm = 0.06
  const shape = new THREE.Shape()
  const ang = Math.atan2(n2.y, n2.x)
  shape.absarc(A.x, A.y, Ra + gm, ang + Math.PI / 2, ang + (3 * Math.PI) / 2, false)
  shape.absarc(B.x, B.y, Rb + gm, ang - Math.PI / 2, ang + Math.PI / 2, false)
  shape.closePath()
  const gq = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))
  const gd = nB * bw + 0.08
  const rim = new THREE.Shape(shape.getPoints(48))
  const hole = new THREE.Path(shape.getPoints(48).map((q) => q.clone().sub(new THREE.Vector2((A.x + B.x) / 2, (A.y + B.y) / 2)).multiplyScalar(0.97).add(new THREE.Vector2((A.x + B.x) / 2, (A.y + B.y) / 2))))
  rim.holes.push(hole)
  k.extrude('safetyYellow', rim, gd, gq.clone().setPosition(xP + gd / 2, 0, 0), 4)
  for (const xf of [xP - gd / 2, xP + gd / 2]) {
    const g = new THREE.ShapeGeometry(shape, 32)
    uvScale(g, 8, 8)
    k.add(meshGuardMaterial(), g, gq.clone().setPosition(xf, 0, 0))
  }
  k.rod('safetyYellow', [xP, A.y - Ra - gm, A.x], [xP, hb, A.x], 0.015, 8)

  // motor (faces -X), slide rails for belt tension
  k.at([xMf, ysM, zM], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), () => motor(k, { R: m.R, L: m.L, H: ysM - hb, tbox: 'top' }))
  for (const s of [-1, 1]) {
    k.box('galvanised', [m.L * 1.1, 0.03, 0.06], [xMf + m.L * 0.5, hb + 0.015, zM + s * m.R * 0.78])
    k.cyl('boltXylan', 0.008, 0.12, [xMf + m.L * 1.08, hb + 0.03, zM + s * m.R * 0.78], 'x', 6)
  }

  // turning parts: fan wheel (visible through the inlet) + shaft + fan pulley; motor pulley
  {
    const r = new Kit()
    const bk = -W * 0.42
    r.cyl('galvanised', D / 2, 0.008, [bk, 0, 0], 'x', 40)
    r.lathe('galvanised', [[ri * 0.98, W * 0.25], [D / 2 * 0.98, bk + W * 0.62], [D / 2, bk + W * 0.6]], [0, 0, 0], 'x', 40)
    const nBl = 12
    for (let i = 0; i < nBl; i++) {
      const a = (i / nBl) * Math.PI * 2
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5))
      const rr = D * 0.4
      r.box('galvanised', [W * 0.55, D * 0.18, 0.006], [bk + W * 0.3, Math.cos(a) * rr, Math.sin(a) * rr], q)
    }
    r.cyl('castIron', rs * 2.2, W * 0.4, [bk + W * 0.2, 0, 0], 'x', 16)
    r.cyl('castIron', Ra, nB * bw + 0.02, [xP - xh, 0, 0], 'x', 32)
    for (let i = 0; i < 4; i++) r.box('nut', [nB * bw + 0.022, 0.02, Ra * 0.5], [xP - xh, Ra * 0.55 * Math.cos(i * 1.57), Ra * 0.55 * Math.sin(i * 1.57)], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), i * 1.57))
    rotors.push({ built: r.build(), axis: 'x', pos: [xh, ys, 0], rpm: 120 })
    const r2 = new Kit()
    r2.cyl('castIron', Rb, nB * bw + 0.02, [0, 0, 0], 'x', 28)
    r2.box('nut', [nB * bw + 0.022, Rb * 0.3, 0.02], [0, Rb * 0.6, 0])
    rotors.push({ built: r2.build(), axis: 'x', pos: [xP, ysM, zM], rpm: 200 })
  }

  // base frame on spring isolators
  const bx = x1 - x0
  const bz = z1 - z0
  const xm0 = (x0 + x1) / 2
  const zm0 = (z0 + z1) / 2
  const sec = 0.14
  for (const s of [-1, 1]) member(k, [x0, ISO + sec / 2, zm0 + s * (bz / 2 - 0.03)], [x1, ISO + sec / 2, zm0 + s * (bz / 2 - 0.03)], FRAME, 'structSteel')
  for (const xx of [x0 + 0.04, xh, xP, x1 - 0.04]) member(k, [xx, ISO + sec / 2, z0 + 0.06], [xx, ISO + sec / 2, z1 - 0.06], FRAME, 'structSteel')
  k.box('structSteel', [m.L * 1.25, 0.008, Math.min(m.R * 2.4, z1 - zM - 0.02 + m.R)], [xMf + m.L * 0.5, hb - 0.004, zM])
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) isolator(k, [xm0 + sx * (bx / 2 - 0.12), 0, zm0 + sz * (bz / 2 - 0.03)])
}

// open spring isolator: base plate with anchors, coil, top plate and levelling bolt
function isolator(k: Kit, p: V3) {
  const [x, , z] = p
  k.box('galvanised', [0.18, 0.012, 0.12], [x, 0.006, z])
  for (const s of [-1, 1]) anchorBolt(k, [x + s * 0.07, 0.012, z], 0.012)
  k.cyl('galvanised', 0.045, 0.02, [x, 0.022, z], 'y', 20)
  const turns = 5
  const pts: V3[] = []
  for (let i = 0; i <= turns * 16; i++) {
    const a = (i / 16) * Math.PI * 2
    pts.push([x + Math.cos(a) * 0.035, 0.034 + (i / (turns * 16)) * (ISO - 0.06), z + Math.sin(a) * 0.035])
  }
  k.spline('actuatorYellow', pts, 0.006, 6, turns * 24)
  k.cyl('galvanised', 0.045, 0.02, [x, ISO - 0.02, z], 'y', 20)
  k.cyl('boltXylan', 0.008, 0.06, [x, ISO, z], 'y', 8)
  k.hex('nut', 0.025, 0.014, [x, ISO - 0.006, z])
}

// C-section of the scroll wrapper sheet: outer spiral + outlet walls, thickness t, open at the outlet end
function scrollBand(r0: number, r1: number, out: number, t: number, n = 72) {
  const sh = new THREE.Shape()
  const r = (th: number, d = 0) => r0 + ((r1 - r0) * th) / (Math.PI * 2) - d
  sh.moveTo(r1, out)
  sh.lineTo(r1, 0)
  for (let i = n - 1; i >= 0; i--) {
    const th = (i / n) * Math.PI * 2
    sh.lineTo(Math.cos(th) * r(th), Math.sin(th) * r(th))
  }
  sh.lineTo(r0, out)
  sh.lineTo(r0 + t, out)
  sh.lineTo(r0 + t, 0)
  sh.lineTo(r0 + t, -t)
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * Math.PI * 2
    sh.lineTo(Math.cos(th) * r(th, t), Math.sin(th) * r(th, t))
  }
  sh.lineTo(r1 - t, out)
  sh.closePath()
  return sh
}
