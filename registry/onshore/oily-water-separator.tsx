// Corrugated plate interceptor (CPI) oily-water separator: open basin with inlet chamber, 45° plate packs, slotted-pipe oil skimmer, underflow baffle and outlet weir. API 421.
import * as THREE from 'three'
import type { Kit, MatKey } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { checkerPlate, grating, handrail, member, nozzle, pipeRun, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { pipeOD, type Rating } from '../lib/standards'
import { clamp, earthBond, plinth, stair } from './_onshore'

export interface OilyWaterSeparatorProps {
  /** design flow, m³/h (sets the number of plate packs) */
  flow?: number
  construction?: 'concrete' | 'steel'
  inletNps?: number
  oilNps?: number
  rating?: Rating
  /** checker-plate covers, with the plate-pack bay left open for inspection */
  covers?: boolean
  tag?: string
}

export const defaults = { flow: 120, construction: 'concrete' as 'concrete' | 'steel', inletNps: 8, oilNps: 3, rating: 150 as Rating, covers: true, tag: '' }

function layout(p: typeof defaults) {
  const packs = clamp(Math.ceil(p.flow / 60), 1, 6)
  const conc = p.construction === 'concrete'
  const t = conc ? 0.3 : 0.01
  const base = conc ? 0.3 : 0.25
  const Wi = packs * 1.05 + 0.3
  const Li = 7.2
  const Hi = 2.4
  const top = base + Hi
  const wl = top - 0.45
  const X0 = -Li / 2
  const X1 = Li / 2
  // chambers along X: inlet | plate packs | skimmer bay | baffle + weir | outlet
  const xPack0 = X0 + 1.5
  const xPack1 = xPack0 + 1.9
  const xSkim = xPack1 + 0.6
  const xBaffle = xPack1 + 1.3
  const xWeir = xBaffle + 0.45
  const inY = top - 0.55
  const outY = wl - 0.35
  return { packs, conc, t, base, Wi, Li, Hi, top, wl, X0, X1, xPack0, xPack1, xSkim, xBaffle, xWeir, inY, outY, so: 0.35 }
}

export function ports(props: OilyWaterSeparatorProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('inlet', 'Oily water inlet', [g.X0 - g.t - g.so, g.inY, 0], [-1, 0, 0], p.inletNps, p.rating),
    port('water-out', 'Treated water outlet', [g.X1 + g.t + g.so, g.outY, 0], [1, 0, 0], p.inletNps, p.rating),
    port('oil-out', 'Skimmed oil outlet', [g.xSkim, g.wl - 0.25, g.Wi / 2 + g.t + g.so], [0, 0, 1], p.oilNps, p.rating),
  ]
}

