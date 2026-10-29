// Restriction orifice: single paddle-type RO plate between ASME B16.5 flanges, or a multi-stage RO spool with internal plates for high pressure drops.
import * as THREE from 'three'
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { tagMaterial } from '../lib/textures'
import { flange as flangeDims, pipeOD, pipeWall, type Rating } from '../lib/standards'
import { boltHole, drilledPlate, flangeLen, inlineEnds, seg, waferFlanges } from './_flanges'

export interface RestrictionOrificeProps {
  /** nominal size, inches */
  nps?: number
  rating?: Rating
  /** orifice stages: 1 = paddle plate between flanges, 2–6 = multi-stage spool */
  stages?: number
  /** first-stage bore / pipe ID */
  beta?: number
  /** draw the companion flanges for the single plate */
  flanges?: boolean
  tag?: string
}

export const defaults = { nps: 2, rating: 600 as Rating, stages: 1, beta: 0.3, flanges: true, tag: 'RO-2001' }

/** typical plate thickness for RO service (thicker than metering plates). */
const plateT = (nps: number) => Math.max(0.006, Math.min(0.025, pipeOD(nps) * 0.06))

function dims(p: RestrictionOrificeProps) {
  const o = { ...defaults, ...p }
  const n = Math.min(6, Math.max(1, Math.round(o.stages)))
  const t = plateT(o.nps)
  const D = pipeOD(o.nps) - 2 * pipeWall(o.nps, '80')
  // typical multi-stage spacing: about one pipe ID between plates
  const pitch = Math.max(D * 1.2, 0.05)
  const L = n === 1 ? t : 2 * flangeLen(o.nps, o.rating) + 2 * Math.max(0.05, D * 0.8) + (n - 1) * pitch
  return { ...o, n, t, D, pitch, L }
}

// Single plate: ports are the plate faces (line flanges bolt onto them). Multi-stage: ports are the spool flange faces.
export function ports(p: RestrictionOrificeProps = {}): Port[] {
  const d = dims(p)
  return [port('A', 'Upstream', [-d.L / 2, 0, 0], [-1, 0, 0], d.nps, d.rating), port('B', 'Downstream', [d.L / 2, 0, 0], [1, 0, 0], d.nps, d.rating)]
}

export function RestrictionOrifice({ nps = defaults.nps, rating = defaults.rating, stages = defaults.stages, beta = defaults.beta, flanges = defaults.flanges, tag = defaults.tag, ...group }: RestrictionOrificeProps & GroupProps) {
  const data = useKit((k) => build(k, { nps, rating, stages, beta, flanges, tag }), [nps, rating, stages, beta, flanges, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default RestrictionOrifice

function build(k: Kit, p: RestrictionOrificeProps) {
  const d = dims(p)
  const { nps, rating, t, D } = d
  const f = flangeDims(nps, rating)
  const beta = Math.min(0.75, Math.max(0.05, d.beta))
  if (d.n === 1) {
    // paddle plate: disc inside the bolts with a handle carrying the stamped tag and bore
    const R = (f.boltCircle - boltHole(f.boltDia)) / 2 - 0.002
    drilledPlate(k, 'stainless', 'stainless', [-t / 2, 0, 0], [1, 0, 0], t, (D * beta) / 2, R, null, seg(R * 2), true)
    const hl = Math.max(0.07, f.od / 2 - R + 0.06)
    const hw = Math.max(0.025, Math.min(0.05, D * 0.6))
    k.box('stainless', [t, hl, hw], [0, R + hl / 2 - 0.003, 0])
    const label = `${d.tag} d=${Math.round(D * beta * 1000)}mm`
    for (const s of [-1, 1]) k.plane(tagMaterial(label), hw * 2.6 * 0.3 * 3.2, hw * 0.9, [s * (t / 2 + 0.0004), R + hl - hw * 0.6, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (s * Math.PI) / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)))
    // telltale drain / vent hole at the bottom of the plate (typical for liquid / gas service)
    k.cyl('pipeBore', 0.002, t * 1.02, [0, -(D / 2 - 0.004), 0], 'x', 8)
    if (d.flanges) waferFlanges(k, nps, rating, t, '80', 0.1)
    return
  }
  // multi-stage spool: flanged ends, internal plates with growing bores for the expanding gas
  const neck = Math.max(0.05, D * 0.8)
  const { xa } = inlineEnds(k, nps, rating, d.L, 0, '80')
  const xs = xa + neck
  const ro = pipeOD(nps) / 2
  const ri = D / 2
  const n = seg(ro * 2)
  const x0 = xa
  const x1 = d.L / 2 - flangeLen(nps, rating)
  k.lathe('pipePaint', [[ro, x0], [ro, x1]], [0, 0, 0], 'x', n)
  k.lathe('pipeBore', [[ri, x1], [ri, x0]], [0, 0, 0], 'x', n)
  for (let i = 0; i < d.n; i++) {
    const x = xs + i * d.pitch
    const rb = Math.min(ri * 0.8, (D * beta * (1 + 0.28 * i)) / 2)
    drilledPlate(k, 'stainless', 'stainless', [x - t / 2, 0, 0], [1, 0, 0], t, rb, ri, null, n, true)
    // seal weld bead where each plate meets the bore
    k.torus('flangeSteel', ri - 0.001, 0.0015, [x + t / 2 + 0.001, 0, 0], 'x', 6, n)
    // external weld band marks each plate position
    k.cyl('flangeSteel', ro + 0.0012, 0.008, [x, 0, 0], 'x', n, undefined, true)
  }
  tagPlate(k, `${d.tag} ${d.n}-STAGE`, [0, ro + 0.002, 0], 'y', Math.min(0.12, ro * 1.6))
}
