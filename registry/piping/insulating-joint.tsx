// Insulating joint for cathodic-protection isolation: monolithic weld-in joint, or a flanged joint with an insulating gasket kit (full-face gasket, stud sleeves, insulating and steel washers).
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, pipeWall, studLength, type Rating, type Schedule } from '../lib/standards'
import { boltHole, buttWeld, drilledPlate, looseFlange, pipeStub, seg } from './_flanges'

export interface InsulatingJointProps {
  /** monolithic weld-in joint, or a flanged joint fitted with an insulating gasket kit */
  variant?: 'monolithic' | 'gasket-kit'
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  schedule?: Schedule
  /** pup / stub length each side, m */
  stub?: number
  tag?: string
}

export const defaults = { variant: 'monolithic' as const, nps: 6, rating: 600 as Rating, schedule: '40' as Schedule, stub: 0.25, tag: 'IJ-001' }

const G10 = '#4f7a46' // glass-reinforced epoxy (G10 / G11)
const KIT_GAP = 0.0032 // typical Type E gasket, 1/8"

function dims(p: InsulatingJointProps) {
  const o = { ...defaults, ...p }
  const od = pipeOD(o.nps)
  const stub = Math.max(0.05, o.stub)
  if (o.variant === 'gasket-kit') {
    const f = flangeDims(o.nps, o.rating)
    const half = KIT_GAP / 2 + f.raisedFaceHeight + f.hubLength
    return { ...o, od, half: half + stub, body: 0 }
  }
  // typical monolithic body: forged hubs ~1.6 x OD, length ~2.4 x OD between tapers
  const body = od * 2.4 + 0.12
  return { ...o, od, half: body / 2 + stub, body }
}

// Ports are the bevelled weld ends of the pups.
export function ports(p: InsulatingJointProps = {}): Port[] {
  const d = dims(p)
  return [port('A', 'Weld end A', [-d.half, 0, 0], [-1, 0, 0], d.nps), port('B', 'Weld end B', [d.half, 0, 0], [1, 0, 0], d.nps)]
}