export function OilyWaterSeparator(props: OilyWaterSeparatorProps & GroupProps) {
  const { flow, construction, inletNps, oilNps, rating, covers, tag, ...group } = { ...defaults, ...props }
  const p = { flow, construction, inletNps, oilNps, rating, covers, tag }
  const data = useKit((k) => build(k, p, layout(p)), [flow, construction, inletNps, oilNps, rating, covers, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default OilyWaterSeparator

type P = typeof defaults
type G = ReturnType<typeof layout>

function build(k: Kit, p: P, g: G) {
  const { t, base, Wi, Li, Hi, top, wl, X0, X1 } = g
  const W = Wi + 2 * t
  const L = Li + 2 * t
  const shell: MatKey = g.conc ? 'concrete' : paint('#6f7f74', { clearcoat: 0.2 })
  const steel = paint('#5c6a73')
  const lining = paint('#3c4a4f', { roughness: 0.7, clearcoat: 0, weather: 0.6 })
  // base and walls (hollow basin); steel tank sits on a skid with external stiffeners
  if (g.conc) k.box('concrete', [L + 0.3, base, W + 0.3], [0, base / 2, 0])
  else {
    plinth(k, 0, 0, L + 0.6, W + 0.6, 0.12)
    for (const z of [-W / 2 + 0.15, 0, W / 2 - 0.15]) member(k, [-L / 2, 0.12 + 0.06, z], [L / 2, 0.12 + 0.06, z], 'HEB 120', 'structSteelDark')
    k.box(shell, [L, 0.012, W], [0, base - 0.006, 0])
  }
  k.box(lining, [Li, 0.01, Wi], [0, base + 0.005, 0])
  for (const s of [-1, 1]) {
    k.box(shell, [L, Hi, t], [0, base + Hi / 2, s * (Wi / 2 + t / 2)])
    k.box(shell, [t, Hi, Wi], [s * (Li / 2 + t / 2), base + Hi / 2, 0])
    k.box(lining, [Li, Hi - 0.01, 0.01], [0, base + Hi / 2, s * (Wi / 2 - 0.005)])
  }
  if (!g.conc) {
    for (let x = -L / 2 + 0.4; x < L / 2 - 0.2; x += 0.8) for (const s of [-1, 1]) k.box(shell, [0.012, Hi, 0.1], [x, base + Hi / 2, s * (W / 2 + 0.05)])
    for (const s of [-1, 1]) k.box(shell, [L + 0.2, 0.012, 0.15], [0, top - 0.006, s * (W / 2 + 0.06)])
  } else for (const s of [-1, 1]) k.box('concrete', [L, 0.06, 0.06], [0, top + 0.03, s * (Wi / 2 + t / 2)])
  // inlet distribution baffle (perforated) after the inlet chamber
  const xb0 = g.xPack0 - 0.35
  k.box(steel, [0.012, Hi - 0.6, Wi], [xb0, base + 0.3 + (Hi - 0.6) / 2, 0])
  for (let y = base + 0.5; y < wl - 0.2; y += 0.22)
    for (let z = -Wi / 2 + 0.15; z < Wi / 2 - 0.1; z += 0.2) k.cyl('pipeBore', 0.035, 0.014, [xb0, y, z], 'x', 10)
  // plate packs: frames with corrugated plates at 45°, side by side across the width
  const ph = 1.3
  const py0 = base + 0.45
  const plate = paint('#e9e6da', { metalness: 0, roughness: 0.5, clearcoat: 0 })
  for (let i = 0; i < g.packs; i++) {
    const zc = -Wi / 2 + 0.15 + 0.525 + i * 1.05
    const pl = g.xPack1 - g.xPack0
    for (const sy of [py0, py0 + ph]) for (const sz of [-0.5, 0.5]) k.box('stainless', [pl, 0.04, 0.04], [(g.xPack0 + g.xPack1) / 2, sy, zc + sz])
    for (const sx of [g.xPack0, g.xPack1]) for (const sz of [-0.5, 0.5]) k.box('stainless', [0.04, ph, 0.04], [sx, py0 + ph / 2, zc + sz])
    const n = 26
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 4)
    const len = ph * Math.SQRT2 * 0.98
    for (let j = 0; j < n; j++) {
      const x = g.xPack0 + ph / 2 + ((pl - ph) * j) / (n - 1)
      k.box(plate, [len, 0.004, 0.98], [x, py0 + ph / 2, zc], q)
      k.box(plate, [len, 0.012, 0.01], [x, py0 + ph / 2 + 0.006, zc - 0.25], q)
      k.box(plate, [len, 0.012, 0.01], [x, py0 + ph / 2 + 0.006, zc + 0.25], q)
    }
    // pack support legs and lifting eyes
    for (const sx of [g.xPack0 + 0.1, g.xPack1 - 0.1]) for (const sz of [-0.45, 0.45]) k.box('stainless', [0.06, py0 - base, 0.06], [sx, (py0 + base) / 2, zc + sz])
    for (const sx of [g.xPack0 + 0.3, g.xPack1 - 0.3]) k.torus('stainless', 0.05, 0.01, [sx, py0 + ph + 0.07, zc], 'z', 6, 14)
  }
  // water surface and oil layer gathering at the skimmer
  k.box('liquidWater', [Li - 0.02, 0.02, Wi - 0.02], [0, wl - 0.01, 0])
  k.box('liquidOil', [g.xBaffle - g.xPack1 - 0.05, 0.02, Wi - 0.03], [(g.xBaffle + g.xPack1) / 2, wl + 0.008, 0])
  // slotted-pipe skimmer across the width, turned by a handwheel on the wall top
  const sNps = Math.max(p.oilNps + 1, 4)
  const sod = pipeOD(sNps)
  k.pipe('stainless', [g.xSkim, wl - 0.02, -Wi / 2 + 0.02], [g.xSkim, wl - 0.02, Wi / 2 + t + 0.02], sod, 0.006)
  k.disc('stainless', sod / 2, [g.xSkim, wl - 0.02, -Wi / 2 + 0.02], '-z', 24)
  k.box('rubberBlack', [0.012, 0.05, Wi - 0.3], [g.xSkim, wl - 0.02 + sod / 2 - 0.01, 0])
  const zo = Wi / 2 + t
  pipeRun(k, [[g.xSkim, wl - 0.02, zo + 0.02], [g.xSkim, wl - 0.02, zo + 0.12], [g.xSkim, wl - 0.25, zo + 0.12], [g.xSkim, wl - 0.25, zo + 0.25]], p.oilNps, { mat: 'stainless' })
  k.cyl('stainless', sod / 2 + 0.01, 0.02, [g.xSkim, wl - 0.02, zo + 0.02], 'z', 24)
  nozzle(k, { base: [g.xSkim, wl - 0.25, zo + 0.25], dir: [0, 0, 1], nps: p.oilNps, rating: p.rating, standout: g.so - 0.25, mat: 'stainless' })
  k.rod('stainless', [g.xSkim, wl - 0.02, -Wi / 2 + 0.02], [g.xSkim, top + 0.45, -Wi / 2 + 0.02], 0.02, 8)
  k.handwheel('handwheel', 0.3, [g.xSkim, top + 0.45, -Wi / 2 + 0.02], 'y', 4)
  // underflow baffle and adjustable outlet weir into the clean-water chamber
  k.box(steel, [0.012, top - (base + 0.5), Wi], [g.xBaffle, (top + base + 0.5) / 2, 0])
  k.box(g.conc ? 'concrete' : shell, [0.2, wl - 0.05 - base, Wi], [g.xWeir, base + (wl - 0.05 - base) / 2, 0])
  k.box('stainless', [0.008, 0.25, Wi], [g.xWeir - 0.104, wl - 0.1, 0])
  for (let z = -Wi / 2 + 0.2; z < Wi / 2; z += 0.4) k.hex('nut', 0.025, 0.012, [g.xWeir - 0.11, wl - 0.15, z], 'x')
  // inlet and outlet nozzles through the end walls
  nozzle(k, { base: [X0 + 0.05, g.inY, 0], dir: [-1, 0, 0], nps: p.inletNps, rating: p.rating, standout: t + g.so - 0.05, mat: 'pipePaint' })
  nozzle(k, { base: [X1 - 0.05, g.outY, 0], dir: [1, 0, 0], nps: p.inletNps, rating: p.rating, standout: t + g.so - 0.05, mat: 'pipePaint' })
  // inlet chamber sludge draw-off and stilling hood
  pipeRun(k, [[X0 + 0.5, base + 0.15, -Wi / 2 + 0.3], [X0 + 0.5, top + 0.4, -Wi / 2 + 0.3]], 3)
  k.cyl('valveBody', 0.07, 0.18, [X0 + 0.5, top + 0.5, -Wi / 2 + 0.3], 'y', 14)
  k.handwheel('handwheel', 0.18, [X0 + 0.5, top + 0.62, -Wi / 2 + 0.3], 'y', 4)
  // covers: checker plate on steel bearers, plate-pack bay left open; else perimeter handrail
  if (p.covers) {
    const segs: [number, number][] = [[X0, g.xPack0 - 0.2], [g.xPack1 + 0.2, X1]]
    for (const [a, b] of segs) {
      for (let x = a + 0.3; x < b - 0.1; x += 1.2) member(k, [x, top + 0.06, -Wi / 2 - t / 2], [x, top + 0.06, Wi / 2 + t / 2], 'UPN 120', 'galvanised', [0, 1, 0])
      checkerPlate(k, [(a + b) / 2, top + 0.13, 0], b - a, Wi + t)
    }
    for (const x of [X0 + 0.9, X1 - 0.6]) {
      pipeRun(k, [[x, top + 0.13, Wi / 4], [x, top + 0.7, Wi / 4], [x + 0.2, top + 0.7, Wi / 4], [x + 0.2, top + 0.5, Wi / 4]], 3, { mat: 'galvanised' })
    }
    k.cyl(paint('#3a6ea5'), 0.08, 0.2, [X1 - 0.6, top + 0.24, -Wi / 4], 'y', 18)
    k.cyl(paint('#3a6ea5'), 0.12, 0.05, [X1 - 0.6, top + 0.37, -Wi / 4], 'y', 18)
    handrail(k, [[g.xPack0 - 0.2, top + 0.13, Wi / 2 + t / 2], [g.xPack1 + 0.2, top + 0.13, Wi / 2 + t / 2]])
  } else handrail(k, [[X0, top + 0.06, Wi / 2 + t / 2], [X1, top + 0.06, Wi / 2 + t / 2]])
  // walkway on the -Z wall, stair down at the inlet end
  const zw = -W / 2 - 0.45
  for (let x = X0; x <= X1 + 0.01; x += Li / 4) member(k, [x, top - 0.1, -W / 2], [x, top - 0.1, zw - 0.4], 'UPN 120', 'galvanised', [0, 1, 0])
  grating(k, [0, top, zw], Li, 0.9)
  handrail(k, [[X0 + 1.0, top, zw - 0.45], [X1, top, zw - 0.45], [X1, top, -W / 2]])
  stair(k, [X0 - 0.01 - stairRun(top), 0, zw - 0.0], 'x', top, 0.8, 'left')
  if (g.conc) for (const x of [X0 + 0.2, X1 - 0.2]) member(k, [x, 0, zw - 0.35], [x, top - 0.18, zw - 0.35], 'SHS 100x100x6', 'galvanised')
  // tag, earth boss on the steel work
  if (p.tag) tagPlate(k, p.tag, [0, top - 0.5, W / 2 + 0.002], 'z', 0.35)
  earthBond(k, [X1 + t + 0.002, 0.45, -W / 2 + 0.4], [1, 0, 0], 0, 0.35)
}

function stairRun(rise: number) {
  const n = Math.max(1, Math.round(rise / 0.18))
  return ((n - 1) * rise) / n / Math.tan((38 * Math.PI) / 180)
}
