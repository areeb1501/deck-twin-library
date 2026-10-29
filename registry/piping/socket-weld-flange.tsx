// Socket-weld flange: ASME B16.5 SW flange (NPS 1/2–3) with socket bore, pipe-stop shoulder, 1.6 mm expansion gap and outside fillet weld per ASME B31.3.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { pipeWall, pipeOD, type Rating, type Schedule } from '../lib/standards'
import { facingHeight, filletWeld, looseFlange, marking, pipeStub, type Facing } from './_flanges'

export interface SocketWeldFlangeProps {
  /** nominal pipe size, inches (1/2–3; 1/2–2-1/2 in Class 900 / 1500) */
  nps?: number
  rating?: Rating
  facing?: Facing
  /** pipe schedule; sets the bore below the socket */
  schedule?: Schedule
  /** pipe inserted into the socket, m (0 for the bare flange) */
  stub?: number
  tag?: string
}

export const defaults = { nps: 2, rating: 600 as Rating, facing: 'RF' as Facing, schedule: '80' as Schedule, stub: 0.15, tag: '' }

export const clampNps = (nps: number, rating: Rating) => Math.min(Math.max(nps, 0.5), rating >= 900 ? 2.5 : 3)
const clampRating = (r: Rating): Rating => (r > 1500 ? 1500 : r)

// Port A is the gasket face at the origin, pointing -X; the socket opens along +X.
export function ports(p: SocketWeldFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('A', 'Flange face', [0, 0, 0], [-1, 0, 0], clampNps(nps, clampRating(rating)), clampRating(rating))]
}

export function SocketWeldFlange({ nps = defaults.nps, rating = defaults.rating, facing = defaults.facing, schedule = defaults.schedule, stub = defaults.stub, tag = defaults.tag, ...group }: SocketWeldFlangeProps & GroupProps) {
  const r = clampRating(rating)
  const data = useKit((k) => build(k, clampNps(nps, r), r, facing, schedule, Math.max(0, stub), tag), [nps, r, facing, schedule, stub, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SocketWeldFlange

function build(k: Kit, nps: number, rating: Rating, facing: Facing, schedule: Schedule, stub: number, tag: string) {
  const h = facingHeight(facing, nps, rating)
  const base: [number, number, number] = [h, 0, 0]
  const dir: [number, number, number] = [-1, 0, 0]
  const i = looseFlange(k, base, dir, { kind: 'SW', nps, rating, facing, schedule, marking: tag || marking('SW', nps, rating, facing, `SCH ${schedule}`) })
  if (stub <= 0) return
  // pipe bottomed in the socket then backed off 1.6 mm (B31.3 expansion gap)
  const yEnd = -i.Y + i.D - 0.0016
  pipeStub(k, [h - yEnd, 0, 0], [1, 0, 0], stub + (i.Y - i.D + 0.0016), nps, schedule, 'square', 'bevel')
  filletWeld(k, base, dir, pipeOD(nps) / 2, -i.Y, Math.max(0.003, Math.min(pipeWall(nps, schedule) * 1.25, 0.012)))
}
