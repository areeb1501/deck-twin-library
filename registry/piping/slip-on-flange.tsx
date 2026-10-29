// Slip-on flange: ASME B16.5 SO flange slid over the pipe with the pipe end set back, inside and outside fillet welds per ASME B31.3.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, type Rating, type Schedule } from '../lib/standards'
import { arc, definedRating, facingHeight, filletWeld, looseFlange, marking, pipeStub, seg, type Facing } from './_flanges'

export interface SlipOnFlangeProps {
  /** nominal pipe size, inches (B16.5 slip-on: 1/2–24) */
  nps?: number
  rating?: Rating
  facing?: Facing
  schedule?: Schedule
  /** pipe stub behind the hub, m */
  stub?: number
  /** stamped marking, empty for the standard marking */
  tag?: string
}

export const defaults = { nps: 4, rating: 150 as Rating, facing: 'RF' as Facing, schedule: '40' as Schedule, stub: 0.2, tag: '' }

// Port A is the gasket face at the origin, pointing -X; hub and pipe run along +X.
export function ports(p: SlipOnFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const n = Math.min(nps, 24)
  return [port('A', 'Flange face', [0, 0, 0], [-1, 0, 0], n, definedRating('SO', n, rating))]
}

export function SlipOnFlange({ nps = defaults.nps, rating = defaults.rating, facing = defaults.facing, schedule = defaults.schedule, stub = defaults.stub, tag = defaults.tag, ...group }: SlipOnFlangeProps & GroupProps) {
  const data = useKit((k) => build(k, Math.min(nps, 24), definedRating('SO', Math.min(nps, 24), rating), facing, schedule, Math.max(0, stub), tag), [nps, rating, facing, schedule, stub, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SlipOnFlange

function build(k: Kit, nps: number, rating: Rating, facing: Facing, schedule: Schedule, stub: number, tag: string) {
  const h = facingHeight(facing, nps, rating)
  const base: [number, number, number] = [h, 0, 0]
  const dir: [number, number, number] = [-1, 0, 0]
  const i = looseFlange(k, base, dir, { kind: 'SO', nps, rating, facing, schedule, marking: tag || marking('SO', nps, rating, facing) })
  const ro = pipeOD(nps) / 2
  const wt = pipeWall(nps, schedule)
  const ri = ro - wt
  // B31.3: inside fillet no larger than the wall or 6 mm; pipe end set back so the weld stays clear of the face
  const leg = Math.min(wt, 0.006)
  const yEnd = -leg - 0.0015
  const L = i.Y + yEnd + stub
  pipeStub(k, [h - yEnd, 0, 0], [1, 0, 0], L, nps, schedule, 'open', stub > 0 ? 'bevel' : 'square')
  const n = seg(ro * 2)
  k.lathe('flangeSteel', [[i.B, yEnd + leg], ...arc(i.B, yEnd, leg, Math.PI / 2, Math.PI, 4).slice(1, -1).map(([r, y]) => [r + leg * 0.12, y + leg * 0.12] as [number, number]), [i.B - leg, yEnd]], base, dir, n)
  k.lathe('machined', [[i.B - leg, yEnd], [ri, yEnd]], base, dir, n)
  // outside fillet at the hub end: 1.4 x wall, limited by the hub
  filletWeld(k, base, dir, ro, -i.Y, Math.min(wt * 1.4, 0.014), n)
}
