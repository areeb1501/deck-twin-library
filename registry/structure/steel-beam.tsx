// Structural steel beam (EN / AISC section or welded plate girder) with bolted end plates or fin plates, bearing stiffeners, at a top-of-steel elevation.
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { beamTOS, endPlate, finPlate, sec, webStiffeners } from './_steel'

export interface SteelBeamProps {
  section?: string
  /** along X, m */
  length?: number
  /** top-of-steel elevation, m */
  topOfSteel?: number
  connection?: 'end-plate' | 'fin-plate' | 'none'
  /** bearing stiffeners at the ends and a load-point stiffener pair at mid-span */
  stiffeners?: boolean
  finish?: 'painted' | 'galvanised'
}

export const defaults = {
  section: 'IPE 300',
  length: 6,
  topOfSteel: 0.3,
  connection: 'end-plate' as 'end-plate' | 'fin-plate' | 'none',
  stiffeners: true,
  finish: 'painted' as 'painted' | 'galvanised',
}

type P = typeof defaults

export function SteelBeam(props: SteelBeamProps & GroupProps) {
  const { section, length, topOfSteel, connection, stiffeners, finish, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { section, length, topOfSteel, connection, stiffeners, finish }), [section, length, topOfSteel, connection, stiffeners, finish])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SteelBeam

function build(k: Kit, p: P) {
  const mat: MatKey = p.finish === 'galvanised' ? 'galvanised' : 'structSteel'
  const s = sec(p.section)
  const L = Math.max(0.5, p.length)
  const yc = p.topOfSteel - s.d / 2
  const open = s.kind === 'I' || s.kind === 'H' || s.kind === 'U'
  const tp = s.d > 0.5 ? 0.025 : 0.02
  const inset = p.connection === 'end-plate' ? tp : 0
  beamTOS(k, -L / 2 + inset, 0, L / 2 - inset, 0, p.topOfSteel, p.section, mat)
  if (p.connection === 'end-plate') {
    endPlate(k, [-L / 2 + tp, yc, 0], 'x', -1, s, mat)
    endPlate(k, [L / 2 - tp, yc, 0], 'x', 1, s, mat)
  } else if (p.connection === 'fin-plate' && open) {
    // supporting fin plates sit just beyond the beam ends (welded to the supporting member)
    finPlate(k, [-L / 2 - 0.012, yc, 0], 'x', 1, s.d, 0.14, mat)
    finPlate(k, [L / 2 + 0.012, yc, 0], 'x', -1, s.d, 0.14, mat)
  }
  if (p.stiffeners && open && s.kind !== 'U') for (const x of [-L / 2 + 0.12 + inset, 0, L / 2 - 0.12 - inset]) webStiffeners(k, [x, yc, 0], 'x', s, mat)
}
