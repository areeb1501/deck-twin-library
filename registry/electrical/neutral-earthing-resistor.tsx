// Neutral earthing resistor: stainless grid elements on insulators in a ventilated 316 enclosure on legs, HV entry bushing, CT cable box, earth bushing. IEEE 32, IEC 60529.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { signMaterial } from '../lib/textures'
import { cableGland, earthBoss, louvrePanel } from './_parts'
import { ratingPlateMaterial } from './_textures'

export interface NeutralEarthingResistorProps {
  /** system line voltage, kV */
  kv?: number
  /** let-through current, A */
  amps?: number
  /** rated time, s */
  seconds?: number
  /** one side panel removed to show the resistor grids */
  open?: boolean
  /** neutral connection: cable box with ring CT, or roof bushing for an overhead / busbar connection */
  entry?: 'cable' | 'bushing'
  tag?: string
}

export const defaults = {
  kv: 11,
  amps: 400,
  seconds: 10,
  open: false,
  entry: 'cable' as 'cable' | 'bushing',
  tag: 'NER-8201',
}

export function NeutralEarthingResistor(props: NeutralEarthingResistorProps & GroupProps) {
  const { kv, amps, seconds, open, entry, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { kv, amps, seconds, open, entry, tag }), [kv, amps, seconds, open, entry, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default NeutralEarthingResistor

function build(k: Kit, p: typeof defaults) {
  const S: MatKey = 'stainless'
  // energy sets the grid count (stacked frames of punched stainless grids)
  const V = (p.kv * 1000) / Math.sqrt(3)
  const MJ = (V * p.amps * p.seconds) / 1e6
  const stacks = Math.max(1, Math.min(6, Math.ceil(MJ / 40))) // typical ~40 MJ per stack
  const tiers = Math.max(2, Math.min(5, Math.ceil(p.kv / 6)))
  const L = 0.4 + stacks * 0.55
  const Wd = 0.9
  const leg = 0.5
  const Hb = 0.35 + tiers * 0.32
  const y0 = leg
  const y1 = leg + Hb
  // legs and base channels
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      k.box('galvanised', [0.08, leg, 0.08], [sx * (L / 2 - 0.06), leg / 2, sz * (Wd / 2 - 0.06)])
      k.box('galvanised', [0.2, 0.012, 0.2], [sx * (L / 2 - 0.06), 0.006, sz * (Wd / 2 - 0.06)])
    }
  k.box('galvanised', [L, 0.06, Wd], [0, y0 + 0.03, 0])
  // enclosure frame (hollow): corner posts, roof with overhang, mesh / louvred side panels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(S, [0.04, Hb, 0.04], [sx * (L / 2 - 0.02), y0 + Hb / 2, sz * (Wd / 2 - 0.02)])
  k.box(S, [L + 0.12, 0.03, Wd + 0.12], [0, y1 + 0.015, 0])
  k.box(S, [L + 0.12, 0.08, 0.01], [0, y1 - 0.01, Wd / 2 + 0.055])
  const qz = new THREE.Quaternion()
  const qzb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
  const qxb = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
  // louvred panels on both long sides (front one removable), plain end panels with the bushings
  const sides: [V3, THREE.Quaternion, number][] = [[[0, y0 + Hb / 2, Wd / 2], qz, L - 0.08], [[0, y0 + Hb / 2, -Wd / 2], qzb, L - 0.08]]
  for (const [i, [c, q, w]] of sides.entries()) {
    if (i === 0 && p.open) continue
    louvrePanel(k, w, Hb - 0.08, c, q, '#c3c7cb')
    louvrePanel(k, w, Hb - 0.08, [c[0], c[1], c[2] * 0.98], q.clone().multiply(qzb), '#c3c7cb')
  }
  for (const s of [-1, 1]) k.box(S, [0.004, Hb - 0.04, Wd - 0.08], [s * (L / 2 - 0.002), y0 + Hb / 2, 0])
  // grid stacks on post insulators, series links, tie rods
  const porcelain = paint('#6e3420', { metalness: 0.05, roughness: 0.15, clearcoat: 0.8 })
  const grid = paint('#9aa0a3', { metalness: 0.7, roughness: 0.5, weather: 0.3 })
  for (let s = 0; s < stacks; s++) {
    const x = -L / 2 + 0.2 + 0.275 + s * 0.55
    for (const dz of [-0.25, 0.25]) for (const dx of [-0.18, 0.18]) k.cyl(porcelain, 0.035, 0.18, [x + dx, y0 + 0.15, dz], 'y', 12)
    for (let t = 0; t < tiers; t++) {
      const yt = y0 + 0.3 + t * 0.32
      for (let g = 0; g < 7; g++) k.box(grid, [0.42, 0.012, 0.55], [x, yt + g * 0.035, 0])
      for (const dz of [-0.3, 0.3]) for (const dx of [-0.2, 0.2]) k.rod(S, [x + dx, yt - 0.02, dz], [x + dx, yt + 0.25, dz], 0.008, 6)
      k.box(paint('#d9d3c0', { roughness: 0.6 }), [0.46, 0.02, 0.6], [x, yt + 0.26, 0]) // mica insulating plate
      k.box('copper', [0.03, 0.3, 0.01], [x + 0.22, yt + 0.12, 0.29])
    }
  }
  // HV neutral entry: porcelain bushing on the roof, cable box with CT underneath on the +X end
  const xb = L / 2 - 0.25
  const LB = 0.2 + p.kv * 0.012
  const prof: [number, number][] = [[0.06, 0], [0.04, 0]]
  for (let i = 0; i < 4; i++) prof.push([0.04, i * (LB / 4) + 0.02], [0.075, i * (LB / 4) + 0.04], [0.04, i * (LB / 4) + 0.07])
  prof.push([0.03, LB], [0, LB])
  if (p.entry === 'bushing') {
    k.cyl(S, 0.09, 0.02, [xb, y1 + 0.04, 0], 'y', 20)
    k.boltCircle('boltXylan', 'nut', 6, 0.075, [xb, y1 + 0.03, 0], 'y', 0.01, 0.04, [0.025])
    k.lathe(porcelain, prof, [xb, y1 + 0.05, 0], 'y', 20)
    k.cyl('aluminium', 0.012, 0.08, [xb, y1 + 0.05 + LB + 0.04, 0], 'y', 8)
    k.box('copper', [0.03, 0.12, 0.01], [xb, y1 - 0.08, 0])
  } else {
    const cb: V3 = [L / 2 + 0.2, y0 + Hb * 0.55, 0]
    k.rbox(S, [0.4, 0.5, 0.5], 0.02, cb)
    k.box('nut', [0.14, 0.04, 0.14], [cb[0], cb[1] + 0.05, 0]) // CT window (ring CT behind)
    k.plane(signMaterial('hv'), 0.24, 0.12, [cb[0] + 0.201, cb[1] + 0.12, 0], qx)
    const g = cableGland(k, [cb[0], cb[1] - 0.25, 0], '-y', 0.045)
    k.spline('cable', [g, [g[0], 0.3, 0.05], [g[0] + 0.1, 0.05, 0.15], [g[0] + 0.6, 0.03, 0.2]], 0.024, 8, 20)
  }
  // LV earth bushing on the -X end to the earth bar, two enclosure earth bosses
  k.cyl(porcelain, 0.03, 0.1, [-L / 2 - 0.05, y0 + 0.2, 0.2], 'x', 12)
  k.tube('copper', [[-L / 2 - 0.1, y0 + 0.2, 0.2], [-L / 2 - 0.2, y0 + 0.2, 0.2], [-L / 2 - 0.2, 0.02, 0.2], [-L / 2 - 0.5, 0.02, 0.2]], 0.01, 6, 0.05)
  earthBoss(k, [L / 2 - 0.06, leg * 0.6, Wd / 2 - 0.02], 'z')
  earthBoss(k, [-L / 2 + 0.06, leg * 0.6, -Wd / 2 + 0.02], '-z')
  // rating plate, warning, tag
  k.plane(ratingPlateMaterial('NEUTRAL EARTHING RESISTOR', [`Tag  ${p.tag}`, `System  ${p.kv} kV`, `Current  ${p.amps} A for ${p.seconds} s`, `Resistance  ${(V / p.amps).toFixed(1)} Ω`, 'Element  AISI 304 grid', 'Enclosure  IP23, AISI 316']), 0.3, 0.2, [-L / 2 - 0.003, y0 + Hb * 0.55, -0.15], qxb)
  k.plane(signMaterial('hv'), 0.3, 0.15, [-L / 2 - 0.003, y0 + Hb * 0.85, -0.15], qxb)
  tagPlate(k, p.tag, [-L / 2 - 0.003, y0 + Hb * 0.3, -0.15], '-x', 0.16)
}
