/**
 * Fixed caged ladder (ISO 14122-4 proportions): 65x12 flat-bar stiles @ 450 mm, 25 mm rungs @ 300 mm,
 * safety cage hoops from 2.3 m above the base every 0.9 m with 5 vertical straps.
 */
import type { GeoBatch, V3 } from './batch'
import { bar, tube } from './batch'

/**
 * base: centre of the ladder at its foot. `face` = horizontal unit vector pointing from the ladder
 * towards the climber (cage side). Height h.
 */
export function ladder(b: GeoBatch, base: V3, h: number, face: [number, number], cage = true) {
  const [fx, fz] = face
  const sx = -fz // side vector (along rungs)
  const sz = fx
  const P = (s: number, y: number, f: number): V3 => [base[0] + sx * s + fx * f, base[1] + y, base[2] + sz * s + fz * f]
  const top = h + 1.1 // stiles extend above the landing as grab handles
  for (const s of [-0.225, 0.225]) bar(b, P(s, 0, 0), P(s, top, 0), 0.012, 0.065, [fx, 0, fz])
  for (let y = 0.3; y < h + 0.01; y += 0.3) tube(b, P(-0.22, y, 0), P(0.22, y, 0), 0.0125, 6, true)
  if (!cage || h < 2.6) return
  const R = 0.36
  const cz = 0.38 // cage centre offset from the stile plane
  const hoops: number[] = []
  for (let y = 2.3; y < top - 0.1; y += 0.9) hoops.push(y)
  hoops.push(top - 0.05)
  const N = 9
  for (const y of hoops) {
    for (const s of [-1, 1]) bar(b, P(s * 0.225, y, 0), P(s * R, y, cz), 0.008, 0.05)
    for (let k = 0; k < N; k++) {
      const a0 = Math.PI + (k / N) * Math.PI - Math.PI / 2
      const a1 = Math.PI + ((k + 1) / N) * Math.PI - Math.PI / 2
      const p0 = P(Math.sin(a0) * R * 1.0, y, cz - Math.cos(a0) * R)
      const p1 = P(Math.sin(a1) * R * 1.0, y, cz - Math.cos(a1) * R)
      bar(b, p0, p1, 0.008, 0.05)
    }
  }
  for (const k of [1, 3, 4.5, 6, 8]) {
    const a = Math.PI + (k / N) * Math.PI - Math.PI / 2
    bar(b, P(Math.sin(a) * R, 2.3, cz - Math.cos(a) * R), P(Math.sin(a) * R, top - 0.05, cz - Math.cos(a) * R), 0.05, 0.008, [fx, 0, fz])
  }
}
