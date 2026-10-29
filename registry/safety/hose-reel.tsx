// Fire hose reel: swinging reel with semi-rigid hose and jet/spray nozzle, isolating ball valve and swivel feed, either open on a pedestal or in a glazed red cabinet. EN 671-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { flange, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { pipeOD, type Rating } from '../lib/standards'
import { ICON, signMat } from './_fg'
import { portBore } from './_valves'

export interface HoseReelProps {
  style?: 'open' | 'cabinet'
  /** supply size, inches */
  nps?: number
  rating?: Rating
  /** hose length, m (sets the drum width) */
  hoseLength?: number
  tag?: string
}

export const defaults = { style: 'open' as 'open' | 'cabinet', nps: 1.5, rating: 150 as Rating, hoseLength: 30, tag: 'HR-7101' }

const RED = 'firewaterRed'
const HOSE = paint('#d2401f', { roughness: 0.7 })
const HOSE_R = 0.0165 // 25 mm bore semi-rigid hose, outside radius

function dims(p: typeof defaults) {
  const turns = Math.max(4, Math.round(p.hoseLength / 6)) // turns per layer, 4 layers
  const w = turns * HOSE_R * 2 + 0.02
  const yc = 1.1
  const zc = p.style === 'open' ? 0.36 : 0.2 + w / 2
  return { turns, w, yc, zc, yi: 0.4, xi: p.style === 'open' ? -0.42 : -0.52, zp: p.style === 'open' ? 0 : 0.09 }
}

export function ports(props: HoseReelProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const { xi, yi, zp } = dims(p)
  return [port('inlet', 'Firewater inlet', [xi, yi, zp], [-1, 0, 0], p.nps, p.rating)]
}

export function HoseReel(props: HoseReelProps & GroupProps) {
  const { style, nps, rating, hoseLength, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { style, nps, rating, hoseLength, tag }), [style, nps, rating, hoseLength, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default HoseReel

/** Drum on axis Z centred at (0, yc, zc): hub, side discs with spokes, wound hose, nozzle parked on a clip. */
function reel(k: Kit, yc: number, zc: number, w: number, turns: number) {
  const R = 0.3
  const hub = 0.1
  // hollow drum barrel with an end ring at each disc
  k.pipe(RED, [0, yc, zc - w / 2], [0, yc, zc + w / 2], 2 * hub, 0.006, 28)
  for (const s of [-1, 1]) {
    const z = zc + (s * (w + 0.008)) / 2
    // back disc solid, front disc spoked so the wound hose shows
    if (s < 0) k.cyl(RED, R, 0.006, [0, yc, z], 'z', 40)
    else
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3
        k.box(RED, [R - 0.05, 0.03, 0.008], [Math.cos(a) * (R + 0.05) / 2, yc + Math.sin(a) * (R + 0.05) / 2, z], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a))
      }
    k.torus(RED, R, 0.01, [0, yc, z], 'z', 6, 40)
    k.cyl(RED, 0.05, 0.02, [0, yc, z + s * 0.012], 'z', 16)
  }
  for (let l = 0; l < 4; l++)
    for (let i = 0; i < turns; i++) k.torus(HOSE, hub + HOSE_R * (1 + 1.9 * l), HOSE_R, [0, yc, zc - w / 2 + 0.01 + HOSE_R * (1 + 2 * i)], 'z', 8, 36)
  // free end over the guide to a jet/spray nozzle in its holder
  const rTop = hub + HOSE_R * (1 + 1.9 * 3)
  const zn = zc + w / 2 + 0.06
  const end: V3 = [R + 0.03, yc - 0.18, zn]
  k.tube(HOSE, [[0.02, yc - rTop, zc + w / 2 - 0.03], [R * 0.7, yc - rTop - 0.04, zc + w / 2 + 0.02], [R + 0.03, yc - 0.32, zn], end], HOSE_R, 8, 0.08)
  k.cyl('brass', HOSE_R + 0.004, 0.05, [end[0], end[1] + 0.025, zn], 'y', 14)
  k.cyl('rubberBlack', 0.024, 0.12, [end[0], end[1] + 0.11, zn], 'y', 14)
  k.lathe('rubberBlack', [[0.024, 0], [0.032, 0.03], [0.03, 0.04], [0.012, 0.04]], [end[0], end[1] + 0.17, zn], 'y', 16)
  k.box('stainless', [0.07, 0.04, 0.008], [R + 0.03, yc - 0.06, zc + w / 2 + 0.024])
  k.torus('stainless', 0.03, 0.004, [end[0], end[1] + 0.12, zn], 'y', 6, 16)
}

function ballValve(k: Kit, nps: number, p: V3) {
  const d = pipeOD(nps)
  k.sphere('brass', d * 0.9, p, [1, 1, 1], 16)
  k.cyl('brass', d * 0.62, d * 3, p, 'y', 16)
  k.cyl('stainless', 0.006, d * 0.8, [p[0], p[1], p[2] + d], 'z', 8)
  k.box(RED, [0.012, 0.016, 0.16], [p[0], p[1], p[2] + d * 1.4 + 0.08])
}

