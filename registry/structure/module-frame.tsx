// Lift-installed equipment module frame: plated HEB base frame with drip coaming, HEB columns, roof frame, X-braced faces, padeyes on the corner columns and set-down stools.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { bar, beamTOS, boxMM, column, finPlate, gusset, railPath, sec, toePlate } from './_steel'

export interface ModuleFrameProps {
  /** along X, m */
  length?: number
  /** along Z, m */
  width?: number
  /** floor top to roof top of steel, m */
  height?: number
  base?: string
  post?: string
  roofBeam?: string
  /** plated roof with handrails (otherwise an open roof frame) */
  roofDeck?: boolean
  bracing?: boolean
  padeyes?: boolean
}

export const defaults = {
  length: 12,
  width: 6,
  height: 5,
  base: 'HEB 500',
  post: 'HEB 300',
  roofBeam: 'HEB 300',
  roofDeck: true,
  bracing: true,
  padeyes: true,
}

type P = typeof defaults

export function ModuleFrame(props: ModuleFrameProps & GroupProps) {
  const { length, width, height, base, post, roofBeam, roofDeck, bracing, padeyes, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { length, width, height, base, post, roofBeam, roofDeck, bracing, padeyes }), [length, width, height, base, post, roofBeam, roofDeck, bracing, padeyes])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ModuleFrame

const STOOL = 0.15

