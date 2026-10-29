// Threaded flange: ASME B16.5 flange with ASME B1.20.1 NPT internal thread, entry chamfer, screwed pipe and optional seal weld.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { inch, pipeOD, type Rating, type Schedule } from '../lib/standards'
import { definedRating, facingHeight, filletWeld, looseFlange, marking, nptTpi, pipeStub, type Facing } from './_flanges'

export interface ThreadedFlangeProps {
  /** nominal pipe size, inches (1/2–24; 1/2–2-1/2 in Class 1500, to 12 in Class 2500) */
  nps?: number
  rating?: Rating
  facing?: Facing
  schedule?: Schedule
  /** pipe screwed into the flange, m (0 for the bare flange) */
  stub?: number
  /** seal weld at the hub end (B31.3 practice for hydrocarbon service) */
  sealWeld?: boolean
  tag?: string
}

export const defaults = { nps: 2, rating: 300 as Rating, facing: 'RF' as Facing, schedule: '80' as Schedule, stub: 0.15, sealWeld: false, tag: '' }

// Port A is the gasket face at the origin, pointing -X; the threaded bore opens along +X.
export function ports(p: ThreadedFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  const n = Math.min(nps, 24)
  return [port('A', 'Flange face', [0, 0, 0], [-1, 0, 0], n, definedRating('THD', n, rating))]
}

export function ThreadedFlange({ nps = defaults.nps, rating = defaults.rating, facing = defaults.facing, schedule = defaults.schedule, stub = defaults.stub, sealWeld = defaults.sealWeld, tag = defaults.tag, ...group }: ThreadedFlangeProps & GroupProps) {
  const data = useKit((k) => build(k, Math.min(nps, 24), definedRating('THD', Math.min(nps, 24), rating), facing, schedule, Math.max(0, stub), sealWeld, tag), [nps, rating, facing, schedule, stub, sealWeld, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ThreadedFlange

function build(k: Kit, nps: number, rating: Rating, facing: Facing, schedule: Schedule, stub: number, sealWeld: boolean, tag: string) {
  const h = facingHeight(facing, nps, rating)
  const base: [number, number, number] = [h, 0, 0]
  const dir: [number, number, number] = [-1, 0, 0]
  const i = looseFlange(k, base, dir, { kind: 'THD', nps, rating, facing, schedule, marking: tag || marking('THD', nps, rating, facing, 'NPT') })
  if (stub <= 0) return
  // pipe made up power-tight: engaged most of the hub, two threads left showing at the hub end
  const pitch = 0.0254 / nptTpi(nps)
  const L2 = inch((0.8 * (pipeOD(nps) / 0.0254) + 6.8) / nptTpi(nps))
  const engage = Math.min(i.Y - 0.004, L2 - 2 * pitch)
  const yEnd = -i.Y + engage
  pipeStub(k, [h - yEnd, 0, 0], [1, 0, 0], engage + stub, nps, schedule, 'thread', 'bevel')
  if (sealWeld) filletWeld(k, base, dir, pipeOD(nps) / 2, -i.Y, Math.max(0.004, pitch * 3))
}
