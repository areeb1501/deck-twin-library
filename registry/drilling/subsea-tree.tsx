// Vertical subsea Xmas tree (API 17D / ISO 13628-4) on a permanent guide base: wellhead connector, valve block with hydraulic actuators, choke module, flowline and annulus hubs, tree cap, ROV panel, SCM.
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, member, pipeRun, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { pipeID, pipeOD } from '../lib/standards'
import { anode, grabBar, hub, mudmat, rovBucket } from './_drill'

export interface SubseaTreeProps {
  /** production bore / flowline hub, inches */
  productionNps?: number
  /** annulus hub, inches */
  annulusNps?: number
  /** retrievable choke module on the production wing */
  choke?: boolean
  tag?: string
}

export const defaults = { productionNps: 5, annulusNps: 2, choke: true, tag: 'XT-S01' }

type P = typeof defaults

// typical 5" x 2" vertical tree on an 18-3/4" wellhead: guide posts on a 6 ft radius, ~5 m tall
const GP = 1.29
const yWH = 1.6
const yC0 = 1.75
const yC1 = 2.75
const yB1 = 4.05

function layout(p: Omit<P, 'tag'>) {
  const yW = 3.45
  const xHub = 2.0
  const yHubP = 2.1
  return {
    yW,
    prod: [xHub + 0.4, yHubP, 0] as V3,
    ann: [-xHub - 0.25, 3.2, 0] as V3,
    xHub,
    yHubP,
    boreP: pipeID(p.productionNps, '160') / 2,
    boreA: pipeID(p.annulusNps, '160') / 2,
  }
}

export function ports(props: SubseaTreeProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [port('production', 'Production flowline hub', l.prod, [1, 0, 0], p.productionNps), port('annulus', 'Annulus hub', l.ann, [-1, 0, 0], p.annulusNps, undefined, 'utility')]
}

