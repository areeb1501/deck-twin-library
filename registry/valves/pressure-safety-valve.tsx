// Spring-loaded pressure safety valve: flanged angle body, bolted bonnet, closed or open-yoke spring housing, cap, optional packed lifting lever. API 526 / API 520.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange, pipeOD, pipeWall, psv, type Orifice, type Rating } from '../lib/standards'
import { clamp, integralFlange, plug } from './_body'

export interface PressureSafetyValveProps {
  /** API 526 orifice letter */
  orifice?: Orifice
  /** inlet flange class; the outlet class follows API 526 */
  inletRating?: Rating
  bonnet?: 'closed' | 'open'
  /** packed lifting lever on the cap */
  lever?: boolean
  /** balanced bellows: vented bonnet */
  bellows?: boolean
  body?: MatKey
  /** spring bonnet and cap paint */
  color?: MatKey
  tag?: string
}

export const defaults = {
  orifice: 'J' as Orifice,
  inletRating: 300 as Rating,
  bonnet: 'closed' as 'closed' | 'open',
  lever: false,
  bellows: false,
  body: 'valveBody' as MatKey,
  color: 'actuatorRed' as MatKey,
  tag: '',
}

export function ports(p: PressureSafetyValveProps = {}): Port[] {
  const { orifice, inletRating } = { ...defaults, ...p }
  const d = psv(orifice, inletRating)
  return [
    port('inlet', 'Inlet', [0, -d.centreToInlet, 0], [0, -1, 0], d.inletNps, d.inletRating),
    port('outlet', 'Outlet', [d.centreToOutlet, 0, 0], [1, 0, 0], d.outletNps, d.outletRating, 'relief'),
  ]
}

