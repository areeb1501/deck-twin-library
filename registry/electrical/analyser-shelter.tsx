// GRP analyser shelter on a steel skid: outward doors at both ends, sample panels under a canopy, cylinder rack, Ex AC, pressurising ventilation, F&G. IEC 61285, EEMUA 138.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, uvScale, type Built, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { checkerPlate, gauge, liftingLug, member, tagPlate } from '../lib/parts'
import { fanGuardMaterial, signMaterial, textMaterial } from '../lib/textures'
import { beacon, cableTransit, earthBoss, louvre, louvrePanel } from './_parts'
import { grpMaterial, lamp } from './_textures'

export interface AnalyserShelterProps {
  /** outside length along X, m */
  length?: number
  /** outside width along Z, m */
  width?: number
  /** eaves height above deck, m */
  height?: number
  /** sample conditioning panels on the front wall */
  panels?: number
  /** gas cylinders in the rack */
  bottles?: number
  doorOpen?: boolean
  tag?: string
}

export const defaults = {
  length: 3.6,
  width: 2.5,
  height: 3.0,
  panels: 2,
  bottles: 4,
  doorOpen: false,
  tag: 'AH-3001',
}

const T = 0.06 // GRP sandwich wall
const HB = 0.18 // skid top / floor
const front = new THREE.Quaternion()

export function AnalyserShelter(props: AnalyserShelterProps & GroupProps) {
  const { length, width, height, panels, bottles, doorOpen, tag, ...group } = { ...defaults, ...props }
  const b = useMemo(() => build({ length, width, height, panels, bottles, doorOpen, tag }), [length, width, height, panels, bottles, doorOpen, tag])
  useEffect(() => () => [b.shell, b.leaf].forEach((x) => x.geometry.dispose()), [b])
  return (
    <group {...group}>
      <KitMesh data={b.shell} />
      <group position={b.hinge}>
        <group rotation={[0, doorOpen ? 1.5 : 0, 0]}>
          <KitMesh data={b.leaf} />
        </group>
      </group>
      {b.end && (
        <group position={b.end} rotation={[0, Math.PI / 2, 0]}>
          <group rotation={[0, doorOpen ? 1.5 : 0, 0]}>
            <KitMesh data={b.leaf} />
          </group>
        </group>
      )}
    </group>
  )
}

export default AnalyserShelter

