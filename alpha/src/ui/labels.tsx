/**
 * Equipment tag chips as a plain DOM overlay (outside the WebGL canvas). A projector inside
 * the canvas positions them every frame; they fade with distance and hide when behind the
 * camera. Avoids per-label React roots.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Equipment } from '../model/types'
import { useStore } from '../state/store'
import { usePlant } from '../state/plantStore'

const els = new Map<string, HTMLButtonElement>()

export function labelHeight(e: Equipment) {
  switch (e.kind) {
    case 'horizontalVessel':
      return e.position[1] + e.id / 2 + 1.1
    case 'verticalVessel':
      return e.elevation + e.tt + e.id / 2 + 1.6
    case 'module':
      return e.size[1] + 1.2
    case 'compressorPackage':
      return 4.6
    case 'xmasTree':
      return e.position[1] + e.wellheadHeight + 2.6
    case 'shellTube':
      return e.position[1] + 1.4
    default:
      return 2.4
  }
}

/** DOM side — render in the app shell */
export function LabelOverlay() {
  const plant = usePlant()
  const selected = useStore((s) => s.selected?.tag)
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.requestFocus)
  return (
    <div className="label-layer">
      {plant.equipment.map((e) => (
        <button
          key={e.tag}
          ref={(el) => {
            if (el) els.set(e.tag, el)
            else els.delete(e.tag)
          }}
          className={`tag-chip${selected === e.tag ? ' is-active' : ''}`}
          style={{ visibility: 'hidden' }}
          onClick={() => {
            select({ tag: e.tag, kind: 'equipment' })
            focus(e.tag)
          }}
        >
          {e.tag}
        </button>
      ))}
    </div>
  )
}

/** Canvas side — projects label anchors each frame */
export function LabelProjector({ equipment, worldY }: { equipment: Equipment[]; worldY: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const visible = useStore((s) => s.layers.labels)
  const selected = useStore((s) => s.selected?.tag)
  const pts = useMemo(() => equipment.map((e) => ({ tag: e.tag, p: new THREE.Vector3(e.position[0], labelHeight(e) + worldY, e.position[2]) })), [equipment, worldY])
  const v = useMemo(() => new THREE.Vector3(), [])
  const centre = useMemo(() => new THREE.Vector3(0, worldY, 0), [worldY])
  useFrame(() => {
    const far = camera.position.distanceTo(centre) > 70
    for (const { tag, p } of pts) {
      const el = els.get(tag)
      if (!el) continue
      v.copy(p).project(camera)
      const behind = v.z > 1
      const d = camera.position.distanceTo(p)
      const o = far ? 1 : THREE.MathUtils.clamp(1 - (d - 18) / 12, 0, 1)
      const active = tag === selected
      const show = visible && !behind && (active || o > 0.02)
      el.style.visibility = show ? 'visible' : 'hidden'
      if (!show) continue
      el.style.opacity = String(active ? 1 : o)
      el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`
    }
  })
  return null
}
