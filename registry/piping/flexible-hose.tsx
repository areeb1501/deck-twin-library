// Flexible hose assemblies: braided corrugated stainless (ISO 10380), armoured rubber hose with flanged ends, or a rotary steel loop with ball-race swivel joints and Fig 1502 unions.
import * as THREE from 'three'
import { sweepGeometry, type Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { elbow90, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { buttWeld, endFlange, flangeLen, hammerSpan, hammerUnion, pipeStub, seg } from './_flanges'

export type HoseKind = 'braided' | 'armoured' | 'rotary'

export interface FlexibleHoseProps {
  kind?: HoseKind
  /** nominal bore, inches */
  nps?: number
  rating?: Rating
  /** face-to-face between the end connections, m */
  length?: number
  /** droop of the hose below the centreline, m (limited by the bend radius) */
  sag?: number
  /** minimum centreline bend radius, m (0 = typical for the type) */
  bendRadius?: number
}

export const defaults = { kind: 'braided' as HoseKind, nps: 2, rating: 300 as Rating, length: 1.2, sag: 0.15, bendRadius: 0 }

const r4 = (n: number) => Math.round(n * 1e4) / 1e4

function dims(p: FlexibleHoseProps) {
  const o = { ...defaults, ...p }
  const rot = o.kind === 'rotary'
  const nps = rot ? Math.min(Math.max(o.nps, 2), 4) : Math.min(Math.max(o.nps, 0.5), 12)
  const od = pipeOD(nps)
  // typical: static bend radius ~ 5 x OD for braided, 7 x OD for armoured
  const mbr = o.bendRadius > 0 ? o.bendRadius : od * (o.kind === 'armoured' ? 7 : 5)
  const hs = hammerSpan(nps)
  // rotary loop needs room for two unions, four swivels and four long-radius elbows
  const minRot = 2 * (hs.xf - hs.xm) + 2 * od * 1.6 + 4 * elbow90(nps, 'LR') * 1.3 + od * 2
  const L = Math.max(o.length, rot ? minRot : od * 6)
  return { ...o, nps, od, mbr, L, rot }
}

export function ports(p: FlexibleHoseProps = {}): Port[] {
  const d = dims(p)
  const x = r4(d.L / 2)
  if (d.rot) return [port('A', 'Male union end', [-x, 0, 0], [-1, 0, 0], d.nps), port('B', 'Female union end', [x, 0, 0], [1, 0, 0], d.nps)]
  return [port('A', 'Flange A', [-x, 0, 0], [-1, 0, 0], d.nps, d.rating), port('B', 'Flange B', [x, 0, 0], [1, 0, 0], d.nps, d.rating)]
}

export function FlexibleHose({ kind = defaults.kind, nps = defaults.nps, rating = defaults.rating, length = defaults.length, sag = defaults.sag, bendRadius = defaults.bendRadius, ...group }: FlexibleHoseProps & GroupProps) {
  const data = useKit((k) => build(k, { kind, nps, rating, length, sag, bendRadius }), [kind, nps, rating, length, sag, bendRadius])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FlexibleHose

/** Hose centreline: straight off each fitting, drooping to `sag` at mid-span, with the droop limited by the bend radius. */
function path(xs: number, xe: number, sag: number, mbr: number) {
  const span = xe - xs
  // a cubic-Bezier S-bend of horizontal run a and drop s has minimum radius ~ a^2 / (6 s) (approx)
  const a = span / 2
  const s = Math.max(0, Math.min(sag, (a * a) / (6 * mbr) * 1.6))
  const c = new THREE.CurvePath<THREE.Vector3>()
  const P = (x: number, y: number) => new THREE.Vector3(x, y, 0)
  if (s < 1e-4) {
    c.add(new THREE.LineCurve3(P(xs, 0), P(xe, 0)))
    return c
  }
  const xm = (xs + xe) / 2
  c.add(new THREE.CubicBezierCurve3(P(xs, 0), P(xs + a * 0.55, 0), P(xm - a * 0.55, -s), P(xm, -s)))
  c.add(new THREE.CubicBezierCurve3(P(xm, -s), P(xm + a * 0.55, -s), P(xe - a * 0.55, 0), P(xe, 0)))
  return c
}

function build(k: Kit, p: FlexibleHoseProps) {
  const d = dims(p)
  if (d.rot) return rotary(k, d)
  const { nps, rating, L, od } = d
  const fl = flangeLen(nps, rating)
  endFlange(k, nps, rating, [-L / 2, 0, 0], [-1, 0, 0], '40')
  endFlange(k, nps, rating, [L / 2, 0, 0], [1, 0, 0], '40')
  const arm = d.kind === 'armoured'
  const rH = od / 2 * (arm ? 1.28 : 1.1)
  const ri = od / 2 - pipeWall(nps, '40')
  // end fitting: weld collar on the flange, hose nipple, crimped ferrule
  const fer = Math.max(0.05, od * (arm ? 1.6 : 1.2))
  const segs = seg(rH * 2.2)
  for (const s of [-1, 1]) {
    const xw = s * (L / 2 - fl)
    const xe = s * (L / 2 - fl - 0.012 - fer)
    pipeStub(k, [s < 0 ? xw : xw - 0.012, 0, 0], [1, 0, 0], 0.012, nps, '40', 'open', 'open', 'stainless')
    buttWeld(k, [xw, 0, 0], [1, 0, 0], od / 2, pipeWall(nps, '40'))
    const a = Math.min(xw - 0.012 * s, xe)
    const b = Math.max(xw - 0.012 * s, xe)
    const rf = rH + 0.004
    // ferrule with crimp grooves; flat shoulder towards the flange
    const prof: [number, number][] = [[od / 2 + 0.001, 0], [rf, 0.002]]
    const ng = 5
    for (let i = 0; i < ng; i++) {
      const y = (b - a) * (0.25 + (0.65 * i) / ng)
      prof.push([rf, y], [rf - 0.0015, y + 0.002], [rf - 0.0015, y + 0.005], [rf, y + 0.007])
    }
    prof.push([rf, b - a - 0.002], [rH, b - a])
    const flip = s > 0
    k.lathe('stainless', flip ? prof.map(([r, y]) => [r, b - a - y] as [number, number]).reverse() : prof, [a, 0, 0], 'x', segs)
  }
  // hose body: corrugated braid or interlocked armour swept along the droop
  const xs = -L / 2 + fl + 0.012 + fer
  const xe = L / 2 - fl - 0.012 - fer
  const c = path(xs, xe, d.sag, d.mbr)
  const len = c.getLength()
  const pitch = arm ? Math.max(0.008, od * 0.16) : Math.max(0.003, od * 0.05)
  const N = Math.max(4, Math.round(len / pitch))
  const amp = arm ? rH * 0.05 : rH * 0.025
  const radius = (t: number): [number, number] => {
    const ph = (t * N) % 1
    const r = arm ? rH - amp * (ph < 0.5 ? 0 : 1) * Math.min(1, Math.abs(ph - 0.75) * 8) : rH - amp * Math.abs(Math.sin(Math.PI * ph))
    return [r, r]
  }
  k.add(arm ? 'galvanised' : 'stainless', sweepGeometry(c, radius, Math.min(1600, N * (arm ? 6 : 4)), 20))
  k.add('pipeBore', sweepGeometry(c, () => [ri, ri], 64, 16))
  // hose end trims where the hose enters each ferrule
  for (const x of [xs, xe]) k.cyl(arm ? 'rubberBlack' : 'stainless', rH + 0.001, 0.004, [x, 0, 0], 'x', segs)
}

/** typical rotary / chiksan loop: two long-radius swivel elbows down, a bottom run with swivels, back up; Fig 1502 unions on the ends. */
function rotary(k: Kit, d: ReturnType<typeof dims>) {
  const { nps, L, od } = d
  const ro = od / 2
  const wt = pipeWall(nps, '160')
  const M = 'valveBody'
  const R = elbow90(nps, 'LR') * 1.3
  const drop = Math.max(R * 2 + od * 2, d.sag + R * 2)
  const sw = od * 1.6 // swivel housing length
  const hs = hammerSpan(nps)
  // unions sit on the run ends: A male side at -X, B female side at +X
  const jA = -L / 2 - hs.xm
  const jB = L / 2 - hs.xf
  hammerUnion(k, jA, nps, M)
  hammerUnion(k, jB, nps, M)
  const x0 = jA + hs.xf
  const x1 = jB + hs.xm
  const n = seg(od * 1.6)
  const swivel = (pos: V3, axis: V3) => {
    // ball-race swivel: housing, three race bands, ball plugs and grease fitting
    const v = new THREE.Vector3(...axis)
    const c = new THREE.Vector3(...pos)
    k.cyl(M, ro * 1.55, sw, pos, axis, n)
    for (const t of [-0.3, 0, 0.3]) k.cyl('actuatorRed', ro * 1.58, sw * 0.08, c.clone().addScaledVector(v, t * sw).toArray() as V3, axis, n)
    const side = Math.abs(v.y) > 0.5 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    k.hex('nut', ro * 0.5, ro * 0.3, c.clone().addScaledVector(side, ro * 1.6).addScaledVector(v, -sw * 0.15).toArray() as V3, side.toArray() as V3)
    k.cyl('brass', ro * 0.12, ro * 0.35, c.clone().addScaledVector(side, ro * 1.65).addScaledVector(v, sw * 0.15).toArray() as V3, side.toArray() as V3, 8)
  }
  const pipeRun = (a: V3, b: V3) => {
    const va = new THREE.Vector3(...a)
    const dir = new THREE.Vector3(...b).sub(va)
    const l = dir.length()
    if (l > 1e-4) pipeStub(k, a, dir.normalize().toArray() as V3, l, nps, '160', 'open', 'open', M)
  }
  const elbow = (start: V3, dir: V3, toward: V3) => k.bend(M, start, dir, toward, R, od, Math.PI / 2, wt)
  // A side: run → swivel (X) → elbow down → swivel (Y) → elbow towards +X along the bottom
  const xa = x0 + sw * 0.5
  pipeRun([x0, 0, 0], [xa - sw * 0.5, 0, 0])
  swivel([xa, 0, 0], [1, 0, 0])
  elbow([xa + sw * 0.5, 0, 0], [1, 0, 0], [0, -1, 0])
  const xb = xa + sw * 0.5 + R
  const yS = -R - sw * 0.5
  swivel([xb, yS, 0], [0, 1, 0])
  elbow([xb, -drop + R, 0], [0, -1, 0], [1, 0, 0])
  pipeRun([xb, -R, 0], [xb, yS + sw * 0.5, 0])
  pipeRun([xb, yS - sw * 0.5, 0], [xb, -drop + R, 0])
  // B side mirrored
  const xb2 = x1 - sw - R
  swivel([x1 - sw * 0.5, 0, 0], [1, 0, 0])
  k.bend(M, [xb2, -R, 0], [0, 1, 0], [1, 0, 0], R, od, Math.PI / 2, wt)
  swivel([xb2, yS, 0], [0, 1, 0])
  pipeRun([xb2, yS + sw * 0.5, 0], [xb2, -R, 0])
  k.bend(M, [xb2 - R, -drop, 0], [1, 0, 0], [0, 1, 0], R, od, Math.PI / 2, wt)
  pipeRun([xb2, -drop + R, 0], [xb2, yS - sw * 0.5, 0])
  // bottom run with a mid swivel
  const xm = (xb + xb2) / 2
  pipeRun([xb + R, -drop, 0], [xm - sw * 0.5, -drop, 0])
  swivel([xm, -drop, 0], [1, 0, 0])
  pipeRun([xm + sw * 0.5, -drop, 0], [xb2 - R, -drop, 0])
  for (const p of [[xb, -drop + R, 0], [xb + R, -drop, 0], [xb2 - R, -drop, 0], [xb2, -drop + R, 0], [xb2, -R, 0], [xb, -R, 0]] as V3[]) buttWeld(k, p, Math.abs(p[1] + drop) < 1e-6 ? [1, 0, 0] : [0, 1, 0], ro, wt)
}
