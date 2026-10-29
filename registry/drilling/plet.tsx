// Pipeline end termination (PLET): mudmat foundation, protection frame, ROV-operated isolation ball valve, jumper hub and pipeline stub (API 17P / DNV-ST-F101).
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, member, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { faceToFace, pipeID, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { anode, grabBar, hub, mudmat, subseaBall } from './_drill'

export interface PletProps {
  /** pipeline size, inches */
  nps?: number
  rating?: Rating
  /** jumper hub facing up (vertical connection) or along the pipeline (horizontal) */
  hubOrientation?: 'horizontal' | 'vertical'
  /** fit the hub protection cap (before jumper tie-in) */
  hubCap?: boolean
  tag?: string
}

export const defaults = { nps: 12, rating: 1500 as Rating, hubOrientation: 'vertical' as 'horizontal' | 'vertical', hubCap: false, tag: 'PLET-01' }

type P = typeof defaults

// typical 12" PLET: 6 × 3.6 m mudmat, pipe CL 1.0 m above the seabed
function layout(p: Omit<P, 'tag' | 'hubCap'>) {
  const od = pipeOD(p.nps)
  const Lm = Math.max(5, 4 + od * 6)
  const Wm = Math.max(3, 2.4 + od * 4)
  const yP = 0.85 + od * 0.5
  const Lv = faceToFace('ball-full', p.nps, p.rating)
  const xv0 = -0.9 - Lv / 2
  const hubLen = 0.45
  const xh = Lm / 2 - 0.9
  const pipeline: V3 = [-Lm / 2 - 0.4, yP, 0]
  const hubFace: V3 = p.hubOrientation === 'vertical' ? [xh, yP + 0.8 + hubLen, 0] : [Lm / 2 - 0.25 + hubLen, yP, 0]
  return { od, Lm, Wm, yP, Lv, xv0, hubLen, xh, pipeline, hubFace, boreR: pipeID(p.nps, '80') / 2 }
}

export function ports(props: PletProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    port('pipeline', 'Pipeline (tie-in flange)', l.pipeline, [-1, 0, 0], p.nps, p.rating),
    port('hub', 'Jumper hub', l.hubFace, p.hubOrientation === 'vertical' ? [0, 1, 0] : [1, 0, 0], p.nps),
  ]
}

