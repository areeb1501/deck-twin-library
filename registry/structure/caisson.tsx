// Deck-hung caisson (seawater lift, disposal or open-drain sump): pipe hung off a gusseted deck collar, flanged side inlet and vent, blind top cover, guide clamps, anodes and a slotted open bottom.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { blindFlange, nozzle } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { gusset } from './_steel'

export interface CaissonProps {
  /** caisson pipe size, NPS */
  nps?: number
  /** length below the deck, m */
  length?: number
  /** caisson top above the deck, m */
  stickUp?: number
  inletNps?: number
  ventNps?: number
  rating?: Rating
  /** guide clamp spacing below the deck, m */
  guideSpacing?: number
  anodes?: boolean
}

export const defaults = {
  nps: 24,
  length: 25,
  stickUp: 1.4,
  inletNps: 6,
  ventNps: 2,
  rating: 150 as Rating,
  guideSpacing: 8,
  anodes: true,
}

type P = typeof defaults

function nozzles(p: P) {
  const R = pipeOD(p.nps) / 2
  const yIn = Math.max(0.5, p.stickUp - 0.75)
  const yV = p.stickUp - 0.25
  return {
    R,
    inlet: { base: [R, yIn, 0] as [number, number, number], face: [R + nozzleStandout(p.inletNps, p.rating), yIn, 0] as [number, number, number] },
    vent: { base: [-R, yV, 0] as [number, number, number], face: [-R - nozzleStandout(p.ventNps, p.rating), yV, 0] as [number, number, number] },
  }
}

export function ports(props: CaissonProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const n = nozzles(p)
  return [
    port('inlet', 'Inlet', n.inlet.face, [1, 0, 0], p.inletNps, p.rating),
    port('vent', 'Vent', n.vent.face, [-1, 0, 0], p.ventNps, p.rating, 'vent'),
  ]
}

export function Caisson(props: CaissonProps & GroupProps) {
  const { nps, length, stickUp, inletNps, ventNps, rating, guideSpacing, anodes, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { nps, length, stickUp, inletNps, ventNps, rating, guideSpacing, anodes }), [nps, length, stickUp, inletNps, ventNps, rating, guideSpacing, anodes])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Caisson

function build(k: Kit, p: P) {
  const n = nozzles(p)
  const R = n.R
  const od = 2 * R
  const wall = Math.max(0.0127, od * 0.03)
  const top = Math.max(0.9, p.stickUp)
  const bot = -Math.max(3, p.length)
  const mat = 'pipePaint'
  const growth = 'structSteelDark'
  // pipe: painted above the cellar, darker below 3 m under the deck
  k.pipe(mat, [0, top - 0.12, 0], [0, -3, 0], od, wall, 32)
  k.pipe(growth, [0, -3, 0], [0, bot, 0], od, wall, 32)
  // top: weld-neck flange and blind cover with lifting lug
  const face: [number, number, number] = [0, top, 0]
  blindFlange(k, p.nps, p.rating, face, 'y')
  k.cyl(mat, R * 1.25, 0.12, [0, top - 0.06, 0], 'y', 32)
  k.box('structSteel', [0.12, 0.1, 0.02], [0, top + 0.12, 0])
  // hang-off collar on the deck: ring plate and gussets
  k.pipe('structSteel', [0, 0, 0], [0, 0.04, 0], od + 0.5, 0.25 - 0.002, 32)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const d: [number, number, number] = [Math.cos(a), 0, Math.sin(a)]
    gusset(k, [d[0] * R, 0.04, d[2] * R], d, [0, 1, 0], 0.22, 0.35, 0.016)
  }
  // nozzles
  nozzle(k, { base: n.inlet.base, dir: [1, 0, 0], nps: p.inletNps, rating: p.rating, standout: n.inlet.face[0] - R, pad: pipeOD(p.inletNps) * 1.8 })
  nozzle(k, { base: n.vent.base, dir: [-1, 0, 0], nps: p.ventNps, rating: p.rating, standout: -n.vent.face[0] - R })
  // guide clamps with stand-off brackets to the jacket steel on -Z
  for (let y = -Math.min(p.guideSpacing, 4); y > bot + 1; y -= Math.max(2, p.guideSpacing)) {
    const m = y < -3 ? growth : mat
    k.pipe(m, [0, y - 0.25, 0], [0, y + 0.25, 0], od + 0.06, 0.028, 32)
    k.box('structSteel', [0.3, 0.3, 0.9], [0, y, -R - 0.48])
    k.box('structSteel', [0.4, 0.02, 0.4], [0, y, -R - 0.94])
  }
  // slotted bottom section and a stiffening ring at the open end
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a)
    for (let j = 0; j < 3; j++) k.box('pipeBore', [0.006, 0.45, 0.07], [Math.cos(a) * (R + 0.001), bot + 0.8 + j * 0.65, Math.sin(a) * (R + 0.001)], q)
  }
  k.pipe(growth, [0, bot, 0], [0, bot + 0.15, 0], od + 0.04, 0.03, 32)
  if (p.anodes)
    for (let y = -6; y > bot + 2; y -= 6) {
      k.rod('aluminium', [R + 0.16, y - 0.6, 0], [R + 0.16, y + 0.6, 0], 0.07, 8)
      for (const s of [-0.5, 0.5]) k.rod('structSteelDark', [R - 0.01, y + s, 0], [R + 0.16, y + s, 0], 0.015, 6)
    }
}
