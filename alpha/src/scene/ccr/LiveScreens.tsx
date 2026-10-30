/**
 * Redraw driver for one control room's live screens. Mounted inside the module's group (its
 * origin is the module origin), it:
 *   - once a second takes ONE snapshot of the simulation, if the camera is within RANGE of the room;
 *   - repaints one screen kind per frame from that snapshot (staggered, so a cycle never costs
 *     more than one 1024 × 576 canvas paint + texture upload in a frame);
 *   - does nothing at all for rooms further away (their screens keep the last picture).
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { liveRoom, redraw } from './live'
import type { LiveKind } from './screens'
import { snapshot, type Focus, type Snap } from './snapshot'

/** camera distance beyond which a room's screens are not redrawn, m */
const RANGE = 60
/** redraw cadence, ms (the sim clock steps once a second) */
const PERIOD = 1000

interface DevRoom {
  draws: number
  dist: number
  kinds: string[]
  wall?: { c: number[]; n: number[] }
}
const dev: { rooms: Record<string, DevRoom> } = { rooms: {} }
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__ccr = dev

export function LiveScreens({ tag, focus }: { tag: string; focus: Focus }) {
  const ref = useRef<THREE.Group>(null)
  const token = useMemo(() => Symbol(tag), [tag])
  const st = useRef({ next: 0, queue: [] as LiveKind[], snap: null as Snap | null, blink: false })
  const v = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const r = liveRoom(tag)
    if (r && !r.owner) r.owner = token
    return () => {
      const rr = liveRoom(tag)
      if (rr?.owner === token) rr.owner = null
    }
  }, [tag, token])

  useFrame(({ camera }) => {
    const r = liveRoom(tag)
    const g = ref.current
    if (!r || !g) return
    if (!r.owner) r.owner = token
    if (r.owner !== token) return
    const s = st.current
    const now = performance.now()
    if (now >= s.next) {
      s.next = now + PERIOD
      g.getWorldPosition(v)
      const dist = camera.position.distanceTo(v)
      if (import.meta.env.DEV) {
        const d = (dev.rooms[tag] ??= { draws: 0, dist, kinds: [] })
        d.dist = Math.round(dist * 10) / 10
        d.kinds = [...r.screens.keys()]
        if (r.wall) {
          const c = g.localToWorld(new THREE.Vector3(...r.wall.c))
          const n = new THREE.Vector3(...r.wall.n).transformDirection(g.matrixWorld)
          d.wall = { c: c.toArray(), n: n.toArray() }
        }
      }
      if (dist <= RANGE) {
        s.blink = !s.blink
        s.snap = snapshot(focus, s.blink)
        s.queue = [...r.screens.keys()]
      }
    }
    const kind = s.queue.shift()
    if (kind && s.snap) {
      redraw(r, kind, s.snap)
      if (import.meta.env.DEV && dev.rooms[tag]) dev.rooms[tag].draws = r.draws
    }
  })

  return <group ref={ref} />
}
