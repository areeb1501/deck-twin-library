import { Door, Spinner } from '../../anim'
import { KitMesh } from './KitMesh'
import type { DoorSpec, RotorSpec } from './rotors'

/** Turning assemblies of a machine (fans, couplings, shafts): each spins while `tag` runs. */
export function Rotors({ tag, rotors, shadows = false }: { tag: string; rotors: RotorSpec[]; shadows?: boolean }) {
  return (
    <>
      {rotors.map((r, i) => (
        <Spinner key={i} tag={tag} axis={r.axis} rpm={r.rpm} position={r.pos} rotation={r.rot}>
          <KitMesh data={r.built} shadows={shadows} />
        </Spinner>
      ))}
    </>
  )
}

/** Hinged access doors driven by the simulation's door state (`${tag}/${id}`). */
export function Doors({ tag, doors }: { tag: string; doors: DoorSpec[] }) {
  return (
    <>
      {doors.map((d, i) => (
        <Door key={`${d.id}-${i}`} tag={tag} id={d.id} hinge={d.hinge} rotationY={d.rotationY} openAngle={d.openAngle}>
          <KitMesh data={d.built} />
        </Door>
      ))}
    </>
  )
}
