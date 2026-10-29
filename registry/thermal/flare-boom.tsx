// Offshore inclined lattice flare boom: tapered tubular truss on root pins and rear legs, internal flare header, vertical flare tip with windshield and pilots, inclined access way and tip platform. API 521, API 537.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, grating, handrail, ladder, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, type Rating } from '../lib/standards'
import { Flame } from './_flame'
import { flareTip } from './_flare'
import { basePlate, boxTruss } from './_lattice'
import { clamp } from './_thermal'

export interface FlareBoomProps {
  /** boom length along its axis, m */
  length?: number
  /** inclination above horizontal, degrees */
  angle?: number
  headerNps?: number
  rating?: Rating
  pilots?: number
  /** show a burning flame */
  lit?: boolean
  /** flame length, m */
  flameHeight?: number
  tag?: string
}

export const defaults = {
  length: 50,
  angle: 40,
  headerNps: 24,
  rating: 150 as Rating,
  pilots: 3,
  lit: false,
  flameHeight: 12,
  tag: 'FL-100',
}

type P = typeof defaults

const GASKET = 0.0045
const Y_PIN = 1.4

function dims(p: P) {
  const th = (clamp(p.angle, 15, 75) * Math.PI) / 180
  const L = p.length
  const dir = new THREE.Vector3(Math.cos(th), Math.sin(th), 0)
  const upP = new THREE.Vector3(-Math.sin(th), Math.cos(th), 0)
  const w0 = clamp(0.055 * L, 2, 4)
  const w1 = Math.max(1.2, 0.42 * w0)
  const A = new THREE.Vector3(0, Y_PIN, 0).addScaledVector(upP, w0 / 2)
  const B = A.clone().addScaledVector(dir, L)
  const B2 = B.clone().addScaledVector(dir, 0.6) // header bend point beyond the truss end
  const yPl = B.y + Math.cos(th) * (w1 / 2) + 0.15 // tip platform grating
  const jc = new THREE.Vector3(B2.x, yPl + 1.1, 0) // tip inlet flange joint
  const xIn = A.x - 2.4
  return { th, L, dir, upP, w0, w1, A, B, B2, yPl, jc, xIn }
}

export function ports(props: FlareBoomProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [port('inlet', 'Flare header inlet', [d.xIn, d.A.y, 0], [-1, 0, 0], p.headerNps, p.rating)]
}

export function FlareBoom(props: FlareBoomProps & GroupProps) {
  const { length, angle, headerNps, rating, pilots, lit, flameHeight, tag, ...group } = { ...defaults, ...props }
  const p = { length, angle, headerNps, rating, pilots, lit, flameHeight, tag } as P
  const d = dims(p)
  const data = useKit((k) => build(k, p), [length, angle, headerNps, rating, pilots, tag])
  const top = d.jc.y + 0.12 + Math.min(5, Math.max(2.5, 2.2 + 0.06 * headerNps))
  return (
    <group {...group}>
      <KitMesh data={data} />
      {lit && <Flame position={[d.B2.x, top, 0]} height={flameHeight} />}
    </group>
  )
}

export default FlareBoom

const v = (x: THREE.Vector3) => x.toArray() as V3