function build(k: Kit, p: P) {
  const st = 'structSteel'
  const L = Math.max(3, p.length)
  const W = Math.max(2.5, p.width)
  const B = sec(p.base)
  const C = sec(p.post)
  const Rb = sec(p.roofBeam)
  const tp = 0.012
  const floor = STOOL + B.d + tp // walking surface
  const roof = floor + Math.max(2.5, p.height)
  const ex = L / 2 - B.b / 2
  const ez = W / 2 - B.b / 2
  const nb = Math.max(1, Math.ceil(L / 6))
  const xs = Array.from({ length: nb + 1 }, (_, i) => -ex + (2 * ex * i) / nb)

  // set-down stools under the base frame nodes
  for (const x of xs) for (const z of [-ez, ez]) {
    boxMM(k, st, [x - 0.25, 0, z - 0.25], [x + 0.25, 0.03, z + 0.25])
    boxMM(k, st, [x - 0.15, 0.03, z - 0.15], [x + 0.15, STOOL - 0.02, z + 0.15])
    boxMM(k, st, [x - 0.2, STOOL - 0.02, z - 0.2], [x + 0.2, STOOL, z + 0.2])
  }
  // base frame: perimeter and cross girders, secondaries, deck plate, drip coaming
  const tosB = floor - tp
  for (const z of [-ez, ez]) beamTOS(k, -L / 2, z, L / 2, z, tosB, p.base, st)
  for (const x of xs) beamTOS(k, x, -ez + B.b / 2 + 0.005, x, ez - B.b / 2 - 0.005, tosB, p.base, st)
  const S = 'IPE 300'
  const sd = sec(S).d
  for (let i = 0; i < nb; i++)
    for (const zf of [-0.5, 0, 0.5].map((f) => f * (W - B.b) * 0.66)) {
      const xa = xs[i] + B.b / 2 + 0.005
      const xb = xs[i + 1] - B.b / 2 - 0.005
      beamTOS(k, xa, zf, xb, zf, tosB, S, st)
      finPlate(k, [xs[i] + B.tw / 2, tosB - sd / 2, zf], 'x', 1, sd, B.b / 2 + 0.1)
      finPlate(k, [xs[i + 1] - B.tw / 2, tosB - sd / 2, zf], 'x', -1, sd, B.b / 2 + 0.1)
    }
  boxMM(k, 'deckPlate', [-L / 2, tosB, -W / 2], [L / 2, floor, W / 2])
  for (const z of [-W / 2 + 0.004, W / 2 - 0.004]) toePlate(k, [-L / 2, floor, z], [L / 2, floor, z], 0.15, st)
  for (const x of [-L / 2 + 0.004, L / 2 - 0.004]) toePlate(k, [x, floor, -W / 2 + 0.008], [x, floor, W / 2 - 0.008], 0.15, st)

  // columns with base and cap stiffeners
  const cz = W / 2 - C.d / 2 - 0.02
  for (const x of xs)
    for (const z of [-cz, cz]) {
      column(k, x, z, floor, roof - Rb.d, p.post, st, 'z')
      for (const s of [-1, 1]) {
        gusset(k, [x + s * C.b / 2, floor, z], [s, 0, 0], [0, 1, 0], 0.15, 0.35, 0.015)
        gusset(k, [x + s * C.b / 2, roof - Rb.d, z], [s, 0, 0], [0, -1, 0], 0.15, 0.35, 0.015)
      }
    }

  // roof frame
  for (const z of [-cz, cz]) beamTOS(k, -L / 2, z, L / 2, z, roof, p.roofBeam, st)
  for (const x of xs) beamTOS(k, x, -cz + Rb.b / 2 + 0.005, x, cz - Rb.b / 2 - 0.005, roof, p.roofBeam, st)
  if (p.roofDeck) {
    for (let i = 0; i < nb; i++) beamTOS(k, xs[i] + Rb.b / 2, 0, xs[i + 1] - Rb.b / 2, 0, roof, 'IPE 240', st)
    boxMM(k, 'deckPlate', [-L / 2, roof, -W / 2], [L / 2, roof + 0.01, W / 2])
    const i = 0.05
    railPath(k, [[-L / 2 + i, -W / 2 + i], [L / 2 - i, -W / 2 + i], [L / 2 - i, W / 2 - i], [-L / 2 + i, W / 2 - i]], roof + 0.01, [], true)
  }

  // X bracing: both end faces and the end bays of the long faces (doors / access left open between)
  if (p.bracing) {
    const br = 'CHS 168.3x8'
    const y0 = floor + 0.25
    const y1 = roof - Rb.d - 0.25
    for (const x of [xs[0], xs[nb]]) {
      bar(k, [x, y0, -cz + C.d / 2], [x, y1, cz - C.d / 2], br, st)
      bar(k, [x, y0, cz - C.d / 2], [x, y1, -cz + C.d / 2], br, st)
    }
    for (const z of [-cz, cz])
      for (const [a, b] of [[xs[0], xs[1]], [xs[nb - 1], xs[nb]]]) {
        if (nb < 2 && b !== xs[1]) continue
        bar(k, [a + C.b / 2, y0, z], [b - C.b / 2, y1, z], br, st)
        bar(k, [b - C.b / 2, y0, z], [a + C.b / 2, y1, z], br, st)
      }
  }

  // padeyes on the corner columns: main plate with pin hole and cheek plates
  if (p.padeyes)
    for (const x of [xs[0], xs[nb]])
      for (const z of [-cz, cz]) {
        const h = 0.45
        const r = 0.17
        const sh = new THREE.Shape()
        sh.moveTo(-0.3, 0).lineTo(0.3, 0).lineTo(r, h).absarc(0, h, r, 0, Math.PI, false).lineTo(-0.3, 0)
        const hole = new THREE.Path()
        hole.absarc(0, h, 0.065, 0, Math.PI * 2, true)
        sh.holes.push(hole)
        const y = p.roofDeck ? roof + 0.01 : roof
        const t = 0.05
        k.extrude('safetyYellow', sh, t, new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)).setPosition(x, y, z - t / 2), 16)
        for (const s of [-1, 1]) k.pipe('safetyYellow', [x, y + h, z + s * t / 2], [x, y + h, z + s * (t / 2 + 0.02)], 0.24, 0.12 - 0.065, 24)
        for (const s of [-1, 1]) gusset(k, [x, y, z + s * t / 2], [0, 0, s], [0, 1, 0], 0.15, 0.3, 0.02, 'safetyYellow')
      }
}
