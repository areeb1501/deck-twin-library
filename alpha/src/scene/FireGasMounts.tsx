/**
 * Physical supports for fire & gas devices and point-mounted instruments, so none of them hang in the air:
 *   · near a column / rack post / jacket leg  → horizontal bracket arm + clamp to the member
 *   · heat / smoke detector just under a deck → drop rod from the steel above
 *   · on a module roof or wall                → nothing (it is already on a surface)
 *   · anywhere else                           → its own galvanised stanchion: base plate, post, arm
 * Members are the Alpha structure (deck columns, pipe-rack posts, jacket legs); floors and ceilings
 * come from the plant's walk levels.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { BuiltPiping } from './piping/build'
import { usePlantStore } from '../state/plantStore'
import { materials } from '../three/materials'
import { footprints } from '../model/footprint'
import { labelHeight } from '../ui/labels'
import { DECK } from './structure/deckConst'
import { RACK } from './structure/rack'
import type { Plant, PlanRect } from '../model/types'

const FG = new Set(['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'])
const noPick = () => null

interface Member {
  x: number
  z: number
  r: number
  y0: number
  y1: number
}

/** vertical steel a bracket can clamp to (deck-local) */
function members(p: Plant): Member[] {
  if ((p.deck.site ?? 'offshoreAlpha') !== 'offshoreAlpha') return []
  const out: Member[] = []
  for (const [x, z] of DECK.legs) out.push({ x, z, r: DECK.legOD / 2, y0: -8, y1: 10 })
  for (const [x, z] of DECK.columns) out.push({ x, z, r: 0.2, y0: 0, y1: 9.4 })
  for (const x of RACK.bents)
    for (const z of [RACK.zMin, RACK.zMax]) out.push({ x, z, r: 0.15, y0: 0, y1: RACK.tallBents.includes(x) ? RACK.topY : RACK.tier2 })
  return out
}

const inRect = (a: PlanRect, x: number, z: number) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1

export function FireGasMounts({ built }: { built: BuiltPiping }) {
  const plant = usePlantStore((s) => s.plant)
  const geo = useMemo(() => {
    const levels = plant.deck.walk ?? [{ id: 'deck', label: '', y: 0, areas: [{ x0: plant.deck.extent.minX, x1: plant.deck.extent.maxX, z0: plant.deck.extent.minZ, z1: plant.deck.extent.maxZ }] }]
    const mem = members(plant)
    const fps = footprints(plant.equipment, 0)
    const boxes = plant.equipment.filter((e) => e.kind !== 'proxy').map((e, i) => ({ f: fps[plant.equipment.indexOf(e)] ?? fps[i], y0: levels.reduce((f, l) => (l.y <= e.position[1] + 0.5 && l.y > f ? l.y : f), -1e9), y1: labelHeight(e) - 1.0 }))
    const parts: THREE.BufferGeometry[] = []
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const d = b.clone().sub(a)
      const len = d.length()
      if (len < 0.02) return
      const g = new THREE.CylinderGeometry(r, r, len, 10, 1)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
      parts.push(g)
    }
    const plate = (c: THREE.Vector3, sx: number, sy: number, sz: number) => parts.push(new THREE.BoxGeometry(sx, sy, sz).translate(c.x, c.y, c.z))

    for (const d of built.instruments) {
      // fire & gas devices, and any instrument placed at a point (not on a line or a nozzle)
      const atPoint = 'equipment' in d.inst.on && !!d.inst.on.at
      if (!FG.has(d.inst.type) && !atPoint) continue
      const p = d.pos
      const back = new THREE.Vector3(0, 1, 0).applyQuaternion(d.quat).setY(0).normalize().multiplyScalar(-1)
      // the floor and ceiling around the device
      const floors = levels.filter((l) => l.y <= p.y - 0.2 && l.areas.some((a) => inRect(a, p.x, p.z)))
      const floor = floors.length ? Math.max(...floors.map((l) => l.y)) : levels[0].y
      const above = levels.filter((l) => l.y > p.y && l.areas.some((a) => inRect(a, p.x, p.z)))
      const ceiling = above.length ? Math.min(...above.map((l) => l.y)) - 0.6 : Infinity

      // already on a surface: a module roof / wall or any equipment box it touches
      const onSurface = boxes.some(({ f, y0, y1 }) => {
        const dx = Math.max(f.x0 - p.x, 0, p.x - f.x1)
        const dz = Math.max(f.z0 - p.z, 0, p.z - f.z1)
        return Math.hypot(dx, dz) < 0.22 && p.y >= y0 - 0.1 && p.y <= y1 + 0.6
      })
      if (onSurface) continue

      // heat / smoke detectors just under the deck above: drop rod
      if ((d.inst.type === 'HD' || d.inst.type === 'SD') && ceiling - p.y < 1.0) {
        rod(p.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(p.x, ceiling, p.z), 0.022)
        plate(new THREE.Vector3(p.x, ceiling - 0.01, p.z), 0.18, 0.02, 0.18)
        continue
      }

      // a member close enough to clamp to
      let best: Member | null = null
      let bd = 1.6
      for (const m of mem) {
        if (p.y < m.y0 + 0.3 || p.y > m.y1 - 0.1) continue
        const dist = Math.hypot(p.x - m.x, p.z - m.z) - m.r
        if (dist < bd) (bd = dist), (best = m)
      }
      if (best) {
        const to = new THREE.Vector3(best.x, p.y, best.z)
        const dir = to.clone().sub(p).setY(0)
        const len = dir.length()
        dir.normalize()
        const end = p.clone().addScaledVector(dir, Math.max(0, len - best.r))
        rod(p, end, 0.03)
        // clamp band round the member + gusset
        const band = new THREE.CylinderGeometry(best.r + 0.025, best.r + 0.025, 0.12, 16, 1, true).translate(best.x, p.y, best.z)
        parts.push(band)
        rod(p.clone().addScaledVector(dir, 0.05).add(new THREE.Vector3(0, -0.02, 0)), end.clone().add(new THREE.Vector3(0, -0.25, 0)), 0.015)
        continue
      }

      // own stanchion: post behind the device from the floor, short arm, base plate
      const post = p.clone().addScaledVector(back, 0.22)
      const top = new THREE.Vector3(post.x, p.y + 0.12, post.z)
      const base = new THREE.Vector3(post.x, floor, post.z)
      rod(base, top, 0.03)
      rod(new THREE.Vector3(post.x, p.y, post.z), p, 0.02)
      plate(new THREE.Vector3(post.x, floor + 0.006, post.z), 0.26, 0.012, 0.26)
      plate(new THREE.Vector3(post.x, top.y + 0.01, post.z), 0.08, 0.02, 0.08)
      if (p.y - floor > 2.2) {
        // tall posts get a stay to the floor
        rod(new THREE.Vector3(post.x, floor + (p.y - floor) * 0.45, post.z), new THREE.Vector3(post.x + back.x * 0.7, floor, post.z + back.z * 0.7), 0.016)
      }
    }
    if (!parts.length) return null
    const g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)), false)
    parts.forEach((x) => x.dispose())
    return g
  }, [built, plant])

  if (!geo) return null
  return <mesh geometry={geo} material={materials().structSteel} raycast={noPick} castShadow receiveShadow />
}
