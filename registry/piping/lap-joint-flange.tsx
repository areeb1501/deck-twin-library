// Lap-joint flange: ASME B16.5 loose backing flange with radiused bore on an ASME B16.9 long-pattern or MSS SP-43 short-pattern stub end.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, type Rating, type Schedule } from '../lib/standards'
import { buttWeld, looseFlange, marking, pipeStub, stubEndGeo } from './_flanges'

export interface LapJointFlangeProps {
  /** nominal pipe size, inches (1/2–24) */
  nps?: number
  rating?: Rating
  /** stub-end wall schedule */
  schedule?: Schedule
  /** stub-end pattern: B16.9 long or MSS SP-43 short */
  pattern?: 'long' | 'short'
  /** pipe butt-welded to the stub end, m */
  stub?: number
  /** backing flange material: carbon steel or painted (stub end stays alloy) */
  backing?: 'carbon' | 'galvanised'
  tag?: string
}

export const defaults = { nps: 6, rating: 150 as Rating, schedule: '10S' as Schedule, pattern: 'long' as const, stub: 0, backing: 'carbon' as const, tag: '' }

// Port A is the lap face of the stub end at the origin, pointing -X.
export function ports(p: LapJointFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('A', 'Lap face', [0, 0, 0], [-1, 0, 0], Math.min(nps, 24), rating)]
}

export function LapJointFlange({ nps = defaults.nps, rating = defaults.rating, schedule = defaults.schedule, pattern = defaults.pattern, stub = defaults.stub, backing = defaults.backing, tag = defaults.tag, ...group }: LapJointFlangeProps & GroupProps) {
  const data = useKit((k) => build(k, Math.min(nps, 24), rating, schedule, pattern, Math.max(0, stub), backing, tag), [nps, rating, schedule, pattern, stub, backing, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default LapJointFlange

function build(k: Kit, nps: number, rating: Rating, schedule: Schedule, pattern: 'long' | 'short', stub: number, backing: 'carbon' | 'galvanised', tag: string) {
  const dir: [number, number, number] = [-1, 0, 0]
  // stainless stub end carries the gasket; the loose flange only bolts it up
  const s = stubEndGeo(k, [0, 0, 0], dir, nps, schedule, pattern, 'stainless')
  looseFlange(k, [s.wt + 0.0005, 0, 0], dir, { kind: 'LJ', nps, rating, facing: 'FF', schedule, mat: backing === 'galvanised' ? 'galvanised' : 'flangeSteel', marking: tag || marking('LJ', nps, rating, 'FF') })
  if (stub > 0) {
    pipeStub(k, [s.L, 0, 0], [1, 0, 0], stub, nps, schedule, 'open', 'bevel', 'stainless')
    buttWeld(k, [s.L, 0, 0], [1, 0, 0], pipeOD(nps) / 2, pipeWall(nps, schedule))
  }
}
