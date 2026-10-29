// Blind flange closing a line end: ASME B16.5 / B16.47 blind with raised face, spiral-wound gasket, stud bolts and the mating weld-neck flange.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { blindThickness, flange as flangeDims, type Rating, type Schedule } from '../lib/standards'
import { GAP, boreOf, buttWeld, flangeLength, jointStuds, jointTag, portFlange, spiralWound, straight } from './_piping'

export interface BlindFlangeProps {
  nps?: number
  rating?: Rating
  schedule?: Schedule
  /** draw the mating weld-neck flange, gasket and studs (the plant assembler draws the same parts when a line ends here) */
  mating?: boolean
  /** pipe stub behind the weld neck, m */
  stub?: number
  /** joint tag, empty for none */
  tag?: string
}

export const defaults = { nps: 6, rating: 300 as Rating, schedule: '40' as Schedule, mating: true, stub: 0.2, tag: '' }

// Origin at the gasket centre. Port A is the blind's raised face, pointing back down the line (-X).
export function ports(p: BlindFlangeProps = {}): Port[] {
  const { nps, rating } = { ...defaults, ...p }
  return [port('A', 'Blind face', [GAP / 2, 0, 0], [-1, 0, 0], nps, rating)]
}

export function BlindFlange({ nps = defaults.nps, rating = defaults.rating, schedule = defaults.schedule, mating = defaults.mating, stub = defaults.stub, tag = defaults.tag, ...group }: BlindFlangeProps & GroupProps) {
  const data = useKit((k) => build(k, nps, rating, schedule, mating, Math.max(0, stub), tag), [nps, rating, schedule, mating, stub, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default BlindFlange

function build(k: Kit, nps: number, rating: Rating, schedule: Schedule, mating: boolean, stub: number, tag: string) {
  const f = flangeDims(nps, rating)
  const tb = blindThickness(nps, rating)
  const x0 = GAP / 2
  const rf = f.raisedFaceHeight
  const seg = nps >= 6 ? 48 : 32
  k.lathe('machined', [[0, x0], [f.raisedFace / 2, x0], [f.raisedFace / 2, x0 + rf]], [0, 0, 0], 'x', seg)
  k.lathe('flangeSteel', [[f.raisedFace / 2, x0 + rf], [f.od / 2, x0 + rf], [f.od / 2, x0 + rf + tb], [0, x0 + rf + tb]], [0, 0, 0], 'x', seg)
  const xo = x0 + rf + tb
  // 3/4" bleed tapping with hex plug in the centre of the outer face
  k.cyl('flangeSteel', 0.022, 0.006, [xo + 0.003, 0, 0], 'x', 20)
  k.hex('nut', 0.03, 0.012, [xo + 0.012, 0, 0], 'x')
  // DIN 580 eyebolt in the rim for handling heavier blinds
  if (nps >= 6) {
    const s = Math.min(2, Math.max(0.7, f.od / 0.4))
    const xm = x0 + rf + tb / 2
    k.cyl('flangeSteel', 0.02 * s, 0.006 * s, [xm, f.od / 2 + 0.003 * s, 0], 'y', 16)
    k.cyl('galvanised', 0.008 * s, 0.03 * s, [xm, f.od / 2 + 0.012 * s, 0], 'y', 10)
    k.torus('galvanised', 0.022 * s, 0.006 * s, [xm, f.od / 2 + 0.048 * s, 0], 'x', 8, 20)
  }
  if (!mating) return
  const fl = flangeLength(nps, rating)
  portFlange(k, nps, rating, [-GAP / 2, 0, 0], [1, 0, 0], { studs: false, bore: boreOf(nps, schedule) })
  if (stub > 0) {
    straight(k, 'pipePaint', [-GAP / 2 - fl, 0, 0], [-1, 0, 0], stub, nps, schedule, 'open', 'bevel')
    buttWeld(k, nps, [-GAP / 2 - fl, 0, 0], [1, 0, 0])
  }
  spiralWound(k, nps, rating, [0, 0, 0], [1, 0, 0])
  jointStuds(k, nps, rating, [0, 0, 0], [1, 0, 0])
  if (tag) jointTag(k, nps, rating, tag)
}
