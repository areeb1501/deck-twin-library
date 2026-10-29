// API 6A angle-body choke: forged block, hammer-nut bonnet, adjustable stem with handwheel or stepping actuator, or positive (fixed bean). API 6A / API 6B-6BX.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { apiFlange, asmeEquivalent, boreNps, type Psi } from './_api6a'
import { angleChoke, chokeDims, openFace, type ChokeOp } from './_wellparts'

export interface ChokeValveProps {
  /** inlet nominal bore, inches */
  bore?: number
  /** outlet nominal bore, inches */
  outletBore?: number
  pressureRating?: Psi
  operator?: ChokeOp
  /** stem position, 0 closed … 1 open */
  opening?: number
  tag?: string
}

export const defaults = {
  bore: 3.125,
  outletBore: 3.125,
  pressureRating: 5000 as Psi,
  operator: 'handwheel' as ChokeOp,
  opening: 0.5,
  tag: 'HCV-101',
}

type P = typeof defaults

function dims(p: P) {
  const dIn = apiFlange(p.bore, p.pressureRating)
  const dOut = apiFlange(p.outletBore, p.pressureRating)
  return { dIn, dOut, ...chokeDims(dIn, dOut) }
}

export function ports(props: ChokeValveProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  const r = asmeEquivalent(p.pressureRating)
  return [port('inlet', 'Inlet', [-d.inlet, 0, 0], [-1, 0, 0], boreNps(d.dIn.bore), r), port('outlet', 'Outlet', [0, -d.outlet, 0], [0, -1, 0], boreNps(d.dOut.bore), r)]
}

export function ChokeValve(props: ChokeValveProps & GroupProps) {
  const { bore, outletBore, pressureRating, operator, opening, tag, ...group } = { ...defaults, ...props }
  const p = { bore, outletBore, pressureRating, operator, opening, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ChokeValve

function build(k: Kit, p: P) {
  const d = dims(p)
  angleChoke(k, d.dIn, d.dOut, p.operator, p.opening)
  k.at([-d.inlet, 0, 0], '-x', () => openFace(k, d.dIn))
  k.at([0, -d.outlet, 0], '-y', () => openFace(k, d.dOut))
  // body bore liners so the open ends read as hollow
  k.lathe('pipeBore', [[d.dIn.bore * 0.0127, d.inlet], [d.dIn.bore * 0.0127, 0]], [0, 0, 0], '-x', 20)
  k.lathe('pipeBore', [[d.dOut.bore * 0.0127, d.outlet], [d.dOut.bore * 0.0127, 0]], [0, 0, 0], '-y', 20)
  tagPlate(k, p.tag, [0, 0, d.B * 0.46 + 0.001], 'z', Math.min(0.12, d.B * 0.7))
}
