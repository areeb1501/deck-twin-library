// Monorail runway beam on goalpost supports with an electric chain hoist on a push trolley (EN 14492-2 / FEM 9.511, ISO 4301 runway).
import * as THREE from 'three'
import { useMemo } from 'react'
import { Kit, type MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { member, tagPlate } from '../lib/parts'
import { SECTIONS } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { boxMM, craneYellow, hook } from './_rigging'

export interface MonorailHoistProps {
  /** runway beam length, m */
  length?: number
  /** underside of the runway beam above the deck, m */
  height?: number
  /** hoist safe working load, t */
  swl?: number
  /** trolley position along the beam, 0 … 1 */
  trolley?: number
  /** hook below the hoist body, m */
  hook?: number
  tag?: string
}

export const defaults = {
  length: 8,
  height: 4.5,
  swl: 5,
  trolley: 0.4,
  hook: 2.2,
  tag: 'HM-101',
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function dims(length: number, height: number, swl: number) {
  const beam = swl <= 2 ? 'IPE 240' : swl <= 5 ? 'IPE 330' : swl <= 10 ? 'HEB 400' : 'HEB 500'
  const sec = SECTIONS[beam]
  const s = clamp(0.8 + swl / 20, 0.8, 1.6)
  const L = Math.max(3, length)
  const H = Math.max(2.5, height)
  const rW = 0.065 * s
  const yShaft = H - 0.13 * s
  const yBody = yShaft - 0.12 * s
  const bodyH = 0.42 * s
  return { beam, sec, s, L, H, rW, yShaft, yBody, bodyH, chainY: yBody - bodyH, stop: 0.35, d: clamp(0.007 + swl * 0.0018, 0.007, 0.024) }
}

export function MonorailHoist({ length = defaults.length, height = defaults.height, swl = defaults.swl, trolley = defaults.trolley, hook: drop = defaults.hook, tag = defaults.tag, ...group }: MonorailHoistProps & GroupProps) {
  const D = useMemo(() => dims(length, height, swl), [length, height, swl])
  const runway = useKit((k) => buildRunway(k, D, swl, tag), [D, swl, tag])
  const carriage = useKit((k) => buildHoist(k, D), [D])
  const hookDrop = clamp(drop, 0.3, D.chainY - 0.6)
  const chain = useKit((k) => buildChain(k, D, hookDrop), [D, hookDrop])
  const span = D.L / 2 - D.stop - 0.35 * D.s
  const x = -span + 2 * span * clamp(trolley, 0, 1)
  return (
    <group {...group}>
      <KitMesh data={runway} />
      <group position={[x, 0, 0]}>
        <KitMesh data={carriage} />
        <KitMesh data={chain} />
      </group>
    </group>
  )
}

export default MonorailHoist

type D = ReturnType<typeof dims>

function buildRunway(k: Kit, D: D, swl: number, tag: string) {
  const { L, H, sec } = D
  const Y = craneYellow()
  const steel: MatKey = 'structSteel'
  // runway beam (bottom flange underside at H)
  member(k, [-L / 2, H + sec.d / 2, 0], [L / 2, H + sec.d / 2, 0], D.beam, Y)
  // goalpost supports ≤ 6 m apart
  const col = 'HEB 200'
  const cs = SECTIONS[col]
  const half = Math.max(1.0, 0.6 + D.s * 0.4)
  const yHdr = H + sec.d + 0.03 + cs.d / 2
  const n = Math.max(2, Math.ceil((L - 0.6) / 6) + 1)
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.3 + ((L - 0.6) * i) / (n - 1)
    member(k, [x, yHdr, -half - cs.b / 2], [x, yHdr, half + cs.b / 2], col, steel)
    boxMM(k, steel, [x - sec.b / 2 - 0.03, H + sec.d, -0.18], [x + sec.b / 2 + 0.03, H + sec.d + 0.03, 0.18])
    for (const dx of [-1, 1]) for (const dz of [-0.13, 0.13]) k.hex('nut', 0.036, 0.02, [x + dx * (sec.b / 2 + 0.005), H + sec.d - sec.tf - 0.01, dz])
    for (const sz of [-1, 1]) {
      const z = sz * half
      member(k, [x, 0.025, z], [x, yHdr + cs.d / 2, z], col, steel, [1, 0, 0])
      boxMM(k, steel, [x - 0.2, 0, z - 0.2], [x + 0.2, 0.025, z + 0.2])
      for (const dx of [-0.14, 0.14]) for (const dz of [-0.14, 0.14]) {
        k.cyl('boltXylan', 0.012, 0.08, [x + dx, 0.05, z + dz], 'y', 8)
        k.hex('nut', 0.04, 0.022, [x + dx, 0.036, z + dz])
      }
      k.rod(steel, [x, yHdr - 0.65, z], [x, yHdr - cs.d / 2, z - sz * 0.6], 0.04, 8)
    }
  }
  // end stops with rubber buffers, SWL marking both sides
  for (const sx of [-1, 1]) {
    const xs = sx * (L / 2 - D.stop)
    for (const sz of [-1, 1]) {
      boxMM(k, Y, [xs - 0.02, H - 0.12, sz * (sec.b / 2 + 0.002) - 0.008], [xs + 0.02, H + sec.tf + 0.08, sz * (sec.b / 2 + 0.002) + 0.008])
      k.cyl('rubberBlack', 0.045, 0.08, [xs - sx * 0.06, H - 0.05, sz * (sec.b / 2 - 0.02)], 'x', 14)
    }
    boxMM(k, Y, [xs - 0.02, H - 0.12, -sec.b / 2 - 0.01], [xs + 0.02, H - 0.09, sec.b / 2 + 0.01])
  }
  const sign = textMaterial(`SWL ${swl} t`, '#111111', '#f2c40f', 512, 128)
  for (const sz of [-1, 1]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sz > 0 ? 0 : Math.PI)
    k.plane(sign, Math.min(0.9, sec.d * 3.2), Math.min(0.9, sec.d * 3.2) / 4, [0, H + sec.d / 2, sz * (sec.tw / 2 + 0.003)], q)
    if (tag) tagPlate(k, tag, [-L / 2 + 0.6, H + sec.d / 2, sz * (sec.tw / 2 + 0.001)], [0, 0, sz], Math.min(0.3, sec.d))
  }
}

