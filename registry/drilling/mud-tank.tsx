// Active mud pit: skid-mounted open-top steel tank with compartments, top-entry agitators, mud guns, grating, handrails and ladder (ISO 14122, API RP 13C practice).
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { flange, grating, handrail, ladder, liftingLug, member, motor, motorSize, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { Rotors, type RotorSpec } from '../lib/rotors'
import { pipeOD, pipeWall } from '../lib/standards'

export interface MudTankProps {
  length?: number
  width?: number
  /** wall height, m */
  height?: number
  compartments?: number
  /** agitator motor, kW */
  agitatorKw?: number
  /** mud level, fraction of wall height */
  level?: number
  suctionNps?: number
  returnNps?: number
  color?: string
  tag?: string
  /** turn the agitators */
  running?: boolean
}

export const defaults = {
  length: 9,
  width: 3,
  height: 2.4,
  compartments: 2,
  agitatorKw: 15,
  level: 0.62,
  suctionNps: 10,
  returnNps: 8,
  color: '#a8402e',
  tag: 'T-3201',
  running: true,
}

type P = typeof defaults

function layout(p: Omit<P, 'tag' | 'running' | 'color' | 'level' | 'agitatorKw'>) {
  const L = Math.max(4, p.length)
  const W = Math.max(2, p.width)
  const H = Math.max(1.5, p.height)
  const n = Math.max(1, Math.min(4, Math.round(p.compartments)))
  const yF = 0.3
  const yT = yF + H
  const ns = 0.2
  return {
    L, W, H, n, yF, yT,
    suction: [-L / 2 - ns, yF + 0.4, -W / 2 + 0.7] as V3,
    ret: [L / 2 + ns, yT - 0.4, W / 2 - 0.7] as V3,
    equal: [L / 2 + ns, yF + 0.4, -W / 2 + 0.7] as V3,
    gun: [L / 2 + 0.35, yT + 0.3, W / 2 - 0.3] as V3,
    xs: Array.from({ length: n }, (_, i) => -L / 2 + (L * (i + 0.5)) / n),
  }
}

export function ports(props: MudTankProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const l = layout(p)
  return [
    port('suction', 'Pump suction', l.suction, [-1, 0, 0], p.suctionNps, 150),
    port('return', 'Mud return', l.ret, [1, 0, 0], p.returnNps, 150),
    port('equalise', 'Equalising line', l.equal, [1, 0, 0], p.suctionNps, 150, 'utility'),
    port('mud-gun', 'Mud gun supply', l.gun, [1, 0, 0], 3, 150, 'utility'),
  ]
}

export function MudTank({ tag = defaults.tag, ...rest }: MudTankProps & GroupProps) {
  const { length, width, height, compartments, agitatorKw, level, suctionNps, returnNps, color, running, ...group } = { ...defaults, ...rest }
  const out = useMemo(
    () => build({ length, width, height, compartments, agitatorKw, level, suctionNps, returnNps, color, tag, running }),
    [length, width, height, compartments, agitatorKw, level, suctionNps, returnNps, color, tag],
  )
  useEffect(() => () => [out.built, ...out.rotors.map((r) => r.built)].forEach((b) => b.geometry.dispose()), [out])
  return (
    <group {...group}>
      <KitMesh data={out.built} />
      <Rotors rotors={out.rotors} running={running} />
    </group>
  )
}

export default MudTank

function build(p: P) {
  const k = new Kit()
  const l = layout(p)
  const { L, W, H, n, yF, yT, xs } = l
  const C: MatKey = paint(p.color)
  const t = 0.008
  const rotors: RotorSpec[] = []

  // skid runners and cross members, floor
  for (const s of [-1, 1]) {
    member(k, [-L / 2, 0.15, s * (W / 2 - 0.15)], [L / 2, 0.15, s * (W / 2 - 0.15)], 'HEB 300', 'structSteelDark')
    k.box('structSteelDark', [0.3, 0.3, 0.02], [s * (L / 2 + 0.01), 0.15, 0])
  }
  for (let i = 0; i <= Math.round(L / 1.2); i++) member(k, [-L / 2 + 0.15 + ((L - 0.3) * i) / Math.round(L / 1.2), 0.15, -W / 2 + 0.3], [-L / 2 + 0.15 + ((L - 0.3) * i) / Math.round(L / 1.2), 0.15, W / 2 - 0.3], 'IPE 300', 'structSteelDark')
  k.box(C, [L, t, W], [0, yF + t / 2, 0])

  // walls with external stiffeners and a top rim angle
  for (const s of [-1, 1]) {
    k.box(C, [L, H, t], [0, yF + H / 2, s * (W / 2 - t / 2)])
    k.box(C, [t, H, W], [s * (L / 2 - t / 2), yF + H / 2, 0])
    const nx = Math.round(L / 0.8)
    for (let i = 1; i < nx; i++) member(k, [-L / 2 + (L * i) / nx, yF, s * (W / 2 + 0.04)], [-L / 2 + (L * i) / nx, yT - 0.06, s * (W / 2 + 0.04)], 'UPN 80', C, [0, 0, s])
    for (const y of [yF + H * 0.45]) k.box(C, [L, 0.08, 0.05], [0, y, s * (W / 2 + 0.03)])
    k.box(C, [L + 0.1, 0.06, 0.06], [0, yT - 0.03, s * (W / 2 + 0.03)])
    k.box(C, [0.06, 0.06, W + 0.1], [s * (L / 2 + 0.03), yT - 0.03, 0])
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (L / 2 - 0.3), yT, sz * (W / 2 - 0.05)], 'x', 1.6, C)

  // compartment bulkheads, each with an equalising valve worked from the top by an extension stem
  for (let i = 1; i < n; i++) {
    const x = -L / 2 + (L * i) / n
    k.box(C, [t, H, W - 2 * t], [x, yF + H / 2, 0])
    k.cyl('valveBody', 0.18, 0.2, [x, yF + 0.4, -W / 2 + 0.7], 'x', 24)
    k.rod('stainless', [x + 0.05, yF + 0.55, -W / 2 + 0.7], [x + 0.05, yT + 0.9, -W / 2 + 0.7], 0.02, 10)
    k.handwheel('actuatorRed', 0.4, [x + 0.05, yT + 0.9, -W / 2 + 0.7], 'y', 4)
    k.box('structSteelDark', [0.12, 0.6, 0.12], [x + 0.05, yT + 0.3, -W / 2 + 0.7])
  }

  // mud surface (translucent so the agitator impellers read through the open hatches)
  const yl = yF + H * Math.max(0.1, Math.min(0.95, p.level))
  k.box(paint('#6a4f33', { metalness: 0, roughness: 0.18, transparent: true, opacity: 0.72, weather: 0 }), [L - 2 * t - 0.01, 0.004, W - 2 * t - 0.01], [0, yl, 0])

  // top-entry agitators: bridge beams, right-angle helical-bevel gearbox, motor, shaft, canted 4-blade impeller
  const m = motorSize(p.agitatorKw, 4)
  const D = Math.min(1.2, W * 0.38)
  const hatch = Math.max(0.4, Math.min(0.75, L / n / 2 - 0.15))
  const top = yT
  for (const x of xs) {
    for (const s of [-1, 1]) member(k, [x + s * 0.28, top + 0.08, -W / 2], [x + s * 0.28, top + 0.08, W / 2], 'UPN 160', 'structSteelDark')
    const yg = top + 0.18
    // gearbox: housing, output flange, input bevel housing on +z, breather, oil gauge
    k.rbox('machineryGreen', [0.42, 0.42, 0.42], 0.04, [x, yg + 0.21, 0])
    k.cyl('machineryGreen', 0.16, 0.06, [x, yg + 0.45, 0], 'y', 28)
    k.cyl('machineryGreen', 0.13, 0.12, [x, yg + 0.22, 0.27], 'z', 28)
    k.cyl('brass', 0.015, 0.06, [x - 0.12, yg + 0.5, -0.1], 'y', 8)
    k.cyl('glass', 0.025, 0.01, [x + 0.212, yg + 0.12, 0], 'x', 16)
    const H0 = yg + 0.22 - (top + 0.1825)
    const zp1 = 0.33 + m.L + 0.06
    k.box('structSteelDark', [0.7, 0.025, zp1 + 0.3], [x, top + 0.17, (zp1 - 0.3) / 2])
    k.with(new THREE.Matrix4().compose(new THREE.Vector3(x, yg + 0.22, 0.33), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)), () =>
      motor(k, { R: Math.min(m.R, H0 - 0.02), L: m.L, H: H0, tbox: 'top', cable: false }),
    )
    // hatch opening in the grating around the shaft: frame, open leaves, guard rail
    const hx0 = x - hatch
    const hx1 = x + hatch
    handrail(k, [[hx0, top, -W / 2 + 0.15], [hx0, top, -0.35], [hx1, top, -0.35], [hx1, top, -W / 2 + 0.15]], 'safetyYellow')
    // turning shaft + impeller (rotor about y at the shaft axis)
    const rk = new Kit()
    const yi = yF + Math.max(0.3, D * 0.35)
    rk.cyl('stainless', 0.04, yg - yi, [0, (yg + yi) / 2, 0], 'y', 16)
    rk.cyl('flangeSteel', 0.09, 0.03, [0, yg - 0.03, 0], 'y', 20)
    rk.cyl('flangeSteel', 0.08, 0.1, [0, yi, 0], 'y', 20)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4))
      rk.box('flangeSteel', [D / 2 - 0.06, 0.012, 0.16], [Math.cos(a) * (D / 4 + 0.03), yi, Math.sin(a) * (D / 4 + 0.03)], q)
    }
    if (H > 2.2) {
      const y2 = yi + H * 0.42
      rk.cyl('flangeSteel', 0.07, 0.08, [0, y2, 0], 'y', 20)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4))
        rk.box('flangeSteel', [D * 0.4 - 0.06, 0.01, 0.13], [Math.cos(a) * (D * 0.2 + 0.03), y2, Math.sin(a) * (D * 0.2 + 0.03)], q)
      }
    }
    // shaft stabiliser on the floor
    k.cyl('structSteelDark', 0.08, 0.12, [x, yF + 0.07, 0], 'y', 16, undefined, true)
    rotors.push({ built: rk.build(), axis: 'y', pos: [x, 0, 0], rpm: 58 })
  }

  // grating deck with the hatch openings left clear
  const cells: [number, number, number, number][] = []
  const edges = [-L / 2, ...xs.flatMap((x) => [x - hatch, x + hatch]), L / 2]
  for (let i = 0; i < edges.length - 1; i += 2) cells.push([edges[i], edges[i + 1], -W / 2, W / 2])
  for (const x of xs) {
    cells.push([x - hatch, x + hatch, -0.35, W / 2])
    cells.push([x - hatch, x + hatch, -W / 2, -W / 2 + 0.15])
  }
  for (const [x0, x1, z0, z1] of cells) {
    const nx = Math.max(1, Math.round((x1 - x0) / 1.0))
    for (let i = 0; i < nx; i++) grating(k, [x0 + ((x1 - x0) * (i + 0.5)) / nx, top, (z0 + z1) / 2], (x1 - x0) / nx - 0.01, z1 - z0 - 0.01)
  }
  for (let i = 0; i <= Math.round(L / 1.0); i++) k.box('structSteelDark', [0.05, 0.08, W - 0.02], [-L / 2 + 0.03 + ((L - 0.06) * i) / Math.round(L / 1.0), top - 0.07, 0])

  // perimeter handrail (gap at the ladder) and caged ladder on the -X end
  const g = 0.35
  handrail(k, [[-L / 2 + 0.05, top, -g], [-L / 2 + 0.05, top, -W / 2 + 0.05], [L / 2 - 0.05, top, -W / 2 + 0.05], [L / 2 - 0.05, top, W / 2 - 0.05], [-L / 2 + 0.05, top, W / 2 - 0.05], [-L / 2 + 0.05, top, g]])
  ladder(k, [-L / 2 - 0.2, 0, 0], top, [-1, 0, 0])
  for (const s of [-1, 1]) k.box('safetyYellow', [0.25, 0.04, 0.04], [-L / 2 - 0.1, top - 0.1, s * 0.25])
  k.rod('safetyYellow', [-L / 2 - 0.08, top + 1.1, -g], [-L / 2 - 0.08, top + 1.1, g], 0.02, 8)

  // mud guns: header on stand-offs along the +Z rail, isolation valve and drop pipe with a swivel nozzle per compartment
  const gun = l.gun
  const zg = gun[2]
  const yh = gun[1]
  const gfl = flange(k, 3, 150, gun, 'x', true)
  k.pipe('pipePaint', [-L / 2 + 0.6, yh, zg], [gun[0] - gfl, yh, zg], pipeOD(3), pipeWall(3))
  k.dome('pipePaint', pipeOD(3) / 2, [-L / 2 + 0.6, yh, zg], '-x', Math.PI / 2, 0.5, 16)
  for (let i = 0; i <= Math.round(L / 1.5); i++) {
    const x = -L / 2 + 0.7 + ((L - 0.9) * i) / Math.round(L / 1.5)
    k.box('structSteelDark', [0.05, yh - top, 0.05], [x, (yh + top) / 2, zg])
  }
  for (const x of xs) {
    const xg = x + hatch + 0.45
    k.rbox('valveBody', [0.12, 0.14, 0.14], 0.01, [xg, yh - 0.12, zg])
    k.rod('stainless', [xg, yh - 0.12, zg - 0.07], [xg, yh - 0.12, zg - 0.25], 0.01, 8)
    k.rod('actuatorRed', [xg, yh - 0.12, zg - 0.25], [xg + 0.2, yh - 0.12, zg - 0.25], 0.012, 8)
    k.pipe('pipePaint', [xg, yh, zg], [xg, yh - 0.05, zg], pipeOD(2))
    k.pipe('pipePaint', [xg, yh - 0.19, zg], [xg, yF + 0.75, zg], pipeOD(2), pipeWall(2))
    k.cyl('flangeSteel', 0.05, 0.08, [xg, yF + 0.71, zg], 'y', 16)
    k.rod('pipePaint', [xg, yF + 0.67, zg], [xg - 0.18, yF + 0.5, zg - 0.18], pipeOD(2) / 2, 12)
    k.cyl('stainless', 0.03, 0.06, [xg - 0.2, yF + 0.48, zg - 0.2], [-1, -1, -1], 12, 0.018)
  }

  // nozzles: suction (bottom, -X end), return (top, +X end), equalising (bottom, +X end)
  const nz = (face: V3, dir: 1 | -1, nps: number, mat: MatKey = C) => {
    const fl = flange(k, nps, 150, face, dir > 0 ? 'x' : '-x', true)
    k.pipe(mat, [dir * (L / 2 - 0.05), face[1], face[2]], [face[0] - dir * fl, face[1], face[2]], pipeOD(nps), pipeWall(nps))
    k.cyl(mat, pipeOD(nps) * 0.85, 0.012, [dir * (L / 2 + 0.006), face[1], face[2]], 'x', 32)
  }
  nz(l.suction, -1, p.suctionNps)
  nz(l.ret, 1, p.returnNps)
  nz(l.equal, 1, p.suctionNps)
  // suction bell inside the tank
  k.lathe(C, [[pipeOD(p.suctionNps) * 0.9, -0.1], [pipeOD(p.suctionNps) * 0.55, 0.05], [pipeOD(p.suctionNps) * 0.5, 0.3]], [-L / 2 + 0.35, l.suction[1], l.suction[2]], 'x', 32)

  // clean-out doors at the floor on the -Z side, one per compartment
  for (const x of xs) {
    k.box(C, [0.6, 0.45, 0.03], [x - 0.6, yF + 0.3, -W / 2 - 0.015])
    for (const dx of [-0.25, 0, 0.25]) for (const dy of [-0.17, 0.17]) k.hex('nut', 0.03, 0.02, [x - 0.6 + dx, yF + 0.3 + dy, -W / 2 - 0.035], 'z')
    k.rod('safetyYellow', [x - 0.85, yF + 0.3, -W / 2 - 0.05], [x - 0.35, yF + 0.3, -W / 2 - 0.05], 0.015, 8)
  }

  tagPlate(k, p.tag, [L / 2 - 1.2, yF + H * 0.75, W / 2 + 0.07], 'z', 0.4)
  tagPlate(k, p.tag, [-L / 2 + 1.2, yF + H * 0.75, -W / 2 - 0.07], '-z', 0.4)
  k.cyl('brass', 0.015, 0.03, [L / 2 - 0.3, 0.2, W / 2 + 0.005], 'z', 10)

  return { built: k.build(), rotors }
}
