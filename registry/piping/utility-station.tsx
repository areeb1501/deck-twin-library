// Deck utility (hose) station: post with backing panel, air / water / nitrogen drops fed from overhead, isolation ball valve, check valve and service-specific hose coupling pointing down, ISO 14726 bands, signage and hose racks.
import type { Kit, MatKey, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { member } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { SERVICE, pipeOD, type Service } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { flangeLength, portFlange, serviceBand, smallBallValve } from './_piping'

export interface UtilityStationProps {
  air?: boolean
  water?: boolean
  nitrogen?: boolean
  /** elevation of the supply flanges at the top of the drops, m */
  supply?: number
  tag?: string
  /** yellow impact bollards in front */
  bollards?: boolean
}

export const defaults = { air: true, water: true, nitrogen: true, supply: 2.4, tag: 'US-01', bollards: false }

type Svc = 'air' | 'water' | 'nitrogen'
const SVC: { id: Svc; service: Service; label: string; x: number; y: number; nps: number }[] = [
  { id: 'air', service: 'air', label: 'PLANT AIR', x: -0.17, y: 1.32, nps: 1 },
  { id: 'water', service: 'water', label: 'UTILITY WATER', x: -0.05, y: 1.18, nps: 1 },
  { id: 'nitrogen', service: 'nitrogen', label: 'NITROGEN', x: 0.07, y: 1.04, nps: 1 },
]
const Z = 0.13
const RATING = 150

export function ports(p: UtilityStationProps = {}): Port[] {
  const o = { ...defaults, ...p }
  return SVC.filter((s) => o[s.id]).map((s) => port(s.id, `${s.label} supply`, [s.x, Math.max(o.supply, 2.1), Z], [0, 1, 0], s.nps, RATING, 'utility'))
}

export function UtilityStation({ air = defaults.air, water = defaults.water, nitrogen = defaults.nitrogen, supply = defaults.supply, tag = defaults.tag, bollards = defaults.bollards, ...group }: UtilityStationProps & GroupProps) {
  const data = useKit((k) => build(k, { air, water, nitrogen }, Math.max(supply, 2.1), tag, bollards), [air, water, nitrogen, supply, tag, bollards])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default UtilityStation

function build(k: Kit, on: Record<Svc, boolean>, supply: number, tag: string, bollards: boolean) {
  // SHS post on an anchored base plate, galvanised backing panel and header sign
  const H = 2.0
  k.box('galvanised', [0.3, 0.02, 0.3], [0, 0.01, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.hex('nut', 0.03, 0.016, [sx * 0.11, 0.028, sz * 0.11])
    k.cyl('galvanised', 0.008, 0.04, [sx * 0.11, 0.035, sz * 0.11], 'y', 8)
  }
  member(k, [0, 0.02, 0], [0, H, 0], 'SHS 100x100x6.3', 'galvanised')
  k.box('galvanised', [0.12, 0.01, 0.12], [0, H + 0.005, 0])
  k.box('galvanised', [0.52, 1.1, 0.006], [0, 1.35, 0.053])
  for (const y of [0.9, 1.8]) k.box('galvanised', [0.06, 0.04, 0.012], [0, y, 0.046])
  k.plane(textMaterial(`UTILITY STATION ${tag}`, '#1d4f91', '#ffffff', 512, 96), 0.48, 0.09, [0, 0.86, 0.0565])

  for (const s of SVC) {
    if (!on[s.id]) continue
    const band: MatKey = paint(SERVICE[s.service].band)
    const d = pipeOD(s.nps)
    const yF = supply - flangeLength(s.nps, RATING)
    portFlange(k, s.nps, RATING, [s.x, supply, Z], [0, 1, 0])
    // drop from the supply flange down to the valve
    const yv = s.y + 0.22
    const pipeMat: MatKey = 'stainless'
    k.pipe(pipeMat, [s.x, yv + 0.06, Z], [s.x, yF, Z], d, 0.0034)
    for (const y of [1.75, 1.15]) if (y < yF && y > yv) k.torus('galvanised', d / 2 + 0.006, 0.004, [s.x, y, Z - 0.002], 'y', 6, 16, Math.PI)
    serviceBand(k, s.service, [s.x, Math.min(yF - 0.15, 1.95), Z], [0, 1, 0], d / 2)
    // isolation valve (lever to the front), check valve, coupling pointing down
    smallBallValve(k, s.nps, [s.x, yv, Z], [0, -1, 0], [0, 0, 1], s.id === 'nitrogen' ? 'safetyYellow' : 'actuatorRed')
    k.cyl(pipeMat, d / 2, 0.05, [s.x, yv - 0.07, Z], 'y', 12)
    k.hex(pipeMat, d * 1.45, 0.06, [s.x, yv - 0.12, Z])
    k.cyl(pipeMat, d * 0.62, 0.03, [s.x, yv - 0.12, Z], 'y', 12)
    coupling(k, s.id, [s.x, yv - 0.15, Z], d)
    // service sign above the drop
    k.plane(textMaterial(s.label, SERVICE[s.service].band, s.id === 'nitrogen' ? '#111111' : '#ffffff', 512, 128), 0.11, 0.04, [s.x, s.y - 0.07, 0.0565])
    k.box(band, [0.11, 0.006, 0.002], [s.x, s.y - 0.093, 0.0565])
  }
  if (on.nitrogen) k.plane(textMaterial('N2 ASPHYXIANT', '#c8102e', '#ffffff', 512, 220), 0.11, 0.05, [0.195, 1.04, 0.0565])

  // hose racks on both sides: arm, half-round saddle, coiled hose
  for (const [sx, hose] of [[1, 'rubberBlack'], [-1, paint('#2f6f3a')]] as [number, MatKey][]) {
    const x0 = sx * 0.05
    const x1 = sx * 0.33
    const y = 1.5
    member(k, [x0, y, 0], [x1, y, 0], 'L60x60x6', 'galvanised')
    k.tube('galvanised', Array.from({ length: 9 }, (_, i) => [x1, y - 0.12 * Math.sin((i / 8) * Math.PI), 0.12 * Math.cos((i / 8) * Math.PI)] as V3), 0.012, 8, 0.01)
    for (let i = 0; i < 4; i++) k.torus(hose, 0.2, 0.012, [x1 + sx * (0.02 + i * 0.024), y - 0.2 + 0.0, 0], 'x', 8, 40)
  }

  if (bollards)
    for (const x of [-0.45, 0.45]) {
      k.cyl('safetyYellow', 0.057, 1.0, [x, 0.5, 0.7], 'y', 20)
      k.dome('safetyYellow', 0.057, [x, 1.0, 0.7], 'y')
      k.cyl('rubberBlack', 0.058, 0.05, [x, 0.8, 0.7], 'y', 20)
      k.box('galvanised', [0.2, 0.015, 0.2], [x, 0.0075, 0.7])
    }
}

/** Service-specific hose connection so air, water and nitrogen hoses cannot be cross-connected. */
function coupling(k: Kit, id: Svc, top: V3, d: number) {
  const [x, y, z] = top
  if (id === 'air') {
    // universal claw (Chicago) head: body, two lugs, safety-clip hole
    k.cyl('brass', d * 0.55, 0.035, [x, y - 0.0175, z], 'y', 16)
    for (const s of [-1, 1]) k.box('brass', [d * 0.4, 0.012, d * 0.28], [x + s * d * 0.6, y - 0.03, z])
    k.cyl('rubberBlack', d * 0.6, 0.004, [x, y - 0.037, z], 'y', 16)
  } else if (id === 'water') {
    // cam-and-groove adapter with two cam arms
    k.cyl('aluminium', d * 0.7, 0.045, [x, y - 0.0225, z], 'y', 20)
    for (const s of [-1, 1]) {
      k.box('aluminium', [0.006, 0.05, 0.012], [x + s * (d * 0.75), y - 0.015, z])
      k.cyl('aluminium', 0.004, 0.02, [x + s * (d * 0.75), y - 0.038, z], 'z', 8)
    }
    k.lathe('pipeBore', [[d * 0.5, -0.045], [d * 0.5, 0]], [x, y, z], 'y', 16)
  } else {
    // dedicated threaded nitrogen connection with a hex nut and dust cap on a chain
    k.cyl('brass', d * 0.45, 0.03, [x, y - 0.015, z], 'y', 12)
    k.hex('brass', d * 1.25, 0.022, [x, y - 0.04, z])
    k.cyl(paint('#2b2b2b'), d * 0.5, 0.018, [x, y - 0.06, z], 'y', 12)
    k.tube('galvanised', [[x + d * 0.5, y - 0.06, z], [x + d * 0.9, y - 0.09, z], [x + d * 0.7, y - 0.02, z]], 0.0015, 4, 0.01)
  }
}
