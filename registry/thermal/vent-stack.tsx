// Cold vent stack: elbow inlet with low-point drain, riser, end-of-line deflagration arrester with screen and weather hood (or open tip), day marking and obstruction light; self-supported, braced tower or guyed. API 521, ISO 16852.
import * as THREE from 'three'
import { Kit, mat4, uvScale, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { meshGuardMaterial } from '../lib/textures'
import { flange, flangedJoint, ladder, nozzle, pipeRun, ringPlatform, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { elbow90, flange as flangeDims, nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { basePlate, triTower } from './_lattice'
import { clamp } from './_thermal'

export interface VentStackProps {
  /** open end above deck, m */
  height?: number
  nps?: number
  rating?: Rating
  support?: 'self' | 'braced' | 'guyed'
  arrestor?: boolean
  tag?: string
}

export const defaults = {
  height: 15,
  nps: 8,
  rating: 150 as Rating,
  support: 'braced' as 'self' | 'braced' | 'guyed',
  arrestor: true,
  tag: 'VS-100',
}

type P = typeof defaults

function dims(p: P) {
  const R = pipeOD(p.nps) / 2
  const H = Math.max(4, p.height)
  const yIn = Math.max(0.9, R + 0.6)
  const so = nozzleStandout(p.nps, p.rating) + 0.6
  const fd = flangeDims(p.nps, p.rating)
  const Lf = fd.hubLength + fd.raisedFaceHeight
  // end-of-line deflagration arrester at the outlet: housing, protection screen, weather hood (typical proportions)
  const arrL = clamp(0.25 + 2.2 * R, 0.35, 1.0)
  const gapH = clamp(0.1 + 0.8 * R, 0.12, 0.45)
  const hoodH = clamp(0.08 + 0.6 * R, 0.1, 0.4)
  const yb = H - hoodH - gapH // element face
  const ya = yb - arrL
  const yA0 = p.arrestor ? ya - Lf - 0.0045 / 2 : H // inlet joint of the arrester
  return { R, H, yIn, so, Lf, arrL, gapH, hoodH, ya, yb, yA0 }
}

export function ports(props: VentStackProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [port('inlet', 'Vent inlet', [-d.so, d.yIn, 0], [-1, 0, 0], p.nps, p.rating)]
}

export function VentStack(props: VentStackProps & GroupProps) {
  const { height, nps, rating, support, arrestor, tag, ...group } = { ...defaults, ...props }
  const p = { height, nps, rating, support, arrestor, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default VentStack

function build(k: Kit, p: P) {
  const d = dims(p)
  const { R, H, yIn, Lf } = d
  const galv = 'galvanised' as const
  const red = paint('#c0281e', { weather: 1 })
  const white = paint('#ecebe6', { weather: 1 })
  // inlet flange, elbow, riser up to the arrestor (or straight to the tip)
  const xF = -d.so
  flange(k, p.nps, p.rating, [xF, yIn, 0], [-1, 0, 0], true)
  const yTopRiser = p.arrestor ? d.yA0 - 0.0045 / 2 - Lf : H
  pipeRun(k, [[xF + Lf, yIn, 0], [0, yIn, 0], [0, yTopRiser, 0]], p.nps, { mat: galv })
  // low-point drain with valve and blind on the horizontal run
  const xd = xF + Lf + 0.25
  nozzle(k, { base: [xd, yIn - R, 0], dir: [0, -1, 0], nps: 1, rating: p.rating, standout: Math.min(0.25, yIn - R - 0.12), mat: galv, blind: true })
  // base support under the elbow and base plate
  const Re = elbow90(p.nps)
  k.box(galv, [0.16, yIn - R - 0.025, 0.16], [-Re * 0.3, (yIn - R + 0.025) / 2, 0])
  basePlate(k, -Re * 0.3, 0, 0.4, galv)
  // flanged spool joints up the riser
  for (let y = yIn + Re + 3; y < yTopRiser - 1; y += 6) flangedJoint(k, p.nps, p.rating, [0, y, 0], 'y')
  if (p.arrestor) {
    // end-of-line arrester: flanged housing, element bank, insect screen, weather hood on standoffs
    flangedJoint(k, p.nps, p.rating, [0, d.yA0, 0], 'y')
    const Rh = R * 1.7 + 0.04
    const { ya, yb } = d
    k.lathe('castIron', [[R, ya], [Rh, ya + d.arrL * 0.3], [Rh, yb - 0.03], [Rh + 0.03, yb - 0.03], [Rh + 0.03, yb]], [0, 0, 0], 'y', 40)
    for (let i = 1; i < 5; i++) k.torus('castIron', Rh, 0.01, [0, ya + d.arrL * (0.3 + (0.6 * i) / 5), 0], 'y', 6, 40)
    k.disc('castIron', Rh + 0.03, [0, yb, 0], 'y', 40) // crimped-ribbon element face under the hood
    const g = new THREE.CylinderGeometry(Rh, Rh, d.gapH, 40, 1, true)
    uvScale(g, 12, 2)
    k.add(meshGuardMaterial('#9aa1a6'), g, mat4([0, yb + d.gapH / 2, 0]))
    k.lathe(galv, [[Rh + 0.12, yb + d.gapH], [Rh + 0.12, yb + d.gapH + 0.03], [0.02, H]], [0, 0, 0], 'y', 40)
    k.disc(galv, Rh + 0.12, [0, yb + d.gapH, 0], '-y', 40)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      k.rod(galv, [Math.cos(a) * (Rh + 0.015), yb, Math.sin(a) * (Rh + 0.015)], [Math.cos(a) * (Rh + 0.015), yb + d.gapH, Math.sin(a) * (Rh + 0.015)], 0.012, 6)
    }
    tagPlate(k, p.tag, [0, ya + d.arrL * 0.6, Rh + 0.003], 'z', 0.12)
  } else {
    k.torus(galv, R + 0.004, 0.008, [0, H, 0], 'y', 6, 32)
    tagPlate(k, p.tag, [0, yIn + Re + 1.2, R + 0.003], 'z', 0.12)
  }
  // day marking and obstruction light
  const bandTop = p.arrestor ? d.yA0 - 0.5 : H - 0.2
  const n = 4
  const bh = clamp(H / 14, 0.4, 1.5)
  for (let i = 0; i < n; i++) k.cyl(i % 2 ? white : red, R + 0.003, bh, [0, bandTop - (i + 0.5) * bh, 0], 'y', 28, undefined, true)
  const lamp = paint('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 1.5, clearcoat: 0 })
  const yL = p.arrestor ? d.yA0 - 0.35 : H - 0.4
  k.box(galv, [0.24, 0.03, 0.05], [R + 0.1, yL, 0])
  k.cyl(galv, 0.05, 0.08, [R + 0.2, yL + 0.05, 0], 'y', 12)
  k.sphere(lamp, 0.055, [R + 0.2, yL + 0.13, 0], undefined, 12)
  // support
  if (p.support === 'braced') {
    const top = Math.min(H * 0.8, (p.arrestor ? d.yA0 : H) - 0.4)
    const r0 = clamp(H * 0.08, 0.8, 2.5)
    const t = triTower(k, [0, 0, 0], 0.025, top, r0, R + 0.25, { legR: clamp(H * 0.004, 0.04, 0.09), braceR: 0.025, panel: clamp(H / 5, 1.5, 3.5), mat: galv, phase: -Math.PI / 2, guides: R + 0.01 })
    for (let i = 0; i < 3; i++) {
      const c = t.at(0.025, i)
      basePlate(k, c[0], c[2], 0.35, galv)
    }
  } else if (p.support === 'guyed') {
    const yG = (p.arrestor ? d.yA0 - (d.yA0 > 3 ? 1.7 : 0.6) : H - 0.6)
    const rA = H * 0.45
    k.torus(galv, R + 0.04, 0.025, [0, yG, 0], 'y', 6, 28)
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + Math.PI / 3 + (i * 2 * Math.PI) / 3 // clear of the ladder on +Z
      const ax = Math.cos(a) * rA
      const az = Math.sin(a) * rA
      basePlate(k, ax, az, 0.35, galv)
      k.box(galv, [0.12, 0.12, 0.03], [ax, 0.08, az])
      const top: V3 = [Math.cos(a) * (R + 0.06), yG, Math.sin(a) * (R + 0.06)]
      k.rod('cable', top, [ax, 0.12, az], 0.008, 6)
      k.rod(galv, [ax, 0.12, az], [ax + (top[0] - ax) * 0.05, 0.12 + (yG - 0.12) * 0.05, az + (top[2] - az) * 0.05], 0.018, 8)
    }
  } else {
    // self-supported: base plate with gussets at the elbow support, guide clamp at mid height not needed
    k.box(galv, [0.5, 0.025, 0.5], [0, 0.0125, 0])
  }
  // access to the arrestor for element removal on taller stacks
  if (p.arrestor && d.yA0 > 3) {
    const y = d.yA0 - 1.1
    ringPlatform(k, y, R + 0.15, 0.8, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1)
    const zl = R + 0.95 + 0.15
    ladder(k, [0, 0, zl], y, [0, 0, 1])
    for (let yy = 1.8; yy < y - 0.5; yy += 2) {
      k.cyl(galv, R + 0.008, 0.06, [0, yy, 0], 'y', 24)
      for (const sx of [-1, 1]) k.rod(galv, [sx * 0.225, yy, zl], [sx * 0.06, yy, R], 0.014, 6)
    }
  }
}