// push trolley on the bottom flange with an electric chain hoist and control pendant
function buildHoist(k: Kit, D: D) {
  const { H, sec, s, rW } = D
  const body = paint('#e1b10f', { weather: 0.5 })
  const dark: MatKey = 'castIron'
  const zw = sec.tw / 2 + 0.035 * s
  const yW = H + sec.tf + rW
  const zp = sec.b / 2 + 0.03
  for (const sz of [-1, 1]) {
    boxMM(k, dark, [-0.22 * s, D.yShaft - 0.07 * s, sz * zp - 0.008], [0.22 * s, yW + rW + 0.02, sz * zp + 0.008])
    for (const sx of [-1, 1]) {
      k.cyl(dark, rW, 0.035 * s, [sx * 0.13 * s, yW, sz * zw], 'z', 18)
      k.cyl('stainless', 0.015, zp - zw, [sx * 0.13 * s, yW, sz * (zw + zp) / 2], 'z', 8)
      k.hex('nut', 0.04, 0.02, [sx * 0.13 * s, yW, sz * (zp + 0.012)], 'z')
    }
  }
  k.cyl('stainless', 0.022 * s, 2 * zp + 0.06, [0, D.yShaft, 0], 'z', 10)
  for (const sz of [-1, 1]) k.hex('nut', 0.06 * s, 0.03, [0, D.yShaft, sz * (zp + 0.03)], 'z')
  // suspension lug, hoist body, motor, gearbox, contactor box, chain bag
  boxMM(k, dark, [-0.03 * s, D.yBody - 0.01, -0.025 * s], [0.03 * s, D.yShaft + 0.04 * s, 0.025 * s])
  k.rbox(body, [0.32 * s, D.bodyH, 0.3 * s], 0.03 * s, [0, D.yBody - D.bodyH / 2, 0])
  k.cyl(body, 0.12 * s, 0.32 * s, [0, D.yBody - D.bodyH * 0.45, 0.31 * s], 'z', 24)
  for (let i = 0; i < 10; i++) k.cyl(body, 0.13 * s, 0.006, [0, D.yBody - D.bodyH * 0.45, 0.2 * s + i * 0.022 * s], 'z', 24)
  k.cyl('rubberBlack', 0.1 * s, 0.03, [0, D.yBody - D.bodyH * 0.45, 0.48 * s], 'z', 20)
  k.rbox(body, [0.26 * s, 0.3 * s, 0.14 * s], 0.025 * s, [0, D.yBody - D.bodyH * 0.45, -0.22 * s])
  k.rbox('plasticGrey', [0.18 * s, 0.14 * s, 0.08 * s], 0.01, [0.0, D.yBody - D.bodyH * 0.2, -0.33 * s])
  k.plane(textMaterial('EN 14492-2', '#f1f1ec', '#111111', 256, 64), 0.12 * s, 0.03 * s, [0, D.yBody - D.bodyH * 0.6, 0.151 * s])
  k.cyl('rubberBlack', 0.09 * s, 0.32 * s, [0.12 * s, D.chainY - 0.18 * s, 0], 'y', 16, 0.07 * s)
  // pendant: strain wire + cable down to the push-button station
  const yp = Math.max(1.1, D.chainY - 1.2)
  k.spline('cable', [[-0.1 * s, D.yBody - D.bodyH * 0.5, -0.12 * s], [-0.2 * s, (D.yBody + yp) / 2, -0.15 * s], [-0.24 * s, yp + 0.22, -0.16 * s]], 0.008, 6, 24)
  k.rbox('plasticGrey', [0.08, 0.26, 0.07], 0.02, [-0.24 * s, yp + 0.08, -0.16 * s])
  for (const [dy, m] of [[0.15, 'safetyGreen'], [0.09, 'actuatorRed'], [0.03, 'equipmentPaint']] as [number, MatKey][]) k.cyl(m, 0.016, 0.012, [-0.24 * s, yp + dy, -0.16 * s + 0.036], 'z', 12)
  k.cyl('actuatorRed', 0.022, 0.02, [-0.24 * s, yp + 0.23, -0.16 * s], 'y', 12)
}

// Round-link load chain (alternating links) to the bottom hook block.
function buildChain(k: Kit, D: D, drop: number) {
  const d = D.d
  const p = 3 * d
  const n = Math.max(2, Math.round(drop / p))
  const y0 = D.chainY
  const x = -0.03 * D.s
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(1.15 * d, d / 2, 6, 12)
    g.scale(1, 1.55, 1)
    if (i % 2) g.rotateY(Math.PI / 2)
    k.add('galvanised', g, new THREE.Matrix4().makeTranslation(x, y0 - (i + 0.5) * p, 0))
  }
  const yb = y0 - n * p
  const s = D.s
  k.rbox(craneYellow(), [0.11 * s, 0.16 * s, 0.13 * s], 0.02 * s, [x, yb - 0.08 * s, 0])
  k.cyl('castIron', 0.03 * s, 0.06 * s, [x, yb - 0.19 * s, 0], 'y', 12)
  hook(k, [x, yb - 0.3 * s, 0], 0.045 * s * (0.8 + D.d * 20), 'castIron')
}
