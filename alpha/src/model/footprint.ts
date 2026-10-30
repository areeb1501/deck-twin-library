/** Plan-view rectangles occupied by equipment (deck plating, support clash avoidance). */
import * as THREE from 'three'
import type { Equipment } from './types'

export interface Footprint {
  x0: number
  z0: number
  x1: number
  z1: number
}

export function footprints(eqs: Equipment[], pad = 0.6): Footprint[] {
  return eqs.map((e) => {
    const b = new THREE.Box3()
    switch (e.kind) {
      case 'horizontalVessel':
      case 'shellTube': {
        const L = e.kind === 'horizontalVessel' ? e.tt / 2 + e.id / 4 + 0.3 : e.length / 2 + e.channelLength + 0.4
        const W = e.kind === 'horizontalVessel' ? e.id / 2 : e.shellOd / 2
        b.set(new THREE.Vector3(-L, 0, -W), new THREE.Vector3(L, 0, W))
        break
      }
      case 'verticalVessel':
        b.set(new THREE.Vector3(-e.id / 2, 0, -e.id / 2), new THREE.Vector3(e.id / 2, 0, e.id / 2))
        break
      case 'pumpPackage':
        b.set(new THREE.Vector3(-e.baseplate[0] / 2, 0, -e.baseplate[1] / 2), new THREE.Vector3(e.baseplate[0] / 2, 0, e.baseplate[1] / 2))
        break
      case 'compressorPackage':
      case 'chemSkid':
        b.set(new THREE.Vector3(-e.skid[0] / 2, 0, -e.skid[1] / 2), new THREE.Vector3(e.skid[0] / 2, 0, e.skid[1] / 2))
        break
      case 'module':
        b.set(new THREE.Vector3(-e.size[0] / 2, 0, -e.size[2] / 2), new THREE.Vector3(e.size[0] / 2, 0, e.size[2] / 2))
        break
      default:
        b.set(new THREE.Vector3(-2.4, 0, -1.6), new THREE.Vector3(2.4, 0, 1.6))
    }
    b.applyMatrix4(new THREE.Matrix4().makeRotationY(e.rotationY))
    const x = e.position[0]
    const z = e.position[2]
    return { x0: x + b.min.x - pad, z0: z + b.min.z - pad, x1: x + b.max.x + pad, z1: z + b.max.z + pad }
  })
}