export function PressureSafetyValve(props: PressureSafetyValveProps & GroupProps) {
  const { orifice, inletRating, bonnet, lever, bellows, body, color, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, orifice, inletRating, bonnet, lever, bellows, body, color, tag), [orifice, inletRating, bonnet, lever, bellows, body, color, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PressureSafetyValve

function build(k: Kit, orifice: Orifice, inletRating: Rating, bonnet: 'closed' | 'open', lever: boolean, bellows: boolean, M: MatKey, C: MatKey, tag: string) {
  const d = psv(orifice, inletRating)
  const A = d.centreToInlet
  const B = d.centreToOutlet
  const fi = flange(d.inletNps, d.inletRating)
  const fo = flange(d.outletNps, d.outletRating)
  const Di = pipeOD(d.inletNps)
  const Do = pipeOD(d.outletNps)
  const rni = Math.max(Di / 2 * 1.12, (fi.hubDia / 2) * 0.92)
  const rno = Math.max(Do / 2 * 1.06, (fo.hubDia / 2) * 0.9)
  const bodyR = Math.max(Do * 0.6, Di * 0.85, 0.05)
  // inlet flange (−Y) and nozzle
  integralFlange(k, fi, [0, -A, 0], '-y', rni, Di / 2 - pipeWall(d.inletNps, '80'), M)
  const yi = -A + fi.raisedFaceHeight + fi.thickness
  k.lathe(M, [[rni, yi - 0.004], [rni, -bodyR * 0.75], [bodyR * 0.85, -bodyR * 0.35], [bodyR * 0.85, 0]], [0, 0, 0], 'y', 32)
  k.lathe('pipeBore', [[Di / 2 - pipeWall(d.inletNps, '80'), -A], [Di / 2 - pipeWall(d.inletNps, '80'), -A + fi.thickness * 1.6]], [0, 0, 0], 'y', 20)
  k.disc('pipeBore', Di / 2 - pipeWall(d.inletNps, '80'), [0, -A + fi.thickness * 1.6, 0], '-y', 20)
  // body bowl and outlet nozzle (+X)
  k.sphere(M, bodyR, [0, 0, 0], [1.08, 1, 1], 36)
  const xo = B - fo.raisedFaceHeight - fo.thickness
  k.lathe(M, [[bodyR * 0.8, 0], [rno * 1.04, xo * 0.55], [rno, xo + 0.004]], [0, 0, 0], 'x', 32)
  integralFlange(k, fo, [B, 0, 0], 'x', rno, Do / 2 - pipeWall(d.outletNps, 'STD'), M)
  k.lathe('pipeBore', [[Do / 2 - pipeWall(d.outletNps, 'STD'), B], [Do / 2 - pipeWall(d.outletNps, 'STD'), B - fo.thickness * 1.6]], [0, 0, 0], 'x', 20)
  k.disc('pipeBore', Do / 2 - pipeWall(d.outletNps, 'STD'), [B - fo.thickness * 1.6, 0, 0], 'x', 20)
  // body drain, adjusting-ring lock screw, nameplate on the bowl
  plug(k, M, [bodyR * 0.25, -bodyR * 0.92, 0], '-y', Math.max(0.012, bodyR * 0.16))
  plug(k, M, [-bodyR * 0.2, -bodyR * 0.25, -bodyR * 0.93], '-z', Math.max(0.012, bodyR * 0.18))
  // bonnet flange and studs
  const yB0 = bodyR * 0.82
  const rF = bodyR * 0.95
  const tF = clamp(bodyR * 0.22, 0.014, 0.05)
  k.cyl(M, rF * 0.82, yB0 * 0.4, [0, yB0 * 0.8, 0], 'y', 32)
  k.cyl(M, rF, tF, [0, yB0 + tF / 2, 0], 'y', 36)
  const bd = clamp(bodyR * 0.11, 0.01, 0.03)
  const rB = Math.min(bodyR * 0.9, rF - bd * 3)
  k.boltCircle('boltXylan', 'nut', 8, rF - bd * 1.4, [0, yB0 - bd * 0.6, 0], 'y', bd, tF + bd * 2, [tF + bd * 1.4], Math.PI / 8)
  // spring housing up to the cap
  const top = d.height - A
  const sc = clamp(bodyR / 0.075, 0.6, 3)
  const capH = 0.075 * sc
  const y1 = yB0 + tF
  const H = top - capH - y1
  if (bonnet === 'closed') {
    k.lathe(C, [
      [rB, y1], [rB, y1 + H * 0.05], [rB * 0.9, y1 + H * 0.1], [rB * 0.66, y1 + H * 0.86],
      [rB * 0.72, y1 + H * 0.88], [rB * 0.72, y1 + H * 0.97], [rB * 0.55, y1 + H], [0, y1 + H],
    ], [0, 0, 0], 'y', 36)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const at = (r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r]
      k.rod(C, at(rB * 0.86, y1 + H * 0.1), at(rB * 0.64, y1 + H * 0.86), rB * 0.06, 8)
    }
    // bonnet vent: plugged on a conventional valve, left open on a balanced-bellows valve
    const vr = Math.max(0.008, rB * 0.11)
    k.cyl(C, vr * 1.5, vr * 2, [rB * 0.86, y1 + H * 0.14, 0], 'x', 14)
    if (bellows) {
      k.disc('pipeBore', vr * 0.75, [rB * 0.86 + vr + 0.0005, y1 + H * 0.14, 0], 'x', 12)
      k.torus('brass', vr * 0.85, vr * 0.15, [rB * 0.86 + vr, y1 + H * 0.14, 0], 'x', 6, 16)
    } else k.hex('nut', vr * 2, vr * 0.8, [rB * 0.86 + vr * 1.3, y1 + H * 0.14, 0], 'x')
  } else {
    // open yoke: base plate, two posts, top plate, exposed coil spring with buttons
    k.cyl(C, rB, H * 0.06, [0, y1 + H * 0.03, 0], 'y', 32)
    for (const s of [-1, 1]) k.box(C, [rB * 0.28, H * 0.9, rB * 0.22], [0, y1 + H * 0.5, s * rB * 0.82])
    k.box(C, [rB * 0.6, H * 0.08, rB * 1.9], [0, y1 + H * 0.96, 0])
    k.cyl(C, rB * 0.5, H * 0.08, [0, y1 + H * 0.96, 0], 'y', 28)
    const sb = y1 + H * 0.12
    const st = y1 + H * 0.86
    k.cyl('stainless', rB * 0.6, H * 0.04, [0, sb, 0], 'y', 28)
    k.cyl('stainless', rB * 0.6, H * 0.04, [0, st, 0], 'y', 28)
    k.cyl('stainless', rB * 0.1, H, [0, y1 + H / 2, 0], 'y', 10)
    const turns = 7
    const rs = rB * 0.5
    const wire = rB * 0.09
    const pts: V3[] = []
    for (let i = 0; i <= turns * 16; i++) {
      const t = i / 16
      pts.push([Math.cos(t * Math.PI * 2) * rs, sb + 0.02 + ((st - sb - 0.04) * t) / turns, Math.sin(t * Math.PI * 2) * rs])
    }
    k.spline('flangeSteel', pts, wire, 8, turns * 24)
  }
  // adjusting-screw locknut and cap
  k.hex('nut', rB * 0.5, capH * 0.2, [0, top - capH + capH * 0.1, 0])
  if (lever) {
    k.cyl(C, rB * 0.5, capH * 0.75, [0, top - capH * 0.45, 0], 'y', 28)
    k.dome(C, rB * 0.5, [0, top - capH * 0.08, 0], 'y', Math.PI / 2, 0.25, 24)
    const yl = top - capH * 0.45
    k.cyl('nut', rB * 0.08, rB * 1.25, [0, yl, 0], 'z', 10)
    k.hex('nut', rB * 0.2, rB * 0.1, [0, yl, rB * 0.6], 'z')
    const arm = rB * 2.6
    k.box(C, [rB * 0.12, rB * 0.18, rB * 0.1], [0, yl, rB * 0.68])
    k.add(C, new THREE.BoxGeometry(arm, rB * 0.12, rB * 0.08), new THREE.Matrix4().makeRotationZ(-0.25).setPosition(arm / 2 * Math.cos(0.25), yl - (arm / 2) * Math.sin(0.25), rB * 0.68))
    k.sphere('handwheel', rB * 0.13, [arm * Math.cos(0.25), yl - arm * Math.sin(0.25), rB * 0.68], undefined, 12)
  } else {
    k.cyl(C, rB * 0.42, capH * 0.72, [0, top - capH * 0.44, 0], 'y', 24)
    k.dome(C, rB * 0.42, [0, top - capH * 0.08, 0], 'y', Math.PI / 2, 0.22, 24)
  }
  // seal wire and lead seal on the cap
  k.torus('stainless', rB * 0.46, 0.0012, [0, top - capH * 0.75, 0], 'y', 4, 28)
  k.sphere('nut', 0.006, [rB * 0.46, top - capH * 0.75 - 0.01, 0], undefined, 8)
  tagPlate(k, tag || `${d.inletNps}${d.orifice}${d.outletNps}`, [0, -bodyR * 0.15, bodyR * 1.0 + 0.003], 'z', clamp(bodyR * 0.9, 0.06, 0.16))
}