function build(k: Kit, p: typeof defaults) {
  const { style, nps, rating, tag } = p
  const { turns, w, yc, zc, yi, xi, zp } = dims(p)
  const d = pipeOD(nps)
  const xs = style === 'open' ? -0.12 : -0.3
  const zb = zc - w / 2 - 0.09 // swivel behind the drum
  // supply: inlet flange → riser with ball valve → swivel into the hollow axle
  const L = flange(k, nps, rating, [xi, yi, zp], '-x', true)
  portBore(k, nps, rating, [xi, yi, zp], '-x')
  pipeRun(k, [[xi + L, yi, zp], [xs, yi, zp], [xs, yc, zp], [xs, yc, zb], [0, yc, zb]], nps, { mat: RED })
  ballValve(k, nps, [xs, yc - 0.3, zp])
  k.cyl('brass', d * 0.75, 0.05, [0, yc, zb + 0.025], 'z', 16)
  k.cyl('stainless', 0.02, zc - zb, [0, yc, (zb + zc) / 2], 'z', 12)
  reel(k, yc, zc, w, turns)

  if (style === 'open') {
    // pedestal with base plate, swing-arm hinge and arm to the axle
    k.box('galvanised', [0.3, 0.016, 0.3], [0, 0.008, 0])
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.03, 0.014, [sx * 0.11, 0.023, sz * 0.11], 'y')
    k.cyl(RED, pipeOD(3) / 2, yc + 0.2, [0, 0.016 + (yc + 0.2) / 2, 0], 'y', 20)
    k.cyl(RED, pipeOD(3) / 2 + 0.004, 0.008, [0, yc + 0.22, 0], 'y', 20)
    for (const y of [yc - 0.12, yc + 0.12]) {
      k.cyl(RED, 0.055, 0.05, [0, y, 0], 'y', 16)
      k.box(RED, [0.06, 0.04, zb - 0.02], [0.08, y, zb / 2 + 0.02])
    }
    k.box(RED, [0.06, 0.32, 0.03], [0.08, yc, zb])
    k.rod(RED, [0.08, yc, zb], [0.02, yc, zb], 0.02, 10)
    // pipe clamp to the pedestal
    k.box('galvanised', [Math.abs(xs) + 0.02, 0.03, 0.01], [xs / 2, yi + 0.3, 0.05])
    tagPlate(k, tag, [0, 0.6, pipeOD(3) / 2 + 0.002], 'z', 0.08)
    // ISO 7010 F002 sign on the pedestal top
    k.box('galvanised', [0.03, 0.25, 0.03], [0, yc + 0.35, 0])
    k.box('stainless', [0.36, 0.18, 0.004], [0, yc + 0.5, 0.017])
    k.plane(signMat(['FIRE', 'HOSE REEL'], '#c22a20', '#ffffff', ICON.hose), 0.35, 0.175, [0, yc + 0.5, 0.0205])
  } else {
    // glazed cabinet on a galvanised stand
    const W = 0.78
    const H = 0.86
    const Dd = zc + w / 2 + 0.16
    const y0 = yc - H / 2 - 0.0
    const t = 0.0025
    k.box(RED, [W, H, t], [0, yc, -0.0])
    k.box(RED, [t, H, Dd], [-W / 2, yc, Dd / 2])
    k.box(RED, [t, H, Dd], [W / 2, yc, Dd / 2])
    k.box(RED, [W, t, Dd], [0, y0, Dd / 2])
    k.box(RED, [W, t, Dd], [0, y0 + H, Dd / 2])
    k.box(RED, [W + 0.02, 0.02, Dd + 0.02], [0, y0 + H + 0.01, Dd / 2])
    // door: frame round a large window, hinges left, latch right
    const fw = 0.06
    k.box(RED, [W, fw, 0.02], [0, y0 + fw / 2, Dd])
    k.box(RED, [W, fw, 0.02], [0, y0 + H - fw / 2, Dd])
    k.box(RED, [fw, H, 0.02], [-W / 2 + fw / 2, yc, Dd])
    k.box(RED, [fw, H, 0.02], [W / 2 - fw / 2, yc, Dd])
    k.box('glass', [W - 2 * fw, H - 2 * fw, 0.004], [0, yc, Dd])
    for (const y of [y0 + 0.12, y0 + H - 0.12]) k.cyl('stainless', 0.008, 0.08, [-W / 2 - 0.006, y, Dd], 'y', 10)
    k.box('stainless', [0.025, 0.12, 0.02], [W / 2 - fw / 2, yc, Dd + 0.02])
    k.plane(signMat(['FIRE', 'HOSE REEL'], '#c22a20', '#ffffff', ICON.hose), 0.4, 0.2, [0, y0 + H - 0.14, Dd + 0.004])
    k.box('rubberBlack', [W - 2 * fw, 0.02, 0.006], [0, y0 + fw + 0.01, Dd])
    // stand: four angle legs and a base frame
    for (const sx of [-1, 1])
      for (const sz of [0.03, Dd - 0.03]) {
        k.box('galvanised', [0.04, y0, 0.04], [sx * (W / 2 - 0.03), y0 / 2, sz])
        k.box('galvanised', [0.1, 0.012, 0.1], [sx * (W / 2 - 0.03), 0.006, sz])
      }
    for (const sx of [-1, 1]) k.box('galvanised', [0.04, 0.04, Dd], [sx * (W / 2 - 0.03), 0.25, Dd / 2])
    k.box('galvanised', [W - 0.04, 0.04, 0.04], [0, 0.25, 0.03])
    // internal reel bracket
    k.box(RED, [0.08, 0.36, zb - 0.002], [0, yc, zb / 2 + 0.001])
    k.cyl('rubberBlack', d * 0.75, 0.01, [xs, y0, zp], 'y', 16)
    tagPlate(k, tag, [W / 2 + 0.002, yc + 0.25, Dd / 2], 'x', 0.09)
  }
}