function build(p: typeof defaults) {
  const SX = Math.min(8, Math.max(2.4, p.length))
  const SZ = Math.min(4, Math.max(1.8, p.width))
  const SY = Math.min(4, Math.max(2.7, p.height))
  const k = new Kit()
  const grp = grpMaterial()
  const trim: MatKey = paint('#d9d5c6', { metalness: 0.05, roughness: 0.4, clearcoat: 0.3, weather: 0.6 })
  const S: MatKey = 'stainless'

  // skid: UPN 160 perimeter and cross members, checker-plate floor, lifting lugs, earth boss
  for (const s of [-1, 1]) {
    member(k, [-SX / 2 - 0.1, 0.08, s * (SZ / 2 + 0.05 - 0.035)], [SX / 2 + 0.1, 0.08, s * (SZ / 2 + 0.05 - 0.035)], 'UPN 160', 'structSteelDark', [0, 1, 0])
    member(k, [s * (SX / 2 + 0.1 - 0.035), 0.08, -SZ / 2 + 0.05], [s * (SX / 2 + 0.1 - 0.035), 0.08, SZ / 2 - 0.05], 'UPN 160', 'structSteelDark', [0, 1, 0])
  }
  checkerPlate(k, [0, HB, 0], SX + 0.2, SZ + 0.1)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (SX / 2 - 0.3), HB, sz * (SZ / 2 + 0.03)], 'x', 1, 'structSteelDark')
  earthBoss(k, [SX / 2 + 0.1, 0.08, SZ / 2 - 0.3], 'x')

  // walls with a door opening on +Z
  const dw = 0.9
  const dh = 2.1
  const du = -SX / 2 + 0.4 + dw / 2
  const wallH = SY - HB
  const yw = HB + wallH / 2
  const panel = (w: number, h: number, c: V3, q?: THREE.Quaternion) => {
    const g = new THREE.BoxGeometry(w, h, T)
    uvScale(g, w / 0.8, h / 0.8)
    k.add(grp, g, new THREE.Matrix4().compose(new THREE.Vector3(...c), q ?? new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)))
  }
  const ry = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a)
  panel(SX, wallH, [0, yw, -SZ / 2 + T / 2])
  // end walls: -X plain, +X with the second (escape) door when the shelter is wide enough
  const endDoor = SZ >= 2.3
  const zd = SZ / 2 - 0.65
  panel(SZ - 2 * T, wallH, [-(SX / 2 - T / 2), yw, 0], ry(Math.PI / 2))
  if (endDoor) {
    const z0 = -SZ / 2 + T
    const z1 = SZ / 2 - T
    const e0 = zd - dw / 2
    const e1 = zd + dw / 2
    panel(e0 - z0, wallH, [SX / 2 - T / 2, yw, (z0 + e0) / 2], ry(Math.PI / 2))
    panel(z1 - e1, wallH, [SX / 2 - T / 2, yw, (e1 + z1) / 2], ry(Math.PI / 2))
    panel(dw, SY - HB - dh, [SX / 2 - T / 2, HB + dh + (SY - HB - dh) / 2, zd], ry(Math.PI / 2))
    for (const s of [-1, 1]) k.box('stainless', [T + 0.02, dh, 0.04], [SX / 2 - T / 2, HB + dh / 2, zd + s * (dw / 2 + 0.02)])
    k.box('stainless', [T + 0.02, 0.04, dw + 0.08], [SX / 2 - T / 2, HB + dh + 0.02, zd])
    k.rbox('stainless', [0.09, 0.1, 0.24], 0.025, [SX / 2 + 0.045, HB + dh + 0.18, zd])
    k.box('lampLens', [0.01, 0.05, 0.2], [SX / 2 + 0.092, HB + dh + 0.18, zd])
  } else panel(SZ - 2 * T, wallH, [SX / 2 - T / 2, yw, 0], ry(Math.PI / 2))
  const zF = SZ / 2 - T / 2
  const a0 = du - dw / 2
  const a1 = du + dw / 2
  panel(a0 + SX / 2, wallH, [(-SX / 2 + a0) / 2, yw, zF])
  panel(SX / 2 - a1, wallH, [(a1 + SX / 2) / 2, yw, zF])
  panel(dw, SY - HB - dh, [du, HB + dh + (SY - HB - dh) / 2, zF])
  // panel joint cover strips, corner profiles, door frame
  for (let x = -SX / 2 + 1.2; x < SX / 2 - 0.1; x += 1.2) if (Math.abs(x - du) > dw / 2 + 0.1) k.box(trim, [0.05, wallH, 0.008], [x, yw, SZ / 2 + 0.004])
  for (let x = -SX / 2 + 1.2; x < SX / 2 - 0.1; x += 1.2) k.box(trim, [0.05, wallH, 0.008], [x, yw, -SZ / 2 - 0.004])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(trim, [0.08, wallH, 0.08], [sx * (SX / 2 - 0.03), yw, sz * (SZ / 2 - 0.03)])
  for (const s of [-1, 1]) k.box(S, [0.04, dh, T + 0.02], [du + s * (dw / 2 + 0.02), HB + dh / 2, zF])
  k.box(S, [dw + 0.08, 0.04, T + 0.02], [du, HB + dh + 0.02, zF])
  k.box(S, [dw, 0.01, T + 0.02], [du, HB + 0.005, zF])

  // roof with front canopy over the sample panels, drip edge
  const ov = 0.8
  k.box(grp, [SX + 0.2, 0.08, SZ + ov + 0.1], [0, SY + 0.04, ov / 2])
  k.box(trim, [SX + 0.24, 0.1, 0.03], [0, SY + 0.03, SZ / 2 + ov + 0.065])
  for (const s of [-1, 1]) k.rod('stainless', [s * (SX / 2 - 0.05), SY - 0.4, SZ / 2], [s * (SX / 2 - 0.05), SY - 0.01, SZ / 2 + ov], 0.018, 8)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (SX / 2 - 0.2), SY + 0.08, sz * (SZ / 2 - 0.2)], 'x', 0.8, S)
  beacon(k, [SX / 2 - 0.25, SY + 0.08, SZ / 2 + 0.2], lamp('red'))
  beacon(k, [SX / 2 - 0.5, SY + 0.08, SZ / 2 + 0.2], lamp('amber'))

  // door dressing: light, signs, tag
  k.rbox(S, [0.24, 0.1, 0.09], 0.025, [du, HB + dh + 0.18, SZ / 2 + 0.045])
  k.box('lampLens', [0.2, 0.05, 0.01], [du, HB + dh + 0.18, SZ / 2 + 0.092])
  k.plane(textMaterial('ANALYSER HOUSE', '#1f4e9a', '#ffffff', 512, 96), 0.9, 0.17, [a1 + 0.6 > SX / 2 - 0.3 ? du : a1 + 0.65, SY - 0.22, SZ / 2 + 0.004], front)
  k.plane(signMaterial('noentry'), 0.36, 0.18, [a0 - 0.25, HB + 1.25, SZ / 2 + 0.002], front)

  // sample conditioning panels between the door and the +X end
  const nP = Math.max(0, Math.min(4, Math.round(p.panels)))
  const pw = 0.7
  const room = SX / 2 - 0.15 - (a1 + 0.15)
  const nFit = Math.min(nP, Math.floor(room / (pw + 0.05)))
  for (let i = 0; i < nFit; i++) {
    const x = a1 + 0.15 + pw / 2 + i * (pw + 0.05)
    scsPanel(k, x, SZ / 2, pw)
  }

  // gas bottle rack against the -X end wall
  bottleRack(k, -SX / 2, SZ, Math.max(0, Math.min(8, Math.round(p.bottles))))

  // Ex wall AC unit on the +X end, ventilation louvre and MCT cable entry on the back wall, gas detector
  {
    const x = SX / 2
    const c: V3 = [x + 0.22, HB + 1.55, endDoor ? -SZ / 2 + 0.45 : -SZ * 0.15]
    k.rbox(paint('#e3e1d8', { roughness: 0.4, metalness: 0.1 }), [0.44, 0.8, 0.7], 0.02, c)
    louvrePanel(k, 0.6, 0.3, [c[0] + 0.221, c[1] + 0.2, c[2]], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), '#cfccc2')
    k.disc(fanGuardMaterial(), 0.16, [c[0] + 0.222, c[1] - 0.15, c[2]], 'x', 28)
    k.disc('rubberBlack', 0.155, [c[0] + 0.218, c[1] - 0.15, c[2]], 'x', 28)
    for (const dz of [-0.25, 0.25]) k.box('structSteelDark', [0.24, 0.05, 0.05], [x + 0.12, c[1] - 0.425, c[2] + dz])
    k.tube('copper', [[c[0] - 0.1, c[1] - 0.4, c[2] + 0.3], [c[0] - 0.1, c[1] - 0.55, c[2] + 0.3], [x + 0.01, c[1] - 0.55, c[2] + 0.3]], 0.008, 6)
    k.rbox(S, [0.12, 0.16, 0.08], 0.01, [x + 0.04, c[1] + 0.6, c[2] + 0.45])
  }
  k.with(new THREE.Matrix4().makeRotationY(Math.PI).setPosition(0, 0, -SZ / 2), () => {
    louvre(k, -SX * 0.25, SY - 0.6, 0.5, 0.35, 'stainless', trim)
    louvre(k, SX * 0.25, HB + 0.4, 0.5, 0.35, 'stainless', trim)
    cableTransit(k, 0, HB + 0.5, 4, 2, 'stainless')
    for (let c = 0; c < 4; c++) k.spline('cable', [[-0.11 + c * 0.075, HB + 0.5, 0.13], [-0.11 + c * 0.075, HB + 0.5, 0.35], [-0.11 + c * 0.075, 0.12, 0.6], [-0.11 + c * 0.075, 0.05, 1.1]], 0.014, 6, 16)
  })
  // gas detector (IR point) beside the door
  k.box(S, [0.1, 0.12, 0.06], [a0 - 0.25, SY - 0.6, SZ / 2 + 0.03])
  k.cyl(S, 0.03, 0.12, [a0 - 0.25, SY - 0.72, SZ / 2 + 0.05], 'y', 14)
  k.cyl('rubberBlack', 0.032, 0.03, [a0 - 0.25, SY - 0.79, SZ / 2 + 0.05], 'y', 14)
  tagPlate(k, p.tag, [a0 - 0.25, HB + 1.6, SZ / 2 + 0.002], 'z', 0.16)

  // interior: analyser cabinets along the back wall, ceiling light, floor
  k.box(paint('#8f9a92', { roughness: 0.8, metalness: 0.1 }), [SX - 2 * T, 0.02, SZ - 2 * T], [0, HB + 0.01, 0])
  // manual call points beside each door, external shutdown panel (power / sample / carrier gas isolation)
  const mac = (pos: V3, q: THREE.Quaternion) => k.at(pos, q, () => {
    k.box('actuatorRed', [0.1, 0.1, 0.05], [0, 0, 0.025])
    k.box('glass', [0.07, 0.07, 0.004], [0, 0, 0.052])
  })
  mac([a1 + 0.2, HB + 1.4, SZ / 2], front)
  if (endDoor) mac([SX / 2, HB + 1.4, zd - dw / 2 - 0.2], ry(Math.PI / 2))
  k.rbox('stainless', [0.3, 0.4, 0.15], 0.02, [a0 - 0.25, HB + 0.85, SZ / 2 + 0.075])
  k.cyl('actuatorRed', 0.03, 0.04, [a0 - 0.25, HB + 0.9, SZ / 2 + 0.17], 'z', 14)
  k.box('actuatorYellow', [0.1, 0.1, 0.004], [a0 - 0.25, HB + 0.9, SZ / 2 + 0.151])
  k.plane(textMaterial('SHUTDOWN', '#c3221a', '#ffffff', 256, 64), 0.2, 0.05, [a0 - 0.25, HB + 0.72, SZ / 2 + 0.152], front)
  // pressurising ventilation: intake stack with rain hood drawn from a safe area, fan, and an overpressure damper
  {
    const sx = -SX / 2 + 0.5
    const sz = -SZ / 2 + 0.45
    k.box('galvanised', [0.4, 0.5, 0.4], [sx, SY + 0.33, sz])
    k.cyl('galvanised', 0.12, 1.4, [sx, SY + 1.28, sz], 'y', 20, undefined, true)
    k.cyl('galvanised', 0.11, 1.38, [sx, SY + 1.28, sz], 'y', 20, undefined, true)
    k.cyl('galvanised', 0.24, 0.04, [sx, SY + 2.12, sz], 'y', 24, 0.05) // rain hood
    for (let i = 0; i < 3; i++) k.rod('galvanised', [sx + 0.1 * Math.cos(i * 2.1), SY + 1.98, sz + 0.1 * Math.sin(i * 2.1)], [sx + 0.13 * Math.cos(i * 2.1), SY + 2.1, sz + 0.13 * Math.sin(i * 2.1)], 0.008, 6)
    k.rbox('motorPaint', [0.25, 0.25, 0.3], 0.03, [sx + 0.32, SY + 0.25, sz])
  }
  // smoke detector inside
  k.cyl('nameplate', 0.05, 0.025, [SX * 0.2, SY - 0.0125, 0], 'y', 20)
  const cab = paint('#d6d8d4', { metalness: 0.2, roughness: 0.45 })
  const nC = Math.max(1, Math.floor((SX - 2 * T - 0.4) / 0.85))
  for (let i = 0; i < nC; i++) {
    const x = -((nC - 1) * 0.85) / 2 + i * 0.85
    const z = -SZ / 2 + T + 0.35
    k.box(cab, [0.8, 2.0, 0.6], [x, HB + 1.02, z])
    k.box('glass', [0.6, 0.9, 0.01], [x, HB + 1.45, z + 0.305])
    k.box('rubberBlack', [0.5, 0.25, 0.01], [x, HB + 1.6, z + 0.302])
    k.box(lamp('green'), [0.3, 0.12, 0.004], [x, HB + 1.62, z + 0.308])
    for (let j = 0; j < 3; j++) k.box('nut', [0.5, 0.08, 0.01], [x, HB + 0.5 + j * 0.15, z + 0.302])
  }
  k.box(paint('#ffffff', { emissive: '#fff3dc', emissiveIntensity: 1.4, roughness: 0.4, metalness: 0, clearcoat: 0, weather: 0 }), [1.2, 0.03, 0.15], [0, SY - 0.03, 0])

  return { shell: k.build(), leaf: leafBuilt(dw, dh, grp), hinge: [a1, HB, SZ / 2] as V3, end: endDoor ? ([SX / 2, HB, zd - dw / 2] as V3) : null }
}

