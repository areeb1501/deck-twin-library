// Straight pipe spool: ASME B36.10 pipe, B16.5 weld-neck flanged or B16.25 bevelled ends, aluminium-clad insulation, ISO 14726 bands.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { port, type Port } from '../lib/ports'
import { flange as flangeDims, pipeOD, studLength, type Rating, type Schedule, type Service } from '../lib/standards'
import { boreOf, buttWeld, cladding, flangeLength, portFlange, serviceBand, straight } from './_piping'

export interface PipeSpoolProps {
  /** nominal pipe size, inches */
  nps?: number
  schedule?: Schedule
  rating?: Rating
  /** overall length end to end (flange face or bevel), m */
  length?: number
  ends?: 'flanged' | 'plain' | 'flanged-plain'
  insulated?: boolean
  service?: Service | 'none'
}

export const defaults = {
  nps: 6,
  schedule: '40' as Schedule,
  rating: 300 as Rating,
  length: 3,
  ends: 'flanged' as 'flanged' | 'plain' | 'flanged-plain',
  insulated: false,
  service: 'oil' as Service | 'none',
}

export function ports(p: PipeSpoolProps = {}): Port[] {
  const { nps, rating, length, ends } = { ...defaults, ...p }
  const L = Math.max(length, 0.1)
  const fa = ends !== 'plain'
  const fb = ends === 'flanged'
  return [
    port('A', fa ? 'End A (flange)' : 'End A (weld end)', [-L / 2, 0, 0], [-1, 0, 0], nps, fa ? rating : undefined),
    port('B', fb ? 'End B (flange)' : 'End B (weld end)', [L / 2, 0, 0], [1, 0, 0], nps, fb ? rating : undefined),
  ]
}

export function PipeSpool(props: PipeSpoolProps & GroupProps) {
  const { nps, schedule, rating, length, ends, insulated, service, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, nps, schedule, rating, Math.max(length, 0.1), ends, insulated, service), [nps, schedule, rating, length, ends, insulated, service])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PipeSpool

function build(k: Kit, nps: number, schedule: Schedule, rating: Rating, L: number, ends: PipeSpoolProps['ends'], insulated: boolean, service: Service | 'none') {
  const fa = ends !== 'plain'
  const fb = ends === 'flanged'
  const fl = flangeLength(nps, rating)
  const body: MatKey = service === 'firewater' ? 'firewaterRed' : 'pipePaint'
  const xa = -L / 2 + (fa ? fl : 0)
  const xb = L / 2 - (fb ? fl : 0)
  straight(k, body, [xa, 0, 0], [1, 0, 0], xb - xa, nps, schedule, fa ? 'open' : 'bevel', fb ? 'open' : 'bevel')
  if (fa) {
    portFlange(k, nps, rating, [-L / 2, 0, 0], [-1, 0, 0], { bore: boreOf(nps, schedule) })
    buttWeld(k, nps, [xa, 0, 0], [1, 0, 0])
  }
  if (fb) {
    portFlange(k, nps, rating, [L / 2, 0, 0], [1, 0, 0], { bore: boreOf(nps, schedule) })
    buttWeld(k, nps, [xb, 0, 0], [1, 0, 0])
  }
  // DSAW pipe above NPS 16 carries a longitudinal seam
  const ro = pipeOD(nps) / 2
  if (nps >= 18) k.box('flangeSteel', [xb - xa - 0.02, 0.003, 0.012], [(xa + xb) / 2, ro + 0.001, 0])

  // insulation stops clear of the stud bolts so the joint can be broken; plain ends keep a 100 mm weld cut-back
  const f = flangeDims(nps, rating)
  const clear = (flanged: boolean) => (flanged ? Math.max(fl, studLength(nps, rating) / 2 + f.boltDia) + 0.03 : 0.1)
  const c0 = -L / 2 + clear(fa)
  const c1 = L / 2 - clear(fb)
  let r = ro
  if (insulated && c1 - c0 > 0.2) r = cladding(k, [c0, 0, 0], [1, 0, 0], c1 - c0, nps)
  if (service !== 'none' && c1 - c0 > 0.3) {
    const at = [c0 + 0.2, c1 - 0.2]
    for (let s = c0 + 6; s < c1 - 1; s += 6) at.push(s)
    for (const x of at) serviceBand(k, service, [x, 0, 0], [1, 0, 0], r)
  }
}
