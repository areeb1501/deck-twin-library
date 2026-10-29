// Onshore elevated flare stack: self-supported, derrick-supported or guyed riser, molecular seal, flare tip with pilots, ignition panel, caged ladders with rest platforms. API 521, API 537.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { flange, junctionBox, ladder, nozzle, pipeRun, ringPlatform, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { ACCESS, elbow90, flange as flangeDims, nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { Flame } from './_flame'
import { flareTip, tipLength } from './_flare'
import { basePlate, triTower } from './_lattice'
import { clamp } from './_thermal'

export interface FlareStackProps {
  /** tip outlet above grade, m */
  height?: number
  support?: 'self' | 'derrick' | 'guyed'
  headerNps?: number
  rating?: Rating
  pilots?: number
  /** purge-reduction seal below the tip */
  seal?: 'molecular' | 'velocity'
  lit?: boolean
  flameHeight?: number
  tag?: string
}

export const defaults = {
  height: 40,
  support: 'derrick' as 'self' | 'derrick' | 'guyed',
  headerNps: 24,
  rating: 150 as Rating,
  pilots: 3,
  seal: 'molecular' as 'molecular' | 'velocity',
  lit: false,
  flameHeight: 12,
  tag: 'FS-100',
}

type P = typeof defaults

const GASKET = 0.0045

function dims(p: P) {
  const R = pipeOD(p.headerNps) / 2
  const Lt = tipLength(p.headerNps)
  const H = Math.max(12, p.height)
  const yTipJoint = H - Lt - 0.12
  const mol = p.seal === 'molecular'
  const Rseal = mol ? R * 1.9 + 0.1 : R // typical molecular seal shell; a velocity seal sits inside the tip
  const sealH = mol ? clamp(2.5 + R * 3, 3, 6) : 0
  const ySeal1 = mol ? yTipJoint - 0.6 : yTipJoint - 0.31
  const ySeal0 = ySeal1 - sealH
  const self = p.support === 'self'
  const Rb = self ? Math.max(R * 1.8, 0.7) : R // base shell radius
  const yIn = Math.max(1.6, R + 1.0)
  const so = nozzleStandout(p.headerNps, p.rating) + 0.25
  return { mol, R, Lt, H, yTipJoint, Rseal, sealH, ySeal0, ySeal1, self, Rb, yIn, so }
}

export function ports(props: FlareStackProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [port('inlet', 'Flare header inlet', [-d.Rb - d.so, d.yIn, 0], [-1, 0, 0], p.headerNps, p.rating)]
}

