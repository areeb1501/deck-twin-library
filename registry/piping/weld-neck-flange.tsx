// Weld-neck flange: ASME B16.5 / B16.47 Series A forged WN flange with tapered hub, B16.25 bevelled weld end, RF / FF / RTJ facing and drilled bolt holes.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, type Rating, type Schedule } from '../lib/standards'
import { buttWeld, facingHeight, looseFlange, marking, pipeStub, type Facing } from './_flanges'

export interface WeldNeckFlangeProps {
  /** nominal pipe size, inches */
  nps?: number
  rating?: Rating
  facing?: Facing
  /** pipe schedule matched by the bore */
  schedule?: Schedule
  /** pipe butt-welded to the weld end, m (0 shows the bevel) */
  stub?: number
  /** stamped marking, empty for the standard marking */
  tag?: string
}

export const defaults = { nps: 6, rating: 300 as Rating, facing: 'RF' as Facing, schedule: '40' as Schedule, stub: 0, tag: '' }

// Port A is the gasket face at the origin, pointing -X; the hub runs along +X.
export function ports(p: WeldNeckFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('A', 'Flange face', [0, 0, 0], [-1, 0, 0], nps, rating)]
}

export function WeldNeckFlange({ nps = defaults.nps, rating = defaults.rating, facing = defaults.facing, schedule = defaults.schedule, stub = defaults.stub, tag = defaults.tag, ...group }: WeldNeckFlangeProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, facing, schedule, Math.max(0, stub), tag), [nps, rating, facing, schedule, stub, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default WeldNeckFlange

function build(k: Kit, nps: number, rating: Rating, facing: Facing, schedule: Schedule, stub: number, tag: string) {
  const h = facingHeight(facing, nps, rating)
  const i = looseFlange(k, [h, 0, 0], [-1, 0, 0], { kind: 'WN', nps, rating, facing, schedule, marking: tag || marking('WN', nps, rating, facing, `SCH ${schedule}`) })
  if (stub > 0) {
    const x = h + i.Y
    pipeStub(k, [x, 0, 0], [1, 0, 0], stub, nps, schedule, 'open', 'bevel')
    buttWeld(k, [x, 0, 0], [1, 0, 0], pipeOD(nps) / 2, pipeWall(nps, schedule))
  }
}