/** Stainless sample conditioning panel on the front wall: filters, regulators, rotameters, valves, tubing. */
function scsPanel(k: Kit, x: number, zw: number, w: number) {
  const S: MatKey = 'stainless'
  const h = 1.3
  const y0 = HB + 0.5
  const z = zw + 0.06
  k.box(S, [w, h, 0.006], [x, y0 + h / 2, z])
  for (const dy of [0.1, h - 0.1]) for (const s of [-1, 1]) k.box('structSteelDark', [0.04, 0.04, 0.06], [x + s * (w / 2 - 0.05), y0 + dy, zw + 0.03])
  // incoming sample line from below, filter, regulator + gauge, rotameters, outlet bulkhead into the shelter
  const xs = [x - w * 0.3, x - w * 0.05, x + w * 0.2]
  for (const [i, xi] of xs.entries()) {
    const yf = y0 + 0.25
    k.cyl(S, 0.035, 0.18, [xi, yf, z + 0.06], 'y', 16) // filter bowl
    k.hex(S, 0.07, 0.03, [xi, yf + 0.1, z + 0.06])
    k.rbox(S, [0.07, 0.07, 0.07], 0.01, [xi, yf + 0.3, z + 0.06]) // regulator
    k.cyl(S, 0.02, 0.06, [xi, yf + 0.37, z + 0.06], 'y', 12)
    gauge(k, [xi, yf + 0.44, z + 0.07], 'z', 0.06, 'bar', i === 0 ? 10 : 16)
    k.box(S, [0.05, 0.22, 0.04], [xi, yf + 0.68, z + 0.04]) // rotameter
    k.box('glass', [0.025, 0.18, 0.01], [xi, yf + 0.68, z + 0.065])
    k.cyl('actuatorYellow', 0.008, 0.01, [xi, yf + 0.65, z + 0.065], 'y', 8)
    k.tube('tubing', [[xi, y0 - 0.4, z + 0.06], [xi, yf - 0.09, z + 0.06]], 0.006, 6)
    k.tube('tubing', [[xi, yf + 0.11, z + 0.06], [xi, yf + 0.265, z + 0.06]], 0.006, 6)
    k.tube('tubing', [[xi, yf + 0.335, z + 0.06], [xi, yf + 0.37, z + 0.06], [xi + 0.06, yf + 0.37, z + 0.06], [xi + 0.06, yf + 0.57, z + 0.04], [xi, yf + 0.57, z + 0.04]], 0.005, 6, 0.02)
    k.tube('tubing', [[xi, yf + 0.79, z + 0.04], [xi, yf + 0.9, z + 0.04], [xi, yf + 0.9, zw + 0.005]], 0.005, 6, 0.02)
    k.hex(S, 0.02, 0.02, [xi, yf + 0.9, zw + 0.012], 'z')
    // ball valve with lever on the inlet
    k.rbox(S, [0.03, 0.04, 0.03], 0.005, [xi, y0 + 0.06, z + 0.06])
    k.box('actuatorBlue', [0.012, 0.012, 0.07], [xi, y0 + 0.09, z + 0.09])
  }
  k.plane(textMaterial('SCS', '#e9eae6', '#222222', 256, 64), 0.16, 0.04, [x, y0 + h - 0.06, z + 0.004], front)
  // sample tubing bundle down to the deck
  k.spline('tubing', [[xs[0], y0 - 0.4, z + 0.06], [x, 0.4, z + 0.2], [x + 0.1, 0.12, z + 0.5]], 0.02, 8, 16)
}

