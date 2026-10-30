import * as THREE from 'three'

/**
 * Trapezoidal profiled (vertical-rib) cladding sheet. The sheet spans x ∈ [-w/2, w/2],
 * y ∈ [0, h], ribs stand out towards +Z (z ∈ [0, depth]). Front-facing only (+Z side), flat-shaded
 * strips so the ribs catch the light. A thin back face is added so the sheet is not see-through.
 */
export function ribbedPanel(w: number, h: number, pitch = 0.25, depth = 0.035, back = true): THREE.BufferGeometry {
  const n = Math.max(1, Math.round(w / pitch))
  const p = w / n
  // profile points across one pitch (x fraction, z)
  const prof: [number, number][] = [
    [0, 0],
    [0.3, 0],
    [0.4, depth],
    [0.6, depth],
    [0.7, 0],
    [1, 0],
  ]
  const xs: [number, number][] = []
  for (let i = 0; i < n; i++)
    for (let j = 0; j < prof.length - (i < n - 1 ? 1 : 0); j++) {
      if (i > 0 && j === 0) continue
      xs.push([-w / 2 + (i + prof[j][0]) * p, prof[j][1]])
    }
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, z0] = xs[i]
    const [x1, z1] = xs[i + 1]
    const dx = x1 - x0
    const dz = z1 - z0
    const l = Math.hypot(dx, dz) || 1
    const nx = -dz / l
    const nz = dx / l
    // two triangles (x0,0)-(x1,0)-(x1,h) and (x0,0)-(x1,h)-(x0,h)
    const quad = [
      [x0, 0, z0],
      [x1, 0, z1],
      [x1, h, z1],
      [x0, 0, z0],
      [x1, h, z1],
      [x0, h, z0],
    ]
    for (const q of quad) {
      pos.push(q[0], q[1], q[2])
      nor.push(nx, 0, nz)
      uv.push((q[0] + w / 2) / w, q[1] / h)
    }
  }
  if (back) {
    const quad = [
      [w / 2, 0, -0.002],
      [-w / 2, 0, -0.002],
      [-w / 2, h, -0.002],
      [w / 2, 0, -0.002],
      [-w / 2, h, -0.002],
      [w / 2, h, -0.002],
    ]
    for (const q of quad) {
      pos.push(q[0], q[1], q[2])
      nor.push(0, 0, -1)
      uv.push(0, 0)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}
