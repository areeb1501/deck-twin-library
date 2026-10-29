// Coriolis mass flowmeter: dual U-tube sensor in a welded stainless case below the line, flow-splitting manifolds, integral Ex d transmitter. ISO 10790, ASME B16.5.
import * as THREE from 'three'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { textMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { SS, exHead, tag as tagPlate, flange, pipe, segFor } from './_parts'

export interface CoriolisFlowmeterProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  /** tubes hang below the line (liquid) or stand above it (gas, self-draining) */
  tubes?: 'down' | 'up'
  housing?: MatKey
  tag?: string
}

export const defaults = { nps: 3, rating: 300 as Rating, tubes: 'down' as 'down' | 'up', housing: 'actuatorBlue' as MatKey, tag: 'FT-1501' }

type P = typeof defaults

function dims(p: P) {
  const D = pipeOD(p.nps)
  const f = flangeDims(p.nps, p.rating)
  const endL = f.hubLength + f.raisedFaceHeight
  const L = Math.max(0.42, 0.3 + 0.15 * p.nps) // typical face-to-face
  const neck = 0.04
  const mL = Math.max(0.08, D * 0.9)
  const a = L / 2 - endL - neck - mL / 2
  const w = Math.max(0.06, D * 0.85)
  const wz = Math.max(0.09, D * 1.3)
  const Hc = 0.25 + 0.09 * p.nps // typical case drop
  return { D, endL, L, neck, mL, a, w, wz, Hc }
}

export function ports(props: CoriolisFlowmeterProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { L } = dims(p)
  return [port('A', 'Inlet', [-L / 2, 0, 0], [-1, 0, 0], p.nps, p.rating), port('B', 'Outlet', [L / 2, 0, 0], [1, 0, 0], p.nps, p.rating)]
}

export function CoriolisFlowmeter(props: CoriolisFlowmeterProps & GroupProps) {
  const { nps, rating, tubes, housing, tag, ...group } = { ...defaults, ...props }
  const p = { nps, rating, tubes, housing, tag }
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default CoriolisFlowmeter

function caseShape(a: number, w: number, Hc: number) {
  const Rc = Math.max(Math.min(a * 0.9, Hc * 0.45), w + 0.008)
  const ri = Rc - w
  const xo = a + w / 2
  const xi = a - w / 2
  const s = new THREE.Shape()
  s.moveTo(-xo, 0)
  s.lineTo(-xo, -Hc + Rc)
  s.absarc(-xo + Rc, -Hc + Rc, Rc, Math.PI, Math.PI * 1.5, false)
  s.lineTo(xo - Rc, -Hc)
  s.absarc(xo - Rc, -Hc + Rc, Rc, Math.PI * 1.5, Math.PI * 2, false)
  s.lineTo(xo, 0)
  s.lineTo(xi, 0)
  s.lineTo(xi, -Hc + w + ri)
  s.absarc(xi - ri, -Hc + w + ri, ri, 0, -Math.PI / 2, true)
  s.lineTo(-xi + ri, -Hc + w)
  s.absarc(-xi + ri, -Hc + w + ri, ri, -Math.PI / 2, -Math.PI, true)
  s.lineTo(-xi, 0)
  s.closePath()
  return s
}

function build(k: Kit, p: P) {
  const { D, endL, L, neck, mL, a, w, wz, Hc } = dims(p)
  const up = p.tubes === 'up' ? -1 : 1
  for (const s of [-1, 1]) {
    flange(k, p.nps, p.rating, [(s * L) / 2, 0, 0], s > 0 ? 'x' : '-x')
    const x0 = s * (L / 2 - endL)
    const x1 = s * (L / 2 - endL - neck - 0.005)
    pipe(k, [Math.min(x0, x1), 0, 0], [Math.max(x0, x1), 0, 0], p.nps, SS, '80')
    weldBead(k, p.nps, [x0, 0, 0], 'x')
    // splitter manifold casting
    const xm = s * a
    k.lathe(SS, [[D / 2, -mL / 2], [D * 0.62, -mL / 2 + 0.012], [D * 0.72, -mL * 0.2], [D * 0.72, mL * 0.2], [D * 0.62, mL / 2 - 0.012], [D / 2, mL / 2]], [xm, 0, 0], 'x', segFor(D * 1.44))
    // bore into the manifold ends at the flow splitter: two tube inlets side by side (no straight-through path)
    const ri = D / 2 - pipeWall(p.nps, '80')
    const xs = s * (a + mL * 0.1)
    k.lathe('pipeBore', [[ri, mL * 0.4], [ri, 0]], [xs, 0, 0], s > 0 ? 'x' : '-x', segFor(2 * ri))
    k.disc(SS, ri, [xs, 0, 0], s > 0 ? 'x' : '-x', segFor(2 * ri))
    for (const z of [-1, 1]) k.disc('pipeBore', ri * 0.4, [xs + s * 0.0006, 0, z * ri * 0.46], s > 0 ? 'x' : '-x', 24)
  }
  // case top spine between the manifolds
  const rSp = D * 0.42
  k.cyl(SS, rSp, 2 * a, [0, 0, 0], 'x', segFor(2 * rSp))
  // U-tube case (tubes inside) below or above the line
  const m = new THREE.Matrix4().makeScale(1, up, 1).multiply(new THREE.Matrix4().makeTranslation(0, 0, -wz / 2))
  k.extrude(SS, caseShape(a, w, Hc), wz, m, 16)
  for (const s of [-1, 1]) {
    k.cyl(SS, 0.011, 0.016, [s * a * 0.55, -up * (Hc + 0.008), 0], 'y', 12)
    k.hex(SS, 0.024, 0.01, [s * a * 0.55, -up * (Hc + 0.02), 0], 'y')
  }

  // integral transmitter: feed-through neck, core processor, Ex d head
  const yTop = up > 0 ? rSp : Math.max(rSp, Hc)
  k.cyl(SS, 0.024, 0.07, [0, yTop + 0.03, 0], 'y', 16)
  k.cyl(p.housing, 0.046, 0.04, [0, yTop + 0.075, 0], 'y', 28)
  k.torus(p.housing, 0.046, 0.003, [0, yTop + 0.095, 0], 'y', 6, 28)
  exHead(k, [0, yTop + 0.095 + 0.011 + 0.048 - 0.004, 0], p.housing)
  tagPlate(k, p.tag, [-a, -up * Hc * 0.45, wz / 2 + 0.001], 'z', Math.min(w * 0.9, 0.08))
  // flow-direction arrow on the case front (bottom bar)
  const arrow = textMaterial('FLOW  \u2192', '#d8dcdf', '#1d2124', 512, 128)
  k.plane(arrow, Math.min(0.14, 2 * a - w - 0.02), w * 0.45, [0, -up * (Hc - w / 2), wz / 2 + 0.0008])
}
