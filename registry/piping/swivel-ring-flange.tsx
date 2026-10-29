// Swivel-ring flange: pipeline / riser weld hub with a loose drilled swivel ring for bolt-hole alignment, ASME B16.5 / MSS SP-44 drilling, RTJ or RF hub face.
import type { Kit, Profile } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, pipeWall, type Rating, type Schedule } from '../lib/standards'
import { BEVEL_TAN, LAND, boltHole, buttWeld, drilledPlate, facingHeight, facingLathe, pipeStub, ringGroove, seg, stamp, type Facing } from './_flanges'

export interface SwivelRingFlangeProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  facing?: Facing
  schedule?: Schedule
  /** swivel ring rotation about the axis, degrees (bolt-hole alignment) */
  swivel?: number
  /** pipe stub welded to the hub, m */
  stub?: number
  tag?: string
}

export const defaults = { nps: 12, rating: 600 as Rating, facing: 'RTJ' as Facing, schedule: '80' as Schedule, swivel: 0, stub: 0, tag: '' }

// Port A is the hub face at the origin, pointing -X; hub and pipeline run along +X.
export function ports(p: SwivelRingFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('A', 'Hub face', [0, 0, 0], [-1, 0, 0], nps, rating)]
}

export function SwivelRingFlange({ nps = defaults.nps, rating = defaults.rating, facing = defaults.facing, schedule = defaults.schedule, swivel = defaults.swivel, stub = defaults.stub, tag = defaults.tag, ...group }: SwivelRingFlangeProps & GroupProps) {
  const hub = useKit((k) => buildHub(k, nps, rating, facing, schedule, Math.max(0, stub), tag), [nps, rating, facing, schedule, stub, tag])
  const ring = useKit((k) => buildRing(k, nps, rating, facing), [nps, rating, facing])
  return (
    <group {...group}>
      <KitMesh data={hub} />
      <KitMesh data={ring} rotation-x={(swivel * Math.PI) / 180} />
    </group>
  )
}

export default SwivelRingFlange

/** typical: hub head, neck and swivel-ring proportions from pipeline swivel-ring practice. */
function dims(nps: number, rating: Rating, facing: Facing) {
  const f = flangeDims(nps, rating)
  const ro = pipeOD(nps) / 2
  const h = facingHeight(facing, nps, rating)
  const rFace = facing === 'RTJ' ? ringGroove(nps, rating).K / 2 : f.raisedFace / 2
  const rMax = f.boltCircle / 2 - boltHole(f.boltDia) / 2 - 0.005
  const Rn = Math.max(f.hubDia / 2, ro * 1.06) // neck under the ring
  const Rh = Math.min(Math.max(rFace + 0.006, Rn + 0.012), rMax - 0.0015) // head
  const t = f.thickness * 1.05 // ring thickness
  const th = Math.max(t * 0.42, h + 0.012) // head length
  const k = Math.tan((20 * Math.PI) / 180) // head-to-ring seat taper (typical)
  const yc = -th - (Rh - Rn) * k
  const yRing = -0.003 // ring front sits just behind the head face
  return { f, ro, h, Rn, Rh, t, th, k, yc, yRing, yBack: yRing - t }
}

function buildHub(k: Kit, nps: number, rating: Rating, facing: Facing, schedule: Schedule, stub: number, tag: string) {
  const d = dims(nps, rating, facing)
  const { ro, h, Rn, Rh, th, yc } = d
  const ri = ro - pipeWall(nps, schedule)
  const base: [number, number, number] = [h, 0, 0]
  const dir: [number, number, number] = [-1, 0, 0]
  const n = seg(Rh * 2)
  const { rFace, yb } = facingLathe(k, facing === 'FF' ? 'RF' : facing, nps, rating, ri, base, dir, n)
  // neck runs past the ring, then tapers to the pipe OD at the weld bevel
  const yN = d.yBack - Math.max(0.015, d.t * 0.3)
  const y0 = yN - Math.max(0.03, (Rn - ro) * 3.5)
  const bev = Math.max(0, ro - ri - LAND) * BEVEL_TAN
  const outer: Profile = [[ro, y0 + bev], [ro, y0 + bev + 0.004], [Rn, yN], [Rn, yc], [Rh, -th], [Rh, 0]]
  if (rFace < Rh) outer.push([rFace, 0])
  k.lathe('flangeSteel', outer, base, dir, n)
  k.lathe('machined', [[ri, y0], [ri + LAND, y0], [ro, y0 + bev]], base, dir, n)
  k.lathe('pipeBore', [[ri, yb], [ri, y0]], base, dir, n)
  stamp(k, tag || `${nps}" ${rating}# SWIVEL ${facing === 'RTJ' ? ringGroove(nps, rating).ring : 'RF'}`, base, dir, Rn, d.yBack - 0.003, Math.max(yN + 0.003, d.yBack - 0.003 - (Rn * 0.2)))
  if (stub > 0) {
    pipeStub(k, [h - y0, 0, 0], [1, 0, 0], stub, nps, schedule, 'open', 'bevel')
    buttWeld(k, [h - y0, 0, 0], [1, 0, 0], ro, ro - ri)
  }
}

function buildRing(k: Kit, nps: number, rating: Rating, facing: Facing) {
  const d = dims(nps, rating, facing)
  const { f, h, Rn, Rh, k: tk, th, yRing, yBack } = d
  const base: [number, number, number] = [h, 0, 0]
  const dir: [number, number, number] = [-1, 0, 0]
  const rc = Rh + 0.0015
  const rr = Rn + 0.0015
  const n = seg(f.od)
  drilledPlate(k, 'flangeSteel', 'flangeSteel', [h - yBack, 0, 0], dir, d.t, rc, f.od / 2, { n: f.bolts, bc: f.boltCircle, hole: boltHole(f.boltDia) }, n)
  // counterbore over the head, tapered seat, bore over the neck, back face
  const ySeat = -th - (rc - rr) * tk
  k.lathe('machined', [[rc, yRing], [rc, -th], [rr, ySeat], [rr, yBack], [rc, yBack]], base, dir, n)
}