function build(k: Kit, p: P) {
  const d = dims(p)
  const { L, th, w0, w1, A, B, B2, yPl, jc } = d
  const chordR = clamp(0.0028 * L, 0.09, 0.18)
  const t = boxTruss(k, v(A), v(B), { w0, h0: w0, w1, h1: w1, up: v(d.upP), chordR, braceR: clamp(chordR * 0.4, 0.04, 0.07), panel: Math.max(2, w0 * 0.85), mat: 'structSteel' })
  // root: pinned lugs on the bottom chords, rear legs under the top chords
  for (const i of [0, 1]) {
    const c = t.at(0, i)
    k.box('structSteel', [0.7, Y_PIN, 0.06], [c[0], Y_PIN / 2 + 0.02, c[2] + (i ? -0.08 : 0.08)])
    k.box('structSteel', [0.7, Y_PIN, 0.06], [c[0], Y_PIN / 2 + 0.02, c[2] + (i ? 0.08 : -0.08)])
    k.cyl('machined', 0.07, 0.3, c, 'z', 16)
    basePlate(k, c[0], c[2], 0.9, 'structSteel')
  }
  for (const i of [2, 3]) {
    const c = t.at(0, i)
    k.rod('structSteel', [c[0], 0.03, c[2]], c, chordR, 12)
    basePlate(k, c[0], c[2], 0.7, 'structSteel')
    const c0 = t.at(0, i === 2 ? 1 : 0)
    k.rod('structSteel', [c[0], 0.3, c[2]], [c0[0], c0[1] - 0.1, c0[2]], chordR * 0.45, 8)
  }
  // flare header: horizontal inlet, up the boom axis, vertical riser to the tip
  const nps = p.headerNps
  const fd = flangeDims(nps, p.rating)
  const Lf = fd.hubLength + fd.raisedFaceHeight
  const inFace: V3 = [d.xIn, A.y, 0]
  flange(k, nps, p.rating, inFace, [-1, 0, 0], true)
  const jBottom = jc.y - GASKET / 2 - Lf
  pipeRun(k, [[d.xIn + Lf, A.y, 0], v(A), v(B2), [B2.x, jBottom, 0]], nps, { mat: 'pipePaint', radius: 'LR' })
  // pipe support under the inlet run and guides along the boom
  k.box('structSteel', [0.25, A.y - pipeOD(nps) / 2, 0.25], [d.xIn + 0.6, (A.y - pipeOD(nps) / 2) / 2, 0])
  basePlate(k, d.xIn + 0.6, 0, 0.45, 'structSteel')
  const yGuide = (tt: number) => A.clone().addScaledVector(d.dir, L * tt)
  for (let s = 1; s < t.n; s += 2) {
    const tt = s / t.n
    const c = yGuide(tt)
    for (const i of [0, 1]) k.rod('structSteel', v(c.clone().addScaledVector(d.upP, -pipeOD(nps) / 2 - 0.03)), t.at(tt, i), 0.035, 6)
  }
  // tip
  const tip = flareTip(k, v(jc), nps, p.rating, Math.max(1, Math.round(p.pilots)))
  // tip platform with an opening for the riser
  const S = Math.max(2.6, w1 + 1.4)
  const hole = pipeOD(nps) / 2 + 0.12
  const cx = B2.x
  const strip = (S - 2 * hole) / 2
  grating(k, [cx - hole - strip / 2, yPl, 0], strip, S)
  grating(k, [cx + hole + strip / 2, yPl, 0], strip, S)
  grating(k, [cx, yPl, -hole - strip / 2], 2 * hole, strip)
  grating(k, [cx, yPl, hole + strip / 2], 2 * hole, strip)
  for (const s of [-1, 1]) {
    k.rod('structSteel', [cx - S / 2, yPl - 0.08, s * (S / 2 - 0.05)], [cx + S / 2, yPl - 0.08, s * (S / 2 - 0.05)], 0.05, 8)
    k.rod('structSteel', [cx + s * (S / 2 - 0.05), yPl - 0.08, -S / 2], [cx + s * (S / 2 - 0.05), yPl - 0.08, S / 2], 0.05, 8)
  }
  for (const i of [0, 1, 2, 3]) {
    const c = t.at(1, i)
    k.rod('structSteel', c, [c[0] < cx ? cx - S / 2 + 0.05 : cx + S / 2 - 0.05, yPl - 0.1, c[2] < 0 ? -S / 2 + 0.05 : S / 2 - 0.05], 0.05, 8)
  }
  const e = S / 2
  // obstruction lights on the tip platform rail
  const lamp = paint('#ff2a1a', { emissive: '#ff1a0a', emissiveIntensity: 1.5, clearcoat: 0 })
  for (const sz of [-1, 1]) {
    k.cyl('galvanised', 0.04, 0.12, [cx + e, yPl + 1.16, sz * e], 'y', 10)
    k.sphere(lamp, 0.06, [cx + e, yPl + 1.27, sz * e], undefined, 12)
  }
  handrail(k, [[cx - e + 0.6, yPl, -e], [cx + e, yPl, -e], [cx + e, yPl, e], [cx - e, yPl, e], [cx - e, yPl, -e + 0.6]])
  k.rod('structSteel', [cx - e, yPl - 0.1, 0], v(B.clone().addScaledVector(d.upP, -w1 / 2)), 0.05, 8)
  // inclined access way along the bottom chords: horizontal treads and rails
  const rise = 0.22
  const nT = Math.floor((L * Math.sin(th)) / rise)
  for (let i = 1; i < nT; i++) {
    const tt = i / nT
    const a = t.at(tt, 0)
    const b = t.at(tt, 1)
    const w = Math.abs(a[2] - b[2]) - 0.1
    k.box('galvanised', [0.24, 0.03, w], [(a[0] + b[0]) / 2 + 0.12, (a[1] + b[1]) / 2 + chordR + 0.015, 0])
  }
  for (const i of [0, 1]) {
    const a = t.at(0.02, i)
    const b = t.at(0.98, i)
    const s = i ? 1 : -1
    k.rod('safetyYellow', [a[0], a[1] + 1.0, a[2] - s * 0.12], [b[0], b[1] + 1.0, b[2] - s * 0.12], 0.0215, 8)
    for (let j = 0; j <= 20; j++) {
      const c = t.at(0.02 + (0.96 * j) / 20, i)
      k.rod('safetyYellow', [c[0], c[1], c[2] - s * 0.12], [c[0], c[1] + 1.0, c[2] - s * 0.12], 0.02, 6)
    }
  }
  const be = t.at(1, 0)
  ladder(k, [be[0] + 0.25, be[1], 0], yPl, [-1, 0, 0], { cage: false })
  // pilot gas and ignition lines along an upper chord
  tip.pilots.forEach((pp, i) => {
    const off = 0.12 + i * 0.06
    const a = t.at(0, 3)
    const b = t.at(1, 3)
    k.tube('stainless', [[a[0], a[1] - off, a[2] - off], [b[0], b[1] - off, b[2] - off], [pp[0], b[1] - off, pp[2]], pp], 0.0167, 6, 0.3)
  })
  tagPlate(k, p.tag, [d.xIn + 0.6, 1.0, 0.126], 'z', 0.2)
}