/** Gas cylinder rack (frame, chains, regulators, pigtails, rain roof) against the -X wall. */
function bottleRack(k: Kit, xw: number, SZ: number, n: number) {
  if (!n) return
  const cols = ['#8a8f93', '#2b2d2f', '#3b6ea8', '#c8a23a', '#8a8f93', '#2b2d2f', '#3b6ea8', '#6a8f4a']
  const r = 0.115
  const pitch = 0.28
  const L = n * pitch + 0.1
  const xr = xw - 0.4
  const z0 = -L / 2 + SZ * 0.05
  const G: MatKey = 'galvanised'
  const B0 = 0.015
  k.box(G, [0.62, 0.015, L + 0.1], [xr, 0.0075, z0 + L / 2])
  for (const dz of [-L / 2, L / 2]) for (const dx of [-0.25, 0.25]) member(k, [xr + dx, B0, z0 + L / 2 + dz], [xr + dx, B0 + 1.9, z0 + L / 2 + dz], 'L50x50x5', G)
  for (const y of [B0 + 0.05, B0 + 1.0, B0 + 1.35, B0 + 1.9]) for (const dx of [-0.25, 0.25]) k.box(G, [0.05, 0.04, L], [xr + dx, y, z0 + L / 2])
  k.box(G, [0.6, 0.04, L + 0.1], [xr, B0 + 1.95, z0 + L / 2])
  k.box(G, [0.04, 1.9, 0.04], [xw - 0.02, B0 + 0.95, z0 + L / 2])
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.05 + pitch * (i + 0.5)
    const col = paint(cols[i % cols.length], { roughness: 0.4, metalness: 0.3, clearcoat: 0.4 })
    k.cyl(col, r, 1.3, [xr, B0 + 0.7, z], 'y', 20)
    k.dome(col, r, [xr, B0 + 1.35, z], 'y', Math.PI / 2, 0.8, 20)
    k.dome(col, r, [xr, B0 + 0.05, z], '-y', Math.PI / 2, 0.15, 20)
    k.cyl('brass', 0.025, 0.08, [xr, B0 + 1.5, z], 'y', 10)
    k.rbox('brass', [0.06, 0.05, 0.05], 0.008, [xr, B0 + 1.56, z])
    gauge(k, [xr + 0.05, B0 + 1.6, z], 'x', 0.05, 'bar', 250)
    k.tube('tubing', [[xr, B0 + 1.585, z], [xr, B0 + 1.68, z], [xw - 0.05, B0 + 1.68, z], [xw - 0.05, B0 + 1.68, z], [xw - 0.005, B0 + 1.68, z]], 0.005, 6, 0.03)
    for (const y of [B0 + 1.0, B0 + 1.35]) k.torus('nut', r + 0.008, 0.005, [xr, y - 0.02, z], 'y', 4, 20)
  }
  k.plane(signMaterial('noentry'), 0.4, 0.2, [xr - 0.27, B0 + 1.15, z0 + L / 2], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2))
}

