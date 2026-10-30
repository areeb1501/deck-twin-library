/** Jump from the console to the 3D view: select a tag, frame it, close the HMI. */
import type { PickData } from '../../model/types'
import { usePlantStore } from '../../state/plantStore'
import { useStore } from '../../state/store'

/** what kind of plant item a tag is (for selecting it in 3D), or null when it isn't one (zones, systems) */
export function pickOf(tag: string): PickData | null {
  const p = usePlantStore.getState().plant
  if (p.equipment.some((e) => e.tag === tag)) return { tag, kind: 'equipment' }
  if (p.valves.some((v) => v.tag === tag)) return { tag, kind: 'valve' }
  if (p.instruments.some((i) => i.tag === tag)) return { tag, kind: 'instrument' }
  if (p.lines.some((l) => l.tag === tag)) return { tag, kind: 'line' }
  return null
}

/** select a tag in the 3D view, frame it and close the console */
export function showIn3D(tag: string) {
  const pick = pickOf(tag)
  if (!pick) return false
  const st = useStore.getState()
  st.select(pick)
  st.requestFocus(tag)
  st.setHmi(null)
  return true
}
