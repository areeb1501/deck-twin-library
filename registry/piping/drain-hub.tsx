// Open drain hub or tundish on the deck: cast hub flush with a doubler, or a raised funnel with rolled rim; bar grating cover, deck penetration and flanged drain outlet below.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { pipeOD, pipeWall, type Rating } from '../lib/standards'
import { buttWeld, endFlange, flangeLen, pipeStub, seg } from './_flanges'

export interface DrainHubProps {
  kind?: 'hub' | 'tundish'
  /** drain outlet size, inches */
  nps?: number
  /** rim height above the deck, m */
  height?: number
  /** pipe length below the deck to the outlet flange face, m */
  depth?: number
  /** bar grating cover */
  cover?: boolean
}

export const defaults = { kind: 'hub' as const, nps: 4, height: 0.1, depth: 0.45, cover: true }

const RATING: Rating = 150

/** typical: hub OD about 2.4 x the outlet OD; tundish mouth about 3 x. */
function dims(p: DrainHubProps) {
  const o = { ...defaults, ...p }
  const od = pipeOD(o.nps)
  const tun = o.kind === 'tundish'
  const R = od * (tun ? 1.5 : 1.2) + 0.02
  const h = Math.max(tun ? 0.15 : 0.05, o.height)
  const depth = Math.max(flangeLen(o.nps, RATING) + 0.1, o.depth)
  return { ...o, od, tun, R, h, depth }
}

// Port 'drain' is the outlet flange face below the deck, pointing down.
export function ports(p: DrainHubProps = {}): Port[] {
  const d = dims(p)
  return [port('drain', 'Drain outlet', [0, -d.depth, 0], [0, -1, 0], d.nps, RATING, 'drain')]
}

export function DrainHub({ kind = defaults.kind, nps = defaults.nps, height = defaults.height, depth = defaults.depth, cover = defaults.cover, ...group }: DrainHubProps & GroupProps) {
  const data = useKit((k) => build(k, { kind, nps, height, depth, cover }), [kind, nps, height, depth, cover])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default DrainHub

function build(k: Kit, p: DrainHubProps) {
  const d = dims(p)
  const { nps, od, R, h } = d
  const ro = od / 2
  const wt = pipeWall(nps, 'STD')
  const ri = ro - wt
  const n = seg(R * 2)
  const fl = flangeLen(nps, RATING)
  // outlet: pipe down through the deck to a weld-neck flange facing down
  endFlange(k, nps, RATING, [0, -d.depth, 0], [0, -1, 0], 'STD')
  const yw = -d.depth + fl
  const y0 = d.tun ? h - R * 0.9 : -0.02
  pipeStub(k, [0, yw, 0], [0, 1, 0], y0 - yw, nps, 'STD', 'open', 'open')
  buttWeld(k, [0, yw, 0], [0, 1, 0], ro, wt)
  // deck penetration: doubler ring on the deck and a sleeve under it
  const rd = (d.tun ? ro * 1.6 : R) + 0.05
  const rs = (d.tun ? ro * 1.25 : R) + 0.004
  k.lathe('equipmentPaintDark', [[rs, 0], [rd, 0], [rd, 0.008], [rd - 0.004, 0.012], [d.tun ? ro * 1.25 : R, 0.012]], [0, 0, 0], 'y', n)
  if (d.tun) k.lathe('equipmentPaintDark', [[ro * 1.25, 0.012], [ro, 0.012]], [0, 0, 0], 'y', n)
  k.cyl('equipmentPaintDark', rs, 0.06, [0, -0.03, 0], 'y', n, undefined, true)
  k.lathe('equipmentPaintDark', [[ro, -0.06], [rs, -0.06]], [0, 0, 0], 'y', n)
  const g = paint('#3b3e42', { roughness: 0.7 })
  if (!d.tun) {
    // cast hub: rim, bowl falling to the outlet bore
    const rimIn = R - 0.012
    k.lathe(g, [[R, 0.012], [R, h - 0.004], [R - 0.004, h], [rimIn, h], [rimIn, h - 0.03]], [0, 0, 0], 'y', n)
    k.lathe(g, [[rimIn, h - 0.03], [rimIn - 0.01, h - 0.036], [ri * 1.05, -0.005], [ri, -0.02]], [0, 0, 0], 'y', n)
    if (d.cover) grating(k, rimIn - 0.002, h - 0.03, 0.025)
    return
  }
  // tundish: open funnel with a rolled rim on the riser, air break above any tail pipe
  const top = h
  const rimR = R
  k.lathe('galvanised', [[ro, y0], [ro * 1.1, y0 + 0.02], [rimR, top - 0.01], [rimR, top]], [0, 0, 0], 'y', n)
  k.lathe('galvanised', [[rimR - 0.003, top], [rimR - 0.003, top - 0.01], [ro * 1.1 - 0.003, y0 + 0.02], [ri, y0 + 0.004]], [0, 0, 0], 'y', n)
  k.torus('galvanised', rimR + 0.002, 0.005, [0, top, 0], 'y', 8, n)
  buttWeld(k, [0, y0, 0], [0, 1, 0], ro, wt)
  if (d.cover) grating(k, rimR - 0.004, top - 0.012, 0.02)
}

/** Round bar grating: bearing bars across a banded frame, cross rods on top. */
function grating(k: Kit, R: number, y: number, depth: number) {
  const g = 'galvanised'
  k.lathe(g, [[R - 0.006, y - depth], [R, y - depth], [R, y], [R - 0.006, y], [R - 0.006, y - depth]], [0, 0, 0], 'y', seg(R * 2))
  const pitch = 0.03
  const t = 0.004
  for (let z = -R + pitch; z < R - 0.004; z += pitch) {
    const half = Math.sqrt(Math.max(0, (R - 0.005) ** 2 - z * z))
    if (half < 0.01) continue
    k.box(g, [half * 2, depth * 0.9, t], [0, y - depth * 0.45, z])
  }
  for (let x = -R + 0.05; x < R - 0.02; x += 0.05) {
    const half = Math.sqrt(Math.max(0, (R - 0.005) ** 2 - x * x))
    if (half < 0.01) continue
    k.rod(g, [x, y - 0.003, -half], [x, y - 0.003, half], 0.003, 6)
  }
}
