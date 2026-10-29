// Vertical-cylindrical fired heater: radiant section on legs with floor burners and sight doors, breeching, convection section with header boxes, crossovers, stack with damper, platforms and ladders. API 560.
import * as THREE from 'three'
import { Kit, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { paint } from '../lib/materials'
import { flange, ladder, member, pipeRun, ringPlatform, tagPlate, weldBead } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, type Rating } from '../lib/standards'
import { basePlate } from './_lattice'
import { clamp, openNozzle } from './_thermal'

export interface FiredHeaterProps {
  /** radiant casing diameter, m */
  diameter?: number
  /** radiant section height (floor to roof), m */
  radiantHeight?: number
  /** stack height above the convection section, m */
  stackHeight?: number
  burners?: number
  passes?: 1 | 2 | 4
  nps?: number
  rating?: Rating
  tag?: string
}

export const defaults = {
  diameter: 4.5,
  radiantHeight: 9,
  stackHeight: 14,
  burners: 6,
  passes: 2 as 1 | 2 | 4,
  nps: 6,
  rating: 600 as Rating,
  tag: 'H-100',
}

type P = typeof defaults

const Y_FLOOR = 2.4 // typical burner access headroom under the floor

function dims(p: P) {
  const R = p.diameter / 2
  const yR1 = Y_FLOOR + p.radiantHeight
  const Wc = 0.8 * p.diameter
  const Dc = clamp(0.45 * p.diameter, 1.4, 3)
  const hb = 0.45 // header box depth
  const yC0 = yR1 + 0.6 // breeching
  const Hc = clamp(0.35 * p.radiantHeight, 2.5, 5)
  const yC1 = yC0 + Hc
  const Ds = clamp(0.32 * p.diameter, 0.9, 2.6)
  const yS0 = yC1 + 1.2 // transition hood
  const yS1 = yS0 + p.stackHeight
  const so = nozzleStandout(p.nps, p.rating)
  const yOut = Y_FLOOR + 0.9
  const yFuel = Y_FLOOR - 1.35
  return { R, yR1, Wc, Dc, hb, yC0, Hc, yC1, Ds, yS0, yS1, so, yOut, yFuel }
}

export function ports(props: FiredHeaterProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [
    port('inlet', 'Process inlet (convection)', [-(d.Wc / 2 + d.hb / 2), d.yC1 + d.so, 0], [0, 1, 0], p.nps, p.rating),
    port('outlet', 'Process outlet (radiant)', [-d.R - d.so, d.yOut, 0], [-1, 0, 0], p.nps, p.rating),
    port('fuel', 'Fuel gas', [0, d.yFuel, -(d.R + 0.6)], [0, 0, -1], 2, 300, 'utility'),
  ]
}