export function FlareStack(props: FlareStackProps & GroupProps) {
  const { height, support, headerNps, rating, pilots, seal, lit, flameHeight, tag, ...group } = { ...defaults, ...props }
  const p = { height, support, headerNps, rating, pilots, seal, lit, flameHeight, tag } as P
  const d = dims(p)
  const data = useKit((k) => build(k, p), [height, support, headerNps, rating, pilots, seal, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
      {lit && <Flame position={[0, d.H, 0]} height={flameHeight} />}
    </group>
  )
}

export default FlareStack

function build(k: Kit, p: P) {
  const d = dims(p)
  const { R, Rb, H } = d
  const riser = paint('#a7abad', { metalness: 0.55, roughness: 0.45, clearcoat: 0, weather: 1 }) // heat-resistant aluminium paint
  const red = paint('#c0281e', { weather: 1 })
  const white = paint('#ecebe6', { weather: 1 })
  const od = 2 * R
  // concrete plinth and base
  k.cyl('concrete', Math.max(Rb + 0.5, 1.0), 0.3, [0, 0.15, 0], 'y', 8)
  const y0 = 0.3
  if (d.self) {
    // flared base shell with anchor chairs, tapering to the riser
    const yTaper = H * 0.3
    k.lathe(riser, [[Rb + 0.15, y0], [Rb + 0.15, y0 + 0.04], [Rb, y0 + 0.04], [Rb, y0 + 3], [R + 0.01, yTaper]], [0, 0, 0], 'y', 48)
    for (let i = 0; i < 12; i++) {
      const a = ((i + 0.5) / 12) * Math.PI * 2
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
      const at = (r: number, y: number): V3 => [Math.cos(a) * r, y, Math.sin(a) * r]
      for (const da of [-0.06, 0.06]) {
        const qa = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -(a + da))
        k.box(riser, [0.2, 0.42, 0.02], [Math.cos(a + da) * (Rb + 0.08), y0 + 0.25, Math.sin(a + da) * (Rb + 0.08)], qa)
      }
      k.box(riser, [0.2, 0.025, 0.2], at(Rb + 0.09, y0 + 0.45), q)
      k.rod('nut', at(Rb + 0.09, y0), at(Rb + 0.09, y0 + 0.52), 0.02, 8)
      k.hex('nut', 0.06, 0.035, at(Rb + 0.09, y0 + 0.48))
    }
  } else {
    for (let y = 6; y < d.ySeal0 - 1; y += 6) k.cyl(riser, R + 0.02, 0.06, [0, y, 0], 'y', 32) // spool flanges
  }
  // molecular seal and tip
  if (d.mol) {
    k.lathe(riser, [[R, d.ySeal0 - 0.01], [d.Rseal, d.ySeal0 + d.Rseal * 0.6], [d.Rseal, d.ySeal1 - d.Rseal * 0.5], [R, d.ySeal1 - 0.12], [R, d.yTipJoint - 0.3]], [0, 0, 0], 'y', 40)
    nozzle(k, { base: [0, d.ySeal0 + d.Rseal * 0.3, -d.Rseal * 0.8], dir: [0, -0.5, -0.87], nps: 2, rating: p.rating, standout: 0.25, mat: riser, blind: true })
    k.lathe('vesselInner', [[R, d.ySeal0 - 0.01], [d.Rseal, d.ySeal0 + d.Rseal * 0.6], [d.Rseal, d.ySeal1 - d.Rseal * 0.5], [R, d.ySeal1 - 0.12]], [0, 0, 0], 'y', 40)
  }
  const tf = flangeDims(p.headerNps, p.rating)
  k.pipe(riser, [0, d.yTipJoint - 0.31, 0], [0, d.yTipJoint - GASKET / 2 - tf.hubLength - tf.raisedFaceHeight + 0.002, 0], od, 0.012, 32)
  const tip = flareTip(k, [0, d.yTipJoint, 0], p.headerNps, p.rating, Math.max(1, Math.round(p.pilots)))
  // day marking: red / white bands on the upper seventh
  if (p.support !== 'derrick') {
    const yb0 = Math.max(d.ySeal0 - H / 7, H * 0.55)
    const n = 5
    const bh = (d.ySeal0 - yb0) / n
    for (let i = 0; i < n; i++) k.cyl(i % 2 ? white : red, R + 0.004, bh, [0, yb0 + (i + 0.5) * bh, 0], 'y', 32, undefined, true)
  }
  // inlet: flanged horizontal run turning up into the riser through a long-radius elbow (open bore, no tee wall)
  const fd = flangeDims(p.headerNps, p.rating)
  const Lf = fd.hubLength + fd.raisedFaceHeight
  const xFace = -Rb - d.so
  flange(k, p.headerNps, p.rating, [xFace, d.yIn, 0], [-1, 0, 0], true)
  pipeRun(k, [[xFace + Lf, d.yIn, 0], [0, d.yIn, 0], [0, d.ySeal0, 0]], p.headerNps, { mat: riser })
  const Relb = elbow90(p.headerNps)
  k.box('galvanised', [0.3, d.yIn - R - y0, 0.4], [-Relb - 0.25, (d.yIn - R + y0) / 2, 0])
  k.box('galvanised', [0.45, 0.02, 0.55], [-Relb - 0.25, y0 + 0.01, 0])
  nozzle(k, { base: [xFace + Lf + 0.35, d.yIn - R, 0], dir: [0, -1, 0], nps: 2, rating: p.rating, standout: Math.min(0.25, d.yIn - R - y0 - 0.05), mat: riser, blind: true })
  // support structure
  if (p.support === 'derrick') {
    const r0 = Math.max(2.5, H / 9)
    const r1 = Math.max(1.0, R + 0.7)
    const top = d.ySeal0 - 0.3
    const t = triTower(k, [0, 0, 0], 0.03, top, r0, r1, { legR: clamp(H * 0.0035, 0.08, 0.2), braceR: 0.045, panel: Math.max(3, r0 * 1.1), mat: 'galvanised', phase: Math.PI / 2 + Math.PI / 3, guides: R + 0.05 })
    for (let i = 0; i < 3; i++) {
      const c = t.at(0.03, i)
      basePlate(k, c[0], c[2], 0.7, 'galvanised')
    }
  } else if (p.support === 'guyed') {
    const rA = H * 0.45
    const levels = H > 45 ? [0.4, 0.75] : [0.6]
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + Math.PI / 3 + (i * 2 * Math.PI) / 3
      const ax = Math.cos(a) * rA
      const az = Math.sin(a) * rA
      k.box('concrete', [1.2, 0.5, 1.2], [ax, 0.25, az])
      k.box('galvanised', [0.3, 0.2, 0.06], [ax, 0.6, az])
      for (const f of levels) {
        const y = Math.min(H * f, d.ySeal0 - 0.8)
        k.torus('galvanised', R + 0.06, 0.04, [0, y, 0], 'y', 6, 32)
        const ex = Math.cos(a) * (R + 0.1)
        const ez = Math.sin(a) * (R + 0.1)
        k.rod('cable', [ex, y, ez], [ax, 0.65, az], 0.012, 6)
        const tb: V3 = [ax + (ex - ax) * 0.04, 0.65 + (y - 0.65) * 0.04, az + (ez - az) * 0.04]
        k.rod('galvanised', [ax, 0.65, az], tb, 0.025, 8)
      }
    }
  }
  // ladders and rest platforms on the +Z face
  const flight = ACCESS.ladder.maxFlight
  const yTop = d.yTipJoint - 1.1
  const stops: number[] = []
  for (let y = flight; y < yTop - 1.5; y += flight) stops.push(y)
  stops.push(yTop)
  const z0 = (y: number) => (d.self && y < H * 0.3 ? Rb - (Rb - R) * clamp((y - 3) / (H * 0.3 - 3), 0, 1) : R) + 0.25
  let yPrev = y0
  stops.forEach((y, i) => {
    const sx = i % 2 ? 0.35 : -0.35
    const zf = z0(yPrev) + 0.0
    ladder(k, [sx, yPrev, Math.max(zf, z0(y))], y, [0, 0, 1])
    const last = i === stops.length - 1
    const rIn = (y > d.ySeal0 ? d.Rseal : z0(y) - 0.25) + 0.05
    if (last) ringPlatform(k, y, Math.max(rIn, d.Rseal + 0.05), 1.0, 0, Math.PI * 2 - 0.001)
    else ringPlatform(k, y, rIn, 1.0, -Math.PI / 2 - 0.75, -Math.PI / 2 + 0.75)
    yPrev = y
  })
  // aviation lights at the top platform and mid-height
  const lamp = paint('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 1.5, clearcoat: 0 })
  for (const y of [yTop + 1.2, H * 0.5])
    for (const a of [0, Math.PI]) {
      const r = (y > d.ySeal0 ? d.Rseal : R) + 0.12
      k.box('galvanised', [0.12, 0.04, 0.04], [Math.cos(a) * (r - 0.06), y - 0.06, Math.sin(a) * (r - 0.06)])
      k.sphere(lamp, 0.07, [Math.cos(a) * r, y, Math.sin(a) * r], undefined, 12)
    }
  // ignition panel at grade with pilot gas and ignition lines up the riser
  const px = Rb + 3
  k.box('galvanised', [0.08, 1.2, 0.08], [px, 0.6, 0])
  k.box('galvanised', [0.5, 0.02, 0.5], [px, 0.01, 0])
  junctionBox(k, [px, 1.25, 0.04], 'z', [0.6, 0.8, 0.3], paint('#c9ccc8'))
  tagPlate(k, p.tag, [px, 1.75, 0.2], 'z', 0.25)
  tip.pilots.forEach((pp, i) => {
    const a = Math.PI * 0.15 + i * 0.12
    const x = Math.cos(a) * (R + 0.08)
    const z = Math.sin(a) * (R + 0.08)
    const xb = Math.cos(a) * (Rb + 0.08)
    const zb = Math.sin(a) * (Rb + 0.08)
    const seal = d.Rseal + 0.08
    k.tube('stainless', [
      [px - 0.1 + i * 0.05, 0.9, 0.18],
      [px - 0.1 + i * 0.05, 0.6, 0.18],
      [xb + 0.1, 0.6, zb],
      [xb + 0.02, 3.2, zb],
      [x, d.self ? H * 0.32 : 3.4, z],
      [x, d.ySeal0 - 0.2, z],
      [Math.cos(a) * seal, d.ySeal0 + d.Rseal * 0.7, Math.sin(a) * seal],
      [Math.cos(a) * seal, d.ySeal1 - d.Rseal * 0.6, Math.sin(a) * seal],
      [pp[0], d.ySeal1, pp[2]],
      pp,
    ], 0.0167, 6, 0.25)
  })
}
