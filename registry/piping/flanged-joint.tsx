// Bolted flange joint: pair of ASME B16.5 / B16.47 weld-neck RF flanges, B16.20 spiral-wound gasket, B7 / 2H stud bolts, pipe stubs and a joint tag.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import type { Rating, Schedule } from '../lib/standards'
import { GAP, boreOf, buttWeld, flangeLength, jointStuds, jointTag, portFlange, spiralWound, straight } from './_piping'

export interface FlangedJointProps {
  nps?: number
  rating?: Rating
  schedule?: Schedule
  /** pipe stub beyond each weld neck, m (0 = weld ends at the hubs) */
  stub?: number
  /** bolt-tensioning / joint integrity tag, empty for none */
  tag?: string
}

export const defaults = { nps: 6, rating: 300 as Rating, schedule: '40' as Schedule, stub: 0.15, tag: 'J-101' }

const half = (nps: number, rating: Rating, stub: number) => GAP / 2 + flangeLength(nps, rating) + Math.max(0, stub)

export function ports(p: FlangedJointProps = {}): Port[] {
  const { nps, rating, stub } = { ...defaults, ...p }
  const x = half(nps, rating, stub)
  return [port('A', 'End A (weld end)', [-x, 0, 0], [-1, 0, 0], nps), port('B', 'End B (weld end)', [x, 0, 0], [1, 0, 0], nps)]
}

export function FlangedJoint({ nps = defaults.nps, rating = defaults.rating, schedule = defaults.schedule, stub = defaults.stub, tag = defaults.tag, ...group }: FlangedJointProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, schedule, Math.max(0, stub), tag), [nps, rating, schedule, stub, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FlangedJoint

function build(k: Kit, nps: number, rating: Rating, schedule: Schedule, stub: number, tag: string) {
  const fl = flangeLength(nps, rating)
  const w = GAP / 2 + fl
  for (const s of [-1, 1]) {
    portFlange(k, nps, rating, [(s * GAP) / 2, 0, 0], [-s, 0, 0], { studs: false, bore: boreOf(nps, schedule) })
    if (stub > 0) {
      straight(k, 'pipePaint', [s * w, 0, 0], [s, 0, 0], stub, nps, schedule, 'open', 'bevel')
      buttWeld(k, nps, [s * w, 0, 0], [1, 0, 0])
    }
  }
  spiralWound(k, nps, rating, [0, 0, 0], [1, 0, 0])
  jointStuds(k, nps, rating, [0, 0, 0], [1, 0, 0])
  if (tag) jointTag(k, nps, rating, tag)
}
