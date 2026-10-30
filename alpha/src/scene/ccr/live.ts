/**
 * Per-room live screen materials for control-room modules.
 *
 * Every control room gets its own material (and CanvasTexture) per screen kind, keyed by the
 * module tag + kind. All screens of one kind in one room — a video-wall panel and the console
 * monitors showing the same display — share it, so the merged interior mesh keeps one draw group
 * per kind per room and a redraw costs one canvas paint + one texture upload per kind.
 *
 * The LiveScreens driver (LiveScreens.tsx) redraws a room's kinds at ~1 Hz while the camera is
 * near it; nothing here runs per frame.
 */
import * as THREE from 'three'
import { registerMaterial } from '../../three/materials'
import { H, W } from './hmi'
import { drawScreen, isLiveKind, type LiveKind } from './screens'
import { snapshot, type Focus } from './snapshot'

export interface LiveScreen {
  kind: LiveKind
  canvas: HTMLCanvasElement
  g: CanvasRenderingContext2D
  tex: THREE.CanvasTexture
  mat: THREE.MeshBasicMaterial
}
export interface LiveRoom {
  tag: string
  focus: Focus
  /** kinds the room's interior actually uses (only these are redrawn) */
  screens: Map<LiveKind, LiveScreen>
  /** video-wall centre and facing normal, module-local (for tools / camera placement) */
  wall?: { c: [number, number, number]; n: [number, number, number] }
  /** the driver instance currently redrawing this room (guards against double mounts) */
  owner: symbol | null
  draws: number
}

const rooms = new Map<string, LiveRoom>()
export const liveRoom = (tag: string) => rooms.get(tag)
// dev: full-resolution screen pictures for tools/ccr.mjs
if (import.meta.env.DEV)
  (window as unknown as Record<string, unknown>).__ccrScreen = (tag: string, kind: LiveKind) => rooms.get(tag)?.screens.get(kind)?.canvas.toDataURL('image/png') ?? null

function room(tag: string, focus: Focus): LiveRoom {
  let r = rooms.get(tag)
  if (!r) rooms.set(tag, (r = { tag, focus, screens: new Map(), owner: null, draws: 0 }))
  r.focus = focus
  return r
}

/** live emissive screen material for `kind` in room `tag`; null for kinds that stay static */
export function liveScreenMaterial(tag: string, kind: string, focus: Focus): THREE.Material | null {
  if (!isLiveKind(kind)) return null
  const r = room(tag, focus)
  const hit = r.screens.get(kind)
  if (hit) return hit.mat
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  // a backlit LCD: unlit and not tone-mapped, so the HMI greys and alarm colours show as drawn
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  mat.name = `ccr-${tag}-${kind}`
  registerMaterial(mat, 'internal')
  const sc: LiveScreen = { kind, canvas, g, tex, mat }
  r.screens.set(kind, sc)
  // first paint straight away so a far-away room never shows a blank screen
  try {
    drawScreen(g, kind, snapshot(focus, false))
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[ccr] first paint failed', e)
  }
  tex.needsUpdate = true
  return mat
}

export function setWallAnchor(tag: string, focus: Focus, c: [number, number, number], n: [number, number, number]) {
  room(tag, focus).wall = { c, n }
}

/** redraw one screen of a room from a snapshot; marks the texture for upload */
export function redraw(r: LiveRoom, kind: LiveKind, snap: ReturnType<typeof snapshot>) {
  const sc = r.screens.get(kind)
  if (!sc) return
  try {
    drawScreen(sc.g, kind, snap)
  } catch (e) {
    if (import.meta.env.DEV) console.warn(`[ccr] ${r.tag}/${kind} draw failed`, e)
    return
  }
  sc.tex.needsUpdate = true
  r.draws++
}
