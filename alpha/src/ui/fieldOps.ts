/**
 * Field operator actions: machinery-protection trips can only be reset at the machine, so the
 * operator has to walk there. `goToMachine` closes the console and walks the person to the tag;
 * `nearMachine` says whether the walker is close enough to reset it locally.
 */
import { useStore } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { walkPose } from '../scene/Walk'

/** how close (m, plan distance) the field operator must be to reset a machine locally */
export const LOCAL_REACH = 8

export function nearMachine(tag: string): boolean {
  if (!useStore.getState().walk) return false
  const e = usePlantStore.getState().plant.equipment.find((x) => x.tag === tag)
  if (!e) return false
  const d = Math.hypot(walkPose.x - e.position[0], walkPose.z - e.position[2])
  return d <= LOCAL_REACH && Math.abs(walkPose.floor - e.position[1]) < 3.5
}

export function goToMachine(tag: string) {
  const s = useStore.getState()
  s.setHmi(null)
  s.select({ tag, kind: 'equipment' })
  if (!s.walk) s.setWalk(true)
  // the walker takes a frame to start; then walk up to the machine
  setTimeout(() => useStore.getState().requestFocus(tag), 300)
}