export function InsulatingJoint({ variant = defaults.variant, nps = defaults.nps, rating = defaults.rating, schedule = defaults.schedule, stub = defaults.stub, tag = defaults.tag, ...group }: InsulatingJointProps & GroupProps) {
  const data = useKit((k) => build(k, { variant, nps, rating, schedule, stub, tag }), [variant, nps, rating, schedule, stub, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default InsulatingJoint

function build(k: Kit, p: InsulatingJointProps) {
  const d = dims(p)
  const { nps, rating, schedule, od } = d
  const ro = od / 2
  const wt = pipeWall(nps, schedule)
  const ri = ro - wt
  const stub = d.half - (d.variant === 'monolithic' ? d.body / 2 : d.half - Math.max(0.05, d.stub))
  if (d.variant === 'monolithic') {
    const B = d.body / 2
    const R = ro * 1.6
    const n = seg(R * 2)
    const coat = paint('#c9cfd4', { roughness: 0.6 })
    const tp = od * 0.45
    // two forged hubs locked over the insulating rings, epoxy coated; the dark band is the exposed insulating filler
    k.lathe(coat, [[ro, -B], [ro, -B + 0.02], [R, -B + 0.02 + tp], [R, -0.012], [R * 0.985, -0.008]], [0, 0, 0], 'x', n)
    k.lathe('rubberBlack', [[R * 0.985, -0.008], [R * 0.985, 0.008]], [0, 0, 0], 'x', n)
    k.lathe(coat, [[R * 0.985, 0.008], [R, 0.012], [R, B - 0.02 - tp], [ro, B - 0.02], [ro, B]], [0, 0, 0], 'x', n)
    k.lathe('pipeBore', [[ri, B], [ri, 0.004], [ri - 0.001, 0.004], [ri - 0.001, -0.004], [ri, -0.004], [ri, -B]], [0, 0, 0], 'x', n)
    // internal insulating lining band visible in the bore
    k.lathe('rubberBlack', [[ri - 0.0012, 0.03], [ri - 0.0012, -0.03]], [0, 0, 0], 'x', n)
    // cathodic-protection test terminals either side of the joint
    for (const s of [-1, 1]) {
      const x = s * (B - 0.02 - tp - 0.04)
      k.cyl(coat, 0.012, 0.02, [x, 0, R + 0.008], 'z', 16)
      k.cyl('brass', 0.005, 0.03, [x, 0, R + 0.03], 'z', 10)
      k.hex('brass', 0.016, 0.006, [x, 0, R + 0.022], 'z')
    }
    for (const s of [-1, 1]) {
      buttWeld(k, [s * B, 0, 0], [1, 0, 0], ro, wt)
      pipeStub(k, [s * B, 0, 0], [s, 0, 0], stub, nps, schedule, 'open', 'bevel')
    }
    if (d.tag) tagPlate(k, `${d.tag}  INSULATING JOINT`, [0, R + 0.002, 0], 'y', Math.min(0.16, R * 1.4))
    // red / white warning band typically painted at the insulating point
    k.cyl(paint('#b52a20'), R + 0.0008, 0.02, [-0.03, 0, 0], 'x', n, undefined, true)
    k.cyl(paint('#eeeeea'), R + 0.0008, 0.02, [0.03, 0, 0], 'x', n, undefined, true)
    return
  }
  // flanged joint with an insulating kit
  const f = flangeDims(nps, rating)
  const n = seg(f.od)
  for (const s of [-1, 1]) {
    const base: V3 = [s * (KIT_GAP / 2 + f.raisedFaceHeight), 0, 0]
    const info = looseFlange(k, base, [-s, 0, 0], { kind: 'WN', nps, rating, facing: 'RF', schedule })
    const we = s * (KIT_GAP / 2 + f.raisedFaceHeight + info.Y)
    buttWeld(k, [we, 0, 0], [1, 0, 0], ro, wt)
    pipeStub(k, [we, 0, 0], [s, 0, 0], stub, nps, schedule, 'open', 'bevel')
  }
  // full-face (Type E) G10 gasket with bolt holes and seal ring
  drilledPlate(k, paint(G10), paint(G10), [-KIT_GAP / 2, 0, 0], [1, 0, 0], KIT_GAP, ri + 0.002, f.od / 2, { n: f.bolts, bc: f.boltCircle, hole: boltHole(f.boltDia) }, n, true)
  // studs with full-length insulating sleeves, G10 washers, steel washers and nuts each side
  const L = studLength(nps, rating) + 0.012
  const hole = boltHole(f.boltDia)
  const span = KIT_GAP + 2 * (f.raisedFaceHeight + f.thickness)
  const tw = 0.003
  for (let i = 0; i < f.bolts; i++) {
    const a = Math.PI / f.bolts + (i / f.bolts) * Math.PI * 2
    // same hole frame as the drilled flanges (perp of +X: u = +Z, w = -Y)
    const z = (Math.cos(a) * f.boltCircle) / 2
    const y = (-Math.sin(a) * f.boltCircle) / 2
    k.cyl('boltXylan', f.boltDia / 2, L, [0, y, z], 'x', 8)
    k.cyl(paint(G10), hole / 2 - 0.0002, span + 0.002, [0, y, z], 'x', 12, undefined, true)
    for (const s of [-1, 1]) {
      const x0 = s * (span / 2)
      k.cyl(paint(G10), f.boltDia * 1.05, tw, [x0 + s * tw / 2, y, z], 'x', 16)
      k.cyl('galvanised', f.boltDia * 1.0, tw * 0.8, [x0 + s * (tw + tw * 0.4), y, z], 'x', 16)
      k.hex('nut', f.boltDia * 1.85, f.boltDia * 0.95, [x0 + s * (tw * 1.8 + f.boltDia * 0.475), y, z], 'x')
    }
  }
}