/** GRP door leaf with vision panel, hinge at the origin on the outer face, leaf along -X. */
function leafBuilt(w: number, h: number, grp: MatKey): Built {
  const k = new Kit()
  const t = 0.05
  const zc = -0.03
  k.box(grp, [w - 0.01, h - 0.01, t], [-w / 2, h / 2, zc])
  k.box('glass', [0.25, 0.35, 0.01], [-w / 2, h * 0.7, zc + t / 2 + 0.002])
  k.box('stainless', [0.28, 0.38, 0.004], [-w / 2, h * 0.7, zc + t / 2 + 0.001])
  k.box('stainless', [w * 0.9, 0.2, 0.004], [-w / 2, 0.12, zc + t / 2 + 0.002])
  k.rod('stainless', [-w + 0.08, 0.9, zc + t / 2 + 0.05], [-w + 0.08, 1.25, zc + t / 2 + 0.05], 0.012, 8)
  for (const y of [0.93, 1.22]) k.rod('stainless', [-w + 0.08, y, zc + t / 2], [-w + 0.08, y, zc + t / 2 + 0.05], 0.008, 6)
  for (const y of [0.25, h / 2, h - 0.25]) k.cyl('nut', 0.014, 0.1, [-0.004, y, -0.005], 'y', 10)
  k.rod('stainless', [-0.12, 1.0, zc - t / 2 - 0.06], [-w + 0.08, 1.0, zc - t / 2 - 0.06], 0.014, 8)
  return k.build()
}
