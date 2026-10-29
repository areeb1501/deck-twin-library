// Multi-tier pipe rack: HEB portal bents with knee braces, IPE longitudinal struts, X-braced bays, base plates and anchors, optional cable-tray tier and cantilevered access walkway with caged ladder.
import { eul, type Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { ladderFlight } from './_access'
import { bar, basePlate, beamTOS, column, endPlate, finPlate, gate, gratingBay, gusset, railRun, sec } from './_steel'
import { ladderTray } from './_tray'

export interface PipeRackProps {
  bays?: number
  /** bent spacing along X, m */
  bayLength?: number
  /** post centre to post centre across the rack (Z), m */
  width?: number
  /** pipe tiers when `tierElevations` is empty */
  tiers?: number
  /** top of steel of the first tier, m */
  firstTier?: number
  tierSpacing?: number
  /** explicit tier tops of steel, m (overrides tiers / firstTier / tierSpacing) */
  tierElevations?: number[]
  post?: string
  beam?: string
  strut?: string
  bracing?: boolean
  /** extra tier on top carrying two ladder cable trays */
  cableTray?: boolean
  /** cantilevered grating walkway on +Z at the top pipe tier, with a caged ladder at +X */
  walkway?: boolean
}

export const defaults = {
  bays: 4,
  bayLength: 6,
  width: 6,
  tiers: 2,
  firstTier: 4.5,
  tierSpacing: 2,
  tierElevations: [] as number[],
  post: 'HEB 300',
  beam: 'HEB 200',
  strut: 'IPE 200',
  bracing: true,
  cableTray: true,
  walkway: true,
}

type P = typeof defaults

export function PipeRack(props: PipeRackProps & GroupProps) {
  const { bays, bayLength, width, tiers, firstTier, tierSpacing, tierElevations, post, beam, strut, bracing, cableTray, walkway, ...group } = { ...defaults, ...props }
  const p: P = { bays, bayLength, width, tiers, firstTier, tierSpacing, tierElevations, post, beam, strut, bracing, cableTray, walkway }
  const data = useKit((k) => build(k, p), [bays, bayLength, width, tiers, firstTier, tierSpacing, JSON.stringify(tierElevations), post, beam, strut, bracing, cableTray, walkway])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default PipeRack

function build(k: Kit, p: P) {
  const st = 'structSteel'
  const dark = 'structSteelDark'
  const n = Math.max(1, Math.round(p.bays))
  const L = n * p.bayLength
  const W = p.width
  const C = sec(p.post)
  const B = sec(p.beam)
  const T = sec(p.strut)
  const pipeTiers = (p.tierElevations?.length ? [...p.tierElevations] : Array.from({ length: Math.max(1, Math.round(p.tiers)) }, (_, i) => p.firstTier + i * p.tierSpacing)).sort((a, b) => a - b)
  const trayTos = p.cableTray ? pipeTiers[pipeTiers.length - 1] + Math.max(1.2, p.tierSpacing * 0.75) : 0
  const tiers = p.cableTray ? [...pipeTiers, trayTos] : pipeTiers
  const top = tiers[tiers.length - 1]
  const xs = Array.from({ length: n + 1 }, (_, i) => -L / 2 + i * p.bayLength)
  const zs = [-W / 2, W / 2]
  const tp = 0.03

  // ---- bents: posts (web in the bent plane), base plates, cap plates, tier beams on end plates, knee braces
  for (const x of xs) {
    for (const z of zs) {
      basePlate(k, x, 0, z, C.b + 0.16, C.d + 0.16, tp, 0.024, st)
      column(k, x, z, tp, top, p.post, st, 'z')
      k.box(st, [C.b + 0.02, 0.02, C.d + 0.02], [x, top + 0.01, z])
      for (const s of [-1, 1]) gusset(k, [x + s * C.b / 2, tp, z], [s, 0, 0], [0, 1, 0], 0.07, 0.22, 0.012)
    }
    for (const tos of tiers) {
      const tp = B.d > 0.5 ? 0.025 : 0.02 // end plate bears on the post flange
      const za = -W / 2 + C.d / 2 + tp
      const zb = W / 2 - C.d / 2 - tp
      beamTOS(k, x, za, x, zb, tos, p.beam, st)
      endPlate(k, [x, tos - B.d / 2, za], 'z', -1, B)
      endPlate(k, [x, tos - B.d / 2, zb], 'z', 1, B)
    }
    const t1 = tiers[0] - B.d
    for (const s of [-1, 1]) {
      const zf = s * (W / 2 - C.d / 2)
      bar(k, [x, t1 - 1.1, zf], [x, t1, zf - s * 1.1], 'L100x100x10', dark, [1, 0, 0])
    }
  }

  // ---- longitudinal struts along both post lines at every tier
  for (const tos of tiers)
    for (const z of zs)
      for (let i = 0; i < n; i++) {
        const xa = xs[i] + C.b / 2 + 0.005
        const xb = xs[i + 1] - C.b / 2 - 0.005
        beamTOS(k, xa, z, xb, z, tos, p.strut, st)
        finPlate(k, [xs[i] + C.tw / 2, tos - T.d / 2, z], 'x', 1, T.d, C.b / 2 + 0.09)
        finPlate(k, [xs[i + 1] - C.tw / 2, tos - T.d / 2, z], 'x', -1, T.d, C.b / 2 + 0.09)
      }
  // longitudinal knee braces under the first tier struts
  for (const x of xs)
    for (const z of zs)
      for (const d of [-1, 1]) {
        if ((x === xs[0] && d < 0) || (x === xs[n] && d > 0)) continue
        const y = tiers[0] - T.d
        bar(k, [x + d * C.b / 2, y - 0.9, z], [x + d * (C.b / 2 + 0.9), y, z], 'L80x80x8', dark, [0, 0, 1])
      }
  // vertical X bracing in the end bays (and every third bay on long racks), base to first tier
  if (p.bracing) {
    const braced = new Set([0, n - 1])
    for (let i = 3; i < n - 1; i += 3) braced.add(i)
    for (const i of braced)
      for (const z of zs) {
        const zz = z + (z < 0 ? -1 : 1) * (C.d / 2 + 0.05)
        const y0 = 0.35
        const y1 = tiers[0] - T.d - 0.1
        bar(k, [xs[i] + 0.2, y0, zz], [xs[i + 1] - 0.2, y1, zz], 'L100x100x10', dark, [0, 0, 1])
        bar(k, [xs[i + 1] - 0.2, y0, zz], [xs[i] + 0.2, y1, zz], 'L100x100x10', dark, [0, 0, 1])
        k.box('galvanised', [0.25, 0.25, 0.012], [(xs[i] + xs[i + 1]) / 2, (y0 + y1) / 2, zz])
      }
  }

  // ---- cable trays on the top tier
  if (p.cableTray) for (const zc of [-W / 4 + 0.15, W / 4 - 0.15]) ladderTray(k, -L / 2 - 0.3, L / 2 + 0.3, zc, trayTos, Math.min(0.6, W / 2 - 0.6), { fill: 0.7 })

  // ---- walkway cantilevered on +Z at the top pipe tier, rails both sides, caged ladder at +X
  if (p.walkway) {
    const yW = pipeTiers[pipeTiers.length - 1] + 0.03
    const z0 = W / 2 + C.d / 2
    const z1 = z0 + 1.0
    const xa = -L / 2 - 0.3
    const xb = L / 2 + 0.3
    for (const x of xs) {
      beamTOS(k, x, z0, x, z1, yW - 0.03, 'UPN 160', st)
      bar(k, [x, yW - 0.9, z0], [x, yW - 0.2, z1 - 0.15], 'L80x80x8', dark, [1, 0, 0])
    }
    for (const z of [z0 + 0.04, z1 - 0.04]) beamTOS(k, xa, z, xb, z, yW - 0.03, 'UPN 160', st)
    gratingBay(k, xa, z0, xb, z1, yW, 'z')
    const ladW = 0.7
    const zc = (z0 + z1) / 2
    railRun(k, [xa + 0.03, yW, z1 - 0.03], [xb - 0.03, yW, z1 - 0.03])
    railRun(k, [xa + 0.03, yW, z0 + 0.03], [xb - 0.03, yW, z0 + 0.03])
    railRun(k, [xa + 0.03, yW, z0 + 0.03], [xa + 0.03, yW, z1 - 0.03], { startPost: false, endPost: false })
    railRun(k, [xb - 0.03, yW, z0 + 0.03], [xb - 0.03, yW, zc - ladW / 2], { startPost: false })
    railRun(k, [xb - 0.03, yW, zc + ladW / 2], [xb - 0.03, yW, z1 - 0.03], { endPost: false })
    gate(k, [xb - 0.03, yW, zc - ladW / 2], [xb - 0.03, yW, zc + ladW / 2])
    k.at([xb + 0.2, 0, zc], eul(0, Math.PI / 2, 0), () => ladderFlight(k, 0, 0, yW, 0, { standoff: 0.2 }))
    k.box('galvanised', [0.22, 0.02, 0.5], [xb + 0.09, yW - 0.01, zc])
  }
}
