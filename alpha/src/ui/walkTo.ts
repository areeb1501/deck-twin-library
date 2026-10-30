/**
 * "Walk to" from anywhere (console dashboard, alerts, CCTV, chat answers, the walk-mode minimap and its
 * "Go to…" search): close the console, enter the walkthrough and stand a few metres in front of the item,
 * facing it, on the right deck.
 *
 * The walker (scene/Walk.tsx) handles `requestFocus` while walking. It only exists once walk mode is
 * on, so the focus is requested a moment after walk mode starts (a fresh nonce, after the walker's
 * own mount placement).
 *
 * Control rooms (modules with a `controlRoom` interior: the CCR B-9300, the WHP-N room B-N295) are
 * different: "walk to" would stand you outside the wall, so `enterRoom` lands you inside, doors open,
 * where the "Sit at the console" prompt fires. `goToTag` picks the right one of the two.
 */
import { useStore } from '../state/store'
import { usePlantStore } from '../state/plantStore'
import { useSim } from '../state/sim'
import { levelAt, moduleDoors, placeWalker, walkAuto, walkLevels, walkPose } from '../scene/Walk'
import type { Module } from '../model/types'
import { pickOf } from './hmi/nav'

export function walkToTag(tag: string): boolean {
  const pick = pickOf(tag)
  if (!pick) return false
  const st = useStore.getState()
  st.setHmi(null)
  if (st.craneCab) st.setCraneCab(null)
  st.select(pick)
  if (st.walk) {
    if (walkAuto.active) walkAuto.onInterrupt?.()
    st.requestFocus(tag)
    return true
  }
  st.setWalk(true)
  window.setTimeout(() => useStore.getState().requestFocus(tag), 80)
  return true
}

/** the control-room module with this tag, if it is one */
export function controlRoomOf(tag: string): Module | null {
  const e = usePlantStore.getState().plant.equipment.find((x) => x.tag === tag)
  return e && e.kind === 'module' && e.interior === 'controlRoom' ? e : null
}

/**
 * Where to stand inside a control room, in module-local metres (x along the module's width, z along
 * its depth): on the long axis, east of centre, looking west along the room (consoles and wall
 * screens in view, with room behind for the third-person camera).
 */
const ROOM_STAND: [number, number] = [1.5, -1.0]
const ROOM_LOOK: [number, number] = [-6, -1.0]

/** module-local → plan (the inverse of the walker's plan → module-local quarter turn) */
function toPlan(m: Module, [lx, lz]: [number, number]): [number, number] {
  const c = Math.cos(m.rotationY)
  const s = Math.sin(m.rotationY)
  return [m.position[0] + lx * c + lz * s, m.position[2] - lx * s + lz * c]
}

/** Teleport inside a control room (doors open), on its level, facing the consoles. */
export function enterRoom(tag: string): boolean {
  const m = controlRoomOf(tag)
  if (!m) return false
  const st = useStore.getState()
  st.setHmi(null)
  if (st.craneCab) st.setCraneCab(null)
  if (walkAuto.active) walkAuto.onInterrupt?.() // an autopilot in flight would walk you straight back out
  const sim = useSim.getState()
  for (const d of moduleDoors(m)) sim.setDoor(`${m.tag}/${d.id}`, true)
  const plant = usePlantStore.getState().plant
  const levels = walkLevels(plant)
  const li = levelAt(levels, m.position[1])
  const at = toPlan(m, ROOM_STAND)
  const face = toPlan(m, ROOM_LOOK)
  if (!st.walk) {
    // the walker mounts and applies the start itself
    st.startWalk({ level: levels[li].id, at, face })
    return true
  }
  // place first, then tell the store: the walker's level effect then sees the level already matches
  placeWalker(at[0], at[1], face, li)
  walkPose.pitch = -0.05
  if (st.walkLevel !== li) st.setWalkLevel(li)
  return true
}

/** "Go to" a tag: inside it if it is a control room, else stand in front of it. */
export function goToTag(tag: string): boolean {
  return controlRoomOf(tag) ? enterRoom(tag) : walkToTag(tag)
}