export function Plet({ nps = defaults.nps, rating = defaults.rating, hubOrientation = defaults.hubOrientation, hubCap = defaults.hubCap, tag = defaults.tag, ...group }: PletProps & GroupProps) {
  const data = useKit((k) => build(k, { nps, rating, hubOrientation, hubCap, tag }), [nps, rating, hubOrientation, hubCap, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Plet

function build(k: Kit, p: P) {
  const l = layout(p)
  const { od, Lm, Wm, yP, Lv, xv0, hubLen, xh, pipeline, boreR } = l
  const Y: MatKey = paint('#e3b512', { weather: 1 })
  const PIPE: MatKey = paint('#d9dcd8', { weather: 0.8 })
  const t = mudmat(k, Lm, Wm, { mat: Y, skirt: 0.3 })

  // protection frame: tubular posts, top ring beams and diagonal braces; fishing-friendly sloped ends
  const fx = Lm / 2 - 0.15
  const fz = Wm / 2 - 0.15
  const yTop = yP + 1.0 + (p.hubOrientation === 'vertical' ? 0.6 : 0)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      member(k, [sx * fx, t, sz * fz], [sx * fx * 0.8, yTop, sz * fz], 'CHS 168.3x8', Y)
      k.box(Y, [0.3, 0.02, 0.3], [sx * fx, t + 0.01, sz * fz])
    }
  for (const sz of [-1, 1]) {
    member(k, [-fx * 0.8, yTop, sz * fz], [fx * 0.8, yTop, sz * fz], 'CHS 168.3x8', Y)
    member(k, [-fx, t + 0.1, sz * fz], [0, yTop, sz * fz], 'CHS 114.3x6.3', Y)
    member(k, [fx, t + 0.1, sz * fz], [0, yTop, sz * fz], 'CHS 114.3x6.3', Y)
  }
  for (const sx of [-1, 1]) member(k, [sx * fx * 0.8, yTop, -fz], [sx * fx * 0.8, yTop, fz], 'CHS 168.3x8', Y)
  // padeyes for the installation rigging on the top corners
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const c: V3 = [sx * fx * 0.8, yTop + 0.08, sz * fz]
      k.box(Y, [0.3, 0.2, 0.04], c)
      k.torus('nut', 0.05, 0.012, [c[0], c[1] + 0.03, c[2]], 'z', 6, 16)
    }
  // ROV grab bars along the long sides
  for (const sz of [-1, 1]) grabBar(k, [-fx * 0.4, yTop - 0.35, sz * fz], [fx * 0.4, yTop - 0.35, sz * fz], [0, 0, sz])

  // pipe supports on the mudmat
  const sup = (x: number, y: number, w = od * 1.4) => {
    k.box(Y, [0.25, y - od / 2 - t, w], [x, (y - od / 2 + t) / 2, 0])
    k.box(Y, [0.4, 0.03, w + 0.2], [x, t + 0.015, 0])
    k.lathe(Y, [[od / 2 + 0.02, -0.12], [od / 2 + 0.035, -0.12], [od / 2 + 0.035, 0.12], [od / 2 + 0.02, 0.12]], [x, y, 0], 'x', 32, Math.PI / 2, Math.PI)
  }

  // pipeline tie-in flange (pipeline side), stub through the end frame, isolation ball valve
  const fl = flange(k, p.nps, p.rating, pipeline, '-x', true)
  k.pipe(PIPE, [pipeline[0] + fl, yP, 0], [xv0 - 0.001, yP, 0], od, pipeWall(p.nps, '80'))
  sup(-Lm / 2 + 0.5, yP)
  k.with(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(xv0, yP, 0), () => {
    subseaBall(k, p.nps, p.rating, Lv, { mat: PIPE })
  })
  k.box(Y, [Lv * 0.6, yP - od * 1.2 - t, 0.4], [xv0 + Lv / 2, (yP - od * 1.2 + t) / 2, 0])
  // valve to hub: horizontal run, then either an elbow up to a vertical hub or straight on to a horizontal hub
  const xv1 = xv0 + Lv
  if (p.hubOrientation === 'vertical') {
    const yh = yP + 0.8
    pipeRun(k, [[xv1, yP, 0], [xh, yP, 0], [xh, yh, 0]], p.nps, { mat: PIPE, schedule: '80' })
    hub(k, [xh, yh, 0], 'y', boreR, hubLen, PIPE, p.hubCap)
    // hub support and alignment funnel for the vertical connector
    sup(xh, yP)
    const R = Math.max(0.12, boreR * 2.4)
    const Rf = R + 0.22
    const yf = yh + hubLen - 0.12
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      member(k, [xh + Math.cos(a) * Rf, t, Math.sin(a) * Rf], [xh + Math.cos(a) * Rf, yf, Math.sin(a) * Rf], 'CHS 88.9x6.3', Y)
    }
    k.lathe(Y, [[Rf - 0.02, yf], [Rf, yf], [Rf + 0.35, yf + 0.3], [Rf + 0.33, yf + 0.3], [Rf - 0.02, yf]], [xh, 0, 0], 'y', 40)
  } else {
    const xe = Lm / 2 - 0.25
    k.pipe(PIPE, [xv1, yP, 0], [xe + 0.002, yP, 0], od, pipeWall(p.nps, '80'))
    hub(k, [xe, yP, 0], 'x', boreR, hubLen, PIPE, p.hubCap)
    sup(xe - 0.5, yP)
    // connector receiver: landing beams either side of the hub
    for (const s of [-1, 1]) member(k, [xe - 0.6, yP - 0.4, s * 0.7], [xe + 0.2, yP - 0.4, s * 0.7], 'HEA 200', Y)
    for (const s of [-1, 1]) member(k, [xe - 0.2, t, s * 0.7], [xe - 0.2, yP - 0.5, s * 0.7], 'HEA 200', Y)
  }
  // anodes on the frame posts, nameplate board facing +Z
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) anode(k, [sx * fx * 0.9, t + 0.55, sz * (fz + 0.12)], 'y', 0.55)
  k.box(Y, [1.0, 0.36, 0.02], [0, yTop - 0.75, fz + 0.1])
  for (const s of [-1, 1]) k.box(Y, [0.06, 0.6, 0.02], [s * 0.4, yTop - 0.3, fz + 0.09])
  tagPlate(k, p.tag, [0, yTop - 0.75, fz + 0.112], 'z', 0.9)
}