export function SubseaTree({ productionNps = defaults.productionNps, annulusNps = defaults.annulusNps, choke = defaults.choke, tag = defaults.tag, ...group }: SubseaTreeProps & GroupProps) {
  const data = useKit((k) => build(k, { productionNps, annulusNps, choke, tag }), [productionNps, annulusNps, choke, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default SubseaTree

/** Fail-safe-close hydraulic gate valve actuator from base along `axis`: bonnet, spring cylinder, cap, ROV override bucket. */
function actuator(k: Kit, base: V3, axis: 'x' | '-x' | 'z' | '-z', r: number, len: number, mat: MatKey, override = true) {
  k.at(base, axis, () => {
    k.cyl('valveBody', r * 0.7, 0.12, [0, 0.06, 0], 'y', 24)
    k.cyl('valveBody', r * 0.95, 0.04, [0, 0.14, 0], 'y', 28)
    k.cyl(mat, r, len, [0, 0.16 + len / 2, 0], 'y', 32)
    k.cyl(mat, r * 1.06, 0.04, [0, 0.16 + len, 0], 'y', 32)
    k.cyl('nameplate', r * 1.003, 0.05, [0, 0.16 + len * 0.6, 0], 'y', 32)
    k.cyl('stainless', 0.025, 0.08, [0, 0.2 + len + 0.04, 0], 'y', 10)
    k.cyl('safetyGreen', 0.03, 0.03, [0, 0.2 + len + 0.03, 0], 'y', 12)
  })
  if (override) {
    const v = axis === 'x' ? [1, 0, 0] : axis === '-x' ? [-1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 0, -1]
    rovBucket(k, [base[0] + v[0] * (0.3 + len), base[1], base[2] + v[2] * (0.3 + len)], axis, mat)
  }
}

function build(k: Kit, p: P) {
  const l = layout(p)
  const { yW, xHub, yHubP, boreP, boreA } = l
  const Y: MatKey = paint('#e3b512', { weather: 1 })
  const B: MatKey = paint('#c7cbcd', { weather: 0.8 })
  const A: MatKey = paint('#e3b512', { weather: 0.6 })

  // permanent guide base on a mudmat, guide posts, conductor and wellhead housings
  const t = mudmat(k, 4.8, 4.8, { mat: Y, skirt: 0.35 })
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      member(k, [sx * GP, t, sz * GP], [sx * GP, 3.6, sz * GP], 'CHS 219.1x10', Y)
      k.dome(Y, 0.11, [sx * GP, 3.6, sz * GP], 'y', Math.PI / 2, 1.6, 16)
      member(k, [sx * GP, t + 0.4, sz * GP], [0, t + 0.4, sz * 0.5], 'HEA 200', Y)
    }
  k.lathe(Y, [[0.46, t], [1.0, t], [1.0, t + 0.6], [0.5, t + 0.6]], [0, 0, 0], 'y', 48)
  k.lathe('flangeSteel', [[0.4, t], [0.457, t], [0.457, yWH], [0.4, yWH]], [0, 0, 0], 'y', 48)
  k.lathe('flangeSteel', [[0.3, yWH - 0.05], [0.42, yWH - 0.05], [0.42, yC0 + 0.1], [0.3, yC0 + 0.1]], [0, 0, 0], 'y', 48)

  // wellhead connector: hydraulic collet body, lock-indicator rods, unlock / lock lines
  k.lathe(B, [[0.35, yC0], [0.62, yC0], [0.66, yC0 + 0.1], [0.66, yC1 - 0.15], [0.55, yC1 - 0.05], [0.45, yC1]], [0, 0, 0], 'y', 56)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    k.rod('stainless', [Math.cos(a) * 0.67, yC0 + 0.4, Math.sin(a) * 0.67], [Math.cos(a) * 0.67, yC1 + 0.05, Math.sin(a) * 0.67], 0.018, 8)
  }

  // tree body (master valve block) with production bore up the middle
  const bw = 0.95
  k.rbox(B, [bw, yB1 - yC1, bw], 0.04, [0, (yC1 + yB1) / 2, 0])
  // production master (PMV) and production swab (PSV) actuators along +Z / -Z, annulus master (AMV) along -Z
  actuator(k, [0, 3.05, bw / 2], 'z', 0.2, 0.5, A, false)
  actuator(k, [0, 3.75, -bw / 2], '-z', 0.17, 0.45, A)
  actuator(k, [-0.22, 3.05, -bw / 2], '-z', 0.15, 0.4, A, false)

  // production wing: wing block, PWV actuator, crossover valve, then the choke module and the flowline hub
  const xw = bw / 2
  k.rbox(B, [0.55, 0.5, 0.5], 0.03, [xw + 0.27, yW, 0])
  actuator(k, [xw + 0.27, yW, 0.25], 'z', 0.17, 0.45, A)
  const prodOD = pipeOD(p.productionNps) * 1.3
  if (p.choke) {
    const xc = xw + 0.95
    k.pipe(B, [xw + 0.54, yW, 0], [xc - 0.3, yW, 0], prodOD, prodOD * 0.2)
    // choke module: body, insert clamp, stepping actuator, ROV handle and bucket
    k.rbox(B, [0.6, 0.6, 0.6], 0.04, [xc, yW, 0])
    k.cyl(B, 0.32, 0.12, [xc, yW + 0.36, 0], 'y', 32)
    k.lathe('actuatorYellow', [[0.34, yW + 0.36], [0.4, yW + 0.36], [0.4, yW + 0.5], [0.34, yW + 0.5]], [xc, 0, 0], 'y', 32)
    k.cyl(A, 0.24, 0.5, [xc, yW + 0.75, 0], 'y', 32)
    k.cyl(A, 0.26, 0.05, [xc, yW + 1.02, 0], 'y', 32)
    k.rod(Y, [xc - 0.25, yW + 1.12, 0], [xc + 0.25, yW + 1.12, 0], 0.025, 10)
    for (const s of [-1, 1]) k.rod(Y, [xc + s * 0.25, yW + 1.12, 0], [xc + s * 0.25, yW + 1.04, 0], 0.02, 8)
    rovBucket(k, [xc, yW + 0.75, 0.25], 'z', A)
    pipeRun(k, [[xc, yW - 0.3, 0], [xc, yHubP, 0], [xHub, yHubP, 0]], p.productionNps, { mat: B, schedule: '160' })
  } else {
    pipeRun(k, [[xw + 0.54, yW, 0], [xw + 1.1, yW, 0], [xw + 1.1, yHubP, 0], [xHub, yHubP, 0]], p.productionNps, { mat: B, schedule: '160' })
  }
  hub(k, [xHub, yHubP, 0], 'x', boreP, 0.4, B)
  k.box(Y, [0.3, yHubP - 0.2 - t, 0.5], [xHub - 0.15, (yHubP - 0.2 + t) / 2, 0])

  // annulus wing to the annulus hub (-X)
  pipeRun(k, [[-bw / 2, 3.2, 0], [-l.xHub, 3.2, 0]], p.annulusNps, { mat: B, schedule: '160' })
  k.rbox(B, [0.4, 0.4, 0.4], 0.03, [-bw / 2 - 0.3, 3.2, 0])
  actuator(k, [-bw / 2 - 0.3, 3.2, -0.2], '-z', 0.13, 0.35, A, false)
  hub(k, [-l.xHub, 3.2, 0], '-x', boreA, 0.25, B)
  member(k, [-l.xHub + 0.12, t, 0], [-l.xHub + 0.12, 3.2 - 0.13, 0], 'CHS 114.3x6.3', Y)
  k.box(Y, [0.2, 0.03, 0.26], [-l.xHub + 0.12, 3.2 - 0.12, 0])
  member(k, [-l.xHub + 0.12, 2.4, 0], [-GP, 2.4, -GP], 'CHS 88.9x6.3', Y)

  // tree cap with ROV T-handle and lift eye
  k.lathe(Y, [[0, yB1], [0.42, yB1], [0.42, yB1 + 0.35], [0.36, yB1 + 0.45], [0, yB1 + 0.45]], [0, 0, 0], 'y', 40)
  k.rod(Y, [0, yB1 + 0.45, 0], [0, yB1 + 0.75, 0], 0.04, 10)
  k.rod(Y, [-0.22, yB1 + 0.75, 0], [0.22, yB1 + 0.75, 0], 0.03, 10)
  k.torus('nut', 0.06, 0.015, [0, yB1 + 0.85, 0], 'z', 6, 16)

  // tree frame: guide funnels on the posts, columns, top ring beams, struts to the connector
  const yT = 4.75
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = sx * GP
      const z = sz * GP
      k.lathe(Y, [[0.13, 1.9], [0.15, 1.9], [0.38, 1.4], [0.36, 1.4], [0.13, 1.9]], [x, 0, z], 'y', 28)
      k.lathe(Y, [[0.125, 1.9], [0.16, 1.9], [0.16, 3.9], [0.125, 3.9]], [x, 0, z], 'y', 28)
      member(k, [x, 3.9, z], [x, yT, z], 'CHS 219.1x10', Y)
      member(k, [x, 2.4, z], [sx * 0.47, 2.4, sz * 0.47], 'CHS 114.3x6.3', Y)
    }
  for (const s of [-1, 1]) {
    member(k, [-GP, yT, s * GP], [GP, yT, s * GP], 'CHS 168.3x8', Y)
    member(k, [s * GP, yT, -GP], [s * GP, yT, GP], 'CHS 168.3x8', Y)
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) member(k, [sx * GP, yT, sz * GP], [sx * 0.45, yB1 - 0.2, sz * 0.45], 'CHS 114.3x6.3', Y)

  // ROV panel on the +Z face: buckets for the manual overrides, hot-stab receptacles, gauges
  const zp = GP + 0.02
  k.box(Y, [2 * GP, 1.3, 0.03], [0, 3.2, zp])
  for (const x of [-0.8, -0.4, 0.2]) {
    rovBucket(k, [x, 3.5, zp + 0.015], 'z', A)
    k.box('nut', [0.18, 0.05, 0.003], [x, 3.25, zp + 0.017])
  }
  for (const x of [0.6, 0.75]) {
    k.cyl('stainless', 0.05, 0.12, [x, 3.45, zp + 0.06], 'z', 16)
    k.cyl('actuatorRed', 0.055, 0.03, [x, 3.45, zp + 0.13], 'z', 16)
  }
  gauge(k, [0.68, 2.85, zp + 0.06], 'z', 0.14, 'bar', 700)
  gauge(k, [-0.4, 2.85, zp + 0.06], 'z', 0.14, 'bar', 700)

  // subsea control module on its mounting base (-Z side), hydraulic jumpers to the actuators
  const zs = -GP + 0.35
  const xS = 0.65
  member(k, [-GP, 2.2, -GP], [GP, 2.2, -GP], 'HEA 200', Y)
  k.box(Y, [1.0, 0.1, 0.7], [xS, 2.35, zs])
  k.rbox(A, [0.8, 1.0, 0.55], 0.05, [xS, 2.9, zs])
  k.rod(Y, [xS - 0.25, 3.4, zs], [xS + 0.25, 3.4, zs], 0.03, 10)
  for (const s of [-1, 1]) k.rod(Y, [xS + s * 0.25, 3.4, zs], [xS + s * 0.25, 3.5, zs], 0.025, 8)
  k.box('nameplate', [0.3, 0.15, 0.003], [xS, 3.0, zs - 0.277])
  const tubes: V3[] = [[0, 3.05, bw / 2 + 0.08], [0, 3.75, -bw / 2 - 0.08], [-0.22, 3.05, -bw / 2 - 0.08], [xw + 0.27, yW, 0.33]]
  tubes.forEach((e, i) => k.tube('tubing', [[xS + (i - 1.5) * 0.08, 3.4, zs + 0.2], [xS + (i - 1.5) * 0.08, 3.6 + i * 0.03, zs + 0.2], [e[0], 3.6 + i * 0.03, zs + 0.2], [e[0], 3.6 + i * 0.03, e[2]], e], 0.008, 6, 0.06))

  for (const sx of [-1, 1]) grabBar(k, [sx * (GP + 0.1), 4.2, -0.7], [sx * (GP + 0.1), 4.2, 0.7], [sx, 0, 0])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) anode(k, [sx * (GP + 0.2), 2.8, sz * GP], 'y', 0.5)
  k.box(Y, [1.0, 0.36, 0.02], [0, 4.35, zp])
  tagPlate(k, p.tag, [0, 4.35, zp + 0.012], 'z', 0.9)
}