export function FiredHeater(props: FiredHeaterProps & GroupProps) {
  const { diameter, radiantHeight, stackHeight, burners, passes, nps, rating, tag, ...group } = { ...defaults, ...props }
  const p = { diameter, radiantHeight, stackHeight, burners, passes, nps, rating, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default FiredHeater

// Four-sided frustum between two axis-aligned rectangles (half sizes), flat shaded.
function frustum(k: Kit, mat: THREE.Material | 'structSteel', y0: number, ax: number, az: number, y1: number, bx: number, bz: number) {
  const c0 = [[-ax, -az], [ax, -az], [ax, az], [-ax, az]]
  const c1 = [[-bx, -bz], [bx, -bz], [bx, bz], [-bx, bz]]
  const pos: number[] = []
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    const q = [[c0[i][0], y0, c0[i][1]], [c0[j][0], y0, c0[j][1]], [c1[j][0], y1, c1[j][1]], [c1[i][0], y1, c1[i][1]]]
    for (const t of [0, 2, 1, 0, 3, 2]) pos.push(...q[t])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  k.add(mat, g)
}

// Ring platform split into arcs around ladder gaps (angles, radians, 0 = +X, π/2 = -Z).
function ringGaps(k: Kit, y: number, rIn: number, w: number, gaps: number[], a0 = 0, a1 = Math.PI * 2, gw = 0.32) {
  const cuts = [a0, ...gaps.flatMap((g) => [g - gw, g + gw]), a1].sort((a, b) => a - b)
  for (let i = 0; i < cuts.length; i += 2) if (cuts[i + 1] - cuts[i] > 0.05) ringPlatform(k, y, rIn, w, cuts[i], cuts[i + 1])
}

function build(k: Kit, p: P) {
  const d = dims(p)
  const { R, yR1, Wc, Dc, hb, yC0, yC1, Ds, yS0, yS1 } = d
  const casing = paint('#8d9498', { metalness: 0.45, roughness: 0.55, clearcoat: 0, weather: 1.2 }) // heat-resistant aluminium-grey
  const steel = 'structSteel' as const
  const at = (r: number, a: number, y: number): V3 => [Math.cos(a) * r, y, -Math.sin(a) * r]

  // legs, floor beams, bracing
  const nl = p.diameter > 5 ? 10 : 8
  for (let i = 0; i < nl; i++) {
    const a = ((i + 0.5) / nl) * Math.PI * 2
    const c = at(R - 0.12, a, 0)
    member(k, [c[0], 0.03, c[2]], [c[0], Y_FLOOR - 0.3, c[2]], 'HEB 260', steel, [Math.cos(a), 0, -Math.sin(a)])
    basePlate(k, c[0], c[2], 0.5, steel)
    member(k, at(R - 0.12, a, Y_FLOOR - 0.15), at(0.4, a, Y_FLOOR - 0.15), 'HEB 300', steel, [0, 1, 0])
    if (i % 2 === 0) {
      const b = ((i + 1.5) / nl) * Math.PI * 2
      k.rod(steel, at(R - 0.12, a, 0.3), at(R - 0.12, b, Y_FLOOR - 0.4), 0.04, 8)
      k.rod(steel, at(R - 0.12, b, 0.3), at(R - 0.12, a, Y_FLOOR - 0.4), 0.04, 8)
    }
    // buckstays up the radiant casing
    member(k, at(R + 0.08, a, Y_FLOOR), at(R + 0.08, a, yR1), 'UPN 200', casing, [Math.cos(a), 0, -Math.sin(a)])
  }
  k.cyl(steel, 0.45, 0.3, [0, Y_FLOOR - 0.15, 0], 'y', 24)
  // radiant section: floor, casing with stiffener rings, roof
  k.cyl(casing, R + 0.02, 0.3, [0, Y_FLOOR + 0.15, 0], 'y', 64)
  k.lathe(casing, [[R, Y_FLOOR + 0.3], [R, yR1]], [0, 0, 0], 'y', 64)
  for (let y = Y_FLOOR + 1.5; y < yR1 - 0.3; y += 1.5) k.cyl(casing, R + 0.03, 0.12, [0, y, 0], 'y', 64)
  k.cyl(casing, R + 0.06, 0.2, [0, yR1, 0], 'y', 64)
  // breeching, convection box, header boxes with bolted covers
  frustum(k, casing, yR1 + 0.1, Wc / 2 - 0.1, Dc / 2 - 0.1, yC0, Wc / 2, Dc / 2)
  k.box(casing, [Wc, d.Hc, Dc], [0, (yC0 + yC1) / 2, 0])
  for (let x = -Wc / 2 + 0.6; x < Wc / 2 - 0.2; x += 0.6) for (const s of [-1, 1]) k.box(steel, [0.08, d.Hc, 0.08], [x, (yC0 + yC1) / 2, s * (Dc / 2 + 0.04)])
  for (const s of [-1, 1]) {
    const xh = s * (Wc / 2 + hb / 2)
    k.box(casing, [hb, d.Hc - 0.1, Dc - 0.1], [xh, (yC0 + yC1) / 2, 0])
    const panels = Math.max(2, Math.round(d.Hc / 1.2))
    for (let i = 0; i < panels; i++) {
      const ph = (d.Hc - 0.3) / panels
      const y = yC0 + 0.15 + (i + 0.5) * ph
      k.box(casing, [0.02, ph - 0.05, Dc - 0.25], [s * (Wc / 2 + hb + 0.01), y, 0])
      for (const dz of [-1, 1]) for (const dy of [-1, 0, 1]) k.hex('nut', 0.04, 0.025, [s * (Wc / 2 + hb + 0.025), y + (dy * (ph - 0.15)) / 2, (dz * (Dc - 0.35)) / 2], 'x')
      k.box('handwheel', [0.03, 0.02, 0.25], [s * (Wc / 2 + hb + 0.05), y, 0])
    }
  }
  // transition hood, damper, stack (open, refractory-lined bore)
  frustum(k, casing, yC1, Wc / 2, Dc / 2, yS0, Ds / 2 + 0.05, Ds / 2 + 0.05)
  k.box(casing, [Ds + 0.16, 0.5, Ds + 0.16], [0, yS0 + 0.25, 0])
  k.cyl('castIron', 0.04, Ds + 0.5, [0, yS0 + 0.25, 0], 'z', 10)
  k.box('actuatorBlue', [0.3, 0.3, 0.2], [0, yS0 + 0.25, Ds / 2 + 0.38])
  k.box(steel, [0.5, 0.04, 0.04], [0.2, yS0 + 0.25, Ds / 2 + 0.26])
  k.pipe(casing, [0, yS0 + 0.5, 0], [0, yS1, 0], Ds, 0.09, 48)
  k.torus(casing, Ds / 2 + 0.02, 0.03, [0, yS1 - 0.02, 0], 'y', 6, 48)
  for (let y = yS0 + 3; y < yS1 - 1; y += 3) k.cyl(casing, Ds / 2 + 0.025, 0.08, [0, y, 0], 'y', 48)
  // sight doors and access door
  const yP1 = Y_FLOOR + Math.min(3.5, p.radiantHeight * 0.4)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    for (const y of [yP1 + 1.1, yR1 - 1.2]) {
      const c = at(R + 0.04, a, y)
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
      k.box('castIron', [0.08, 0.22, 0.28], c, q)
      k.box('castIron', [0.04, 0.17, 0.2], at(R + 0.1, a, y), q)
      k.cyl('brass', 0.015, 0.06, at(R + 0.12, a, y + 0.06), 'y', 8)
    }
  }
  {
    const a = Math.PI * 1.25
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    k.box('castIron', [0.1, 0.9, 0.7], at(R + 0.05, a, yP1 + 0.6), q)
    for (const dy of [-0.3, 0.3]) k.box(steel, [0.06, 0.08, 0.1], at(R + 0.12, a + 0.17, yP1 + 0.6 + dy), q)
  }
  // floor burners: windbox, air register, fuel gas ring with riser and isolation valve
  const nb = Math.max(1, Math.round(p.burners))
  const Rb = nb === 1 ? 0 : R * 0.5
  const ringY = d.yFuel
  k.torus('pipePaint', Math.max(Rb, 0.3), pipeOD(2) / 2, [0, ringY, 0], 'y', 10, 48)
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2
    const c = at(Rb, a, 0)
    k.cyl('castIron', 0.3, 0.55, [c[0], Y_FLOOR - 0.28, c[2]], 'y', 24)
    k.cyl(casing, 0.33, 0.2, [c[0], Y_FLOOR - 0.65, c[2]], 'y', 24)
    for (let j = 0; j < 8; j++) {
      const b = (j / 8) * Math.PI * 2
      k.box('castIron', [0.02, 0.18, 0.12], [c[0] + Math.cos(b) * 0.34, Y_FLOOR - 0.65, c[2] + Math.sin(b) * 0.34], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -b + 0.4))
    }
    k.cyl('castIron', 0.12, 0.25, [c[0], Y_FLOOR - 0.87, c[2]], 'y', 16)
    const rr = Math.max(Rb, 0.3)
    const g = at(rr, a + 0.25, ringY)
    k.tube('pipePaint', [g, [g[0], Y_FLOOR - 0.95, g[2]], [c[0], Y_FLOOR - 0.95, c[2]]], 0.021, 8, 0.08)
    k.handwheel('handwheel', 0.12, [g[0], ringY + 0.25, g[2]], 'y')
    k.box('valveBody', [0.09, 0.1, 0.09], [g[0], ringY + 0.15, g[2]])
  }
  // fuel gas feed to the ring (utility port on -Z)
  {
    const rr = Math.max(Rb, 0.3)
    const zf = -(R + 0.6)
    const fd = flange(k, 2, 300, [0, ringY, zf], [0, 0, -1], true)
    pipeRun(k, [[0, ringY, zf + fd], [0, ringY, -rr - pipeOD(2) * 0.45]], 2)
    k.disc('pipeBore', pipeOD(2) / 2 - 0.004, [0, ringY, -rr - pipeOD(2) * 0.45 + 0.002], '-z', 16)
  }
  // process outlet (radiant) on -X and convection inlet on top of the -X header box
  openNozzle(k, { base: [-R, d.yOut, 0], dir: [-1, 0, 0], nps: p.nps, rating: p.rating, standout: d.so, pad: pipeOD(p.nps) * 1.8, mat: casing, shellR: R })
  openNozzle(k, { base: [-(Wc / 2 + hb / 2), yC1, 0], dir: [0, 1, 0], nps: p.nps, rating: p.rating, standout: d.so, mat: casing })
  // crossovers: +X header box down the outside into the top of the radiant casing
  const np = p.passes
  for (let i = 0; i < np; i++) {
    const z = (i - (np - 1) / 2) * Math.min(0.55, (Dc - 0.4) / Math.max(1, np - 1))
    const xo = Wc / 2 + hb
    const xr = Math.sqrt(R * R - z * z)
    const yc = yC0 + 0.4
    pipeRun(k, [[xo - 0.05, yc, z], [R + 0.35, yc, z], [R + 0.35, yR1 - 0.7, z], [xr - 0.05, yR1 - 0.7, z]], p.nps, { mat: 'pipePaint' })
    weldBead(k, p.nps, [xo + 0.01, yc, z], [1, 0, 0])
  }
  // platforms: mid radiant (sight doors), roof, stack damper; ladders between them
  const w = 0.9
  const rIn = R + 0.15
  const aL1 = -Math.PI / 2 // grade → P1, on +Z
  const aL2 = Math.PI / 2 // P1 → roof, on -Z
  ringGaps(k, yP1, rIn, w, [aL1, aL2])
  ringGaps(k, yR1 + 0.1, rIn - 0.08, w + 0.08, [aL2], 0.55, Math.PI * 2 - 0.55)
  const rOut = rIn + w
  ladder(k, at(rOut + 0.15, aL1, 0), yP1, [0, 0, 1])
  ladder(k, at(rOut + 0.15, aL2, yP1), yR1 + 0.1, [0, 0, -1])
  const yP3 = yS0 + 1.1
  const r3 = Ds / 2 + 0.06
  const w3 = Math.max(0.9, Dc / 2 + 0.6 - r3)
  ringGaps(k, yP3, r3, w3, [-Math.PI / 2])
  ladder(k, [0, yR1 + 0.12, r3 + w3 + 0.15], yP3, [0, 0, 1])
  // snuffing steam ring with injection stubs into the firebox (insulated steam line)
  {
    const ys = Y_FLOOR + 0.55
    k.torus('insulation', R + 0.35, 0.045, [0, ys, 0], 'y', 8, 64)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      k.rod('insulation', at(R + 0.35, a, ys), at(R - 0.02, a, ys), 0.035, 10)
      k.box('valveBody', [0.08, 0.08, 0.08], at(R + 0.2, a, ys))
      k.handwheel('handwheel', 0.12, at(R + 0.2, a, ys + 0.12), 'y')
    }
    for (const a of [Math.PI * 0.15, -Math.PI * 0.15]) k.rod('insulation', at(R + 0.35, a, ys), at(R + 0.35, a, 0.05), 0.045, 10)
  }
  // explosion doors (hinged relief flaps) low on the radiant casing
  for (const a of [Math.PI * 0.62, Math.PI * 1.62]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
    k.box('castIron', [0.06, 0.7, 0.7], at(R + 0.03, a, Y_FLOOR + 1.0), q)
    k.box('safetyYellow', [0.02, 0.6, 0.6], at(R + 0.07, a, Y_FLOOR + 1.0), q)
    k.rod(steel, at(R + 0.08, a - 0.12, Y_FLOOR + 1.36), at(R + 0.08, a + 0.12, Y_FLOOR + 1.36), 0.02, 8)
  }
  // rotary sootblowers on the convection side walls, draft gauge tappings
  for (const sz of [-1, 1])
    for (const [i, fx] of [-0.25, 0.25].entries()) {
      const y = yC0 + d.Hc * (0.3 + 0.4 * i)
      const z = sz * (Dc / 2 + 0.08)
      k.box('castIron', [0.3, 0.3, 0.16], [fx * Wc, y, z])
      k.cyl('pipePaint', 0.05, 0.35, [fx * Wc, y, z + sz * 0.25], sz > 0 ? 'z' : '-z', 12)
      k.cyl('motorPaint', 0.11, 0.28, [fx * Wc, y, z + sz * 0.55], sz > 0 ? 'z' : '-z', 16)
      k.box('motorPaint', [0.16, 0.12, 0.12], [fx * Wc, y + 0.15, z + sz * 0.55])
    }
  for (const [y, r] of [[yR1 - 0.4, R], [yC1 - 0.3, Dc / 2]] as const) {
    k.pipe('stainless', [0, y, -r + 0.01], [0, y, -r - 0.14], 0.034, 0.004)
    k.cyl('stainless', 0.03, 0.06, [0, y, -r - 0.17], 'z', 10)
  }
  // burner management system panel at grade, cabled to the burners
  {
    const xb = R + 2.2
    const zb = -1.2
    k.box('galvanised', [0.08, 1.3, 0.08], [xb - 0.3, 0.65, zb])
    k.box('galvanised', [0.08, 1.3, 0.08], [xb + 0.3, 0.65, zb])
    k.box('galvanised', [0.8, 0.02, 0.4], [xb, 0.01, zb])
    k.rbox(paint('#c9ccc8'), [0.8, 1.0, 0.3], 0.02, [xb, 1.65, zb])
    k.box('glass', [0.25, 0.18, 0.01], [xb - 0.15, 1.85, zb + 0.155])
    for (let i = 0; i < 4; i++) k.cyl(i < 2 ? 'safetyGreen' : 'actuatorRed', 0.025, 0.02, [xb + 0.1 + (i % 2) * 0.12, 1.75 - Math.floor(i / 2) * 0.12, zb + 0.16], 'z', 12)
    k.box('nameplate', [0.3, 0.06, 0.004], [xb, 2.05, zb + 0.152])
    k.spline('cable', [[xb, 1.15, zb], [xb - 0.5, 0.15, zb + 0.3], [R * 0.6, 0.15, 0], [R * 0.5, Y_FLOOR - 1.0, 0]], 0.025, 8, 24)
  }
  // sampling port and tag
  openNozzle(k, { base: [Ds / 2, yP3 + 1.0, 0], dir: [1, 0, 0], nps: 3, rating: 150, standout: 0.2, mat: casing, blind: true })
  tagPlate(k, p.tag, at(R + 0.03, -Math.PI / 2 + 0.3, yP1 + 1.5), [Math.cos(-Math.PI / 2 + 0.3), 0, -Math.sin(-Math.PI / 2 + 0.3)], 0.4)
}
