// Packaged three-pass wetback fire-tube steam boiler on a skid: duoblock burner with windbox and FD fan, gas train, trim and stack. EN 12953, ASME Section I.
import * as THREE from 'three'
import type { Kit, V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gasket, gauge, grating, handrail, ladder, manway, member, nozzle, pipeRun, tagPlate } from '../lib/parts'
import { paint } from '../lib/materials'
import { port, type Port } from '../lib/ports'
import { faceToFace, pipeOD, type Rating } from '../lib/standards'
import { louvreMaterial, textMaterial } from '../lib/textures'
import { GateValve } from '../valves/gate-valve'
import { anchorBolt, clamp, earthBond, plinth, ring } from './_onshore'

export interface PackagedBoilerProps {
  /** steam output, t/h */
  steam?: number
  /** design pressure, barg */
  pressure?: number
  rating?: Rating
  fuel?: 'gas' | 'dual'
  /** top access platform with ladder */
  platform?: boolean
  tag?: string
}

export const defaults = { steam: 8, pressure: 12, rating: 300 as Rating, fuel: 'gas' as 'gas' | 'dual', platform: true, tag: '' }

function layout(p: typeof defaults) {
  const t = clamp(p.steam, 1, 25)
  // typical shell sizes for three-pass wetback units (8 t/h ≈ 2.4 m OD × 5.8 m)
  const D = clamp(1.3 + 0.14 * t, 1.4, 4.2)
  const L = clamp(2.4 * D, 3, 9.5)
  const R = D / 2
  const yS = 0.15 + 0.22 + 0.3 + R
  const steamNps = t <= 3 ? 3 : t <= 6 ? 4 : t <= 10 ? 6 : t <= 16 ? 8 : 10
  const feedNps = t <= 10 ? 2 : 3
  const bdNps = t <= 6 ? 1.5 : 2
  const fuelNps = t <= 4 ? 1.5 : t <= 12 ? 2 : 3
  const sx = 0.12 * L
  const steamTop = yS + R + 0.25
  const Lv = faceToFace('gate', steamNps, p.rating)
  const feed = { base: [0.12 * L, yS + 0.3 * R, Math.sqrt(R * R - (0.3 * R) ** 2)] as V3, standout: 0.25 }
  const bd = { x: 0.38 * L, y: 0.38, z: R + 0.35 }
  const gas = { x: -L / 2 + 1.0, y: 0.95, z: R + 0.75 }
  return { t, D, L, R, yS, steamNps, feedNps, bdNps, fuelNps, sx, steamTop, Lv, feed, bd, gas }
}

export function ports(props: PackagedBoilerProps = {}): Port[] {
  const p = { ...defaults, ...props }
  const g = layout(p)
  return [
    port('steam', 'Main steam', [g.sx, g.steamTop + 0.0045 + g.Lv, 0], [0, 1, 0], g.steamNps, p.rating),
    port('feedwater', 'Feedwater', [g.feed.base[0], g.feed.base[1], g.feed.base[2] + g.feed.standout], [0, 0, 1], g.feedNps, p.rating),
    port('blowdown', 'Bottom blowdown', [g.bd.x, g.bd.y, g.bd.z], [0, 0, 1], g.bdNps, p.rating, 'drain'),
    port('fuel', 'Fuel gas', [g.gas.x, g.gas.y, g.gas.z], [0, 0, 1], g.fuelNps, 150),
  ]
}

export function PackagedBoiler(props: PackagedBoilerProps & GroupProps) {
  const { steam, pressure, rating, fuel, platform, tag, ...group } = { ...defaults, ...props }
  const p = { steam, pressure, rating, fuel, platform, tag }
  const g = layout(p)
  const data = useKit((k) => build(k, p, g), [steam, pressure, rating, fuel, platform, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
      <GateValve nps={g.steamNps} rating={rating} operator={g.steamNps >= 8 ? 'gear' : 'handwheel'} position={[g.sx, g.steamTop + 0.0045 + g.Lv / 2, 0]} rotation={[0, 0, Math.PI / 2]} tag={tag ? `${tag}-MSV` : ''} />
    </group>
  )
}

export default PackagedBoiler

type P = typeof defaults
type G = ReturnType<typeof layout>

function build(k: Kit, p: P, g: G) {
  const { D, L, R, yS, t } = g
  const jacket = paint('#c4c9cc', { metalness: 0.55, roughness: 0.35, clearcoat: 0.2 })
  const head = paint('#a83226', { clearcoat: 0.4 })
  const burnerC = paint('#2f4f7a', { clearcoat: 0.5 })
  const SK = 'structSteelDark'
  // housekeeping pad, skid, saddles
  const xf = -L / 2 - 0.55
  const xr = L / 2 + 0.45
  const skL = xr - xf + 2.2
  const skC = (xf - 2.0 + xr + 0.2) / 2
  plinth(k, skC, 0, skL + 0.4, D + 1.4, 0.15)
  const hk = 0.22
  for (const s of [-1, 1]) member(k, [skC - skL / 2, 0.15 + hk / 2, s * (R * 0.7)], [skC + skL / 2, 0.15 + hk / 2, s * (R * 0.7)], 'HEB 220', SK)
  for (let i = 0; i <= 4; i++) {
    const x = skC - skL / 2 + 0.11 + (i * (skL - 0.22)) / 4
    member(k, [x, 0.15 + hk / 2, -R * 0.7 + 0.11], [x, 0.15 + hk / 2, R * 0.7 - 0.11], 'HEB 220', SK)
  }
  for (const s of [-1, 1]) for (const x of [skC - skL / 2 + 0.2, skC + skL / 2 - 0.2]) anchorBolt(k, [x, 0.15 + hk, s * (R * 0.7 + 0.08)], 0.02)
  for (const x of [-L * 0.32, L * 0.32]) {
    const sh = new THREE.Shape()
    const w = R * 1.6
    sh.moveTo(-w / 2, 0)
    sh.lineTo(w / 2, 0)
    sh.lineTo(w / 2, 0.3 + R * 0.35)
    sh.absarc(0, 0.3 + R, R * 1.02, -Math.PI / 2 + 0.83, -Math.PI / 2 - 0.83, true)
    sh.lineTo(-w / 2, 0.3 + R * 0.35)
    sh.closePath()
    k.extrude(SK, sh, 0.3, new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(x + 0.15, 0.15 + hk, 0))
  }
  // shell with ribbed cladding, front and rear smoke boxes / doors
  k.cyl(jacket, R + 0.08, L, [0, yS, 0], 'x', 64)
  for (let i = 0; i <= Math.round(L / 0.9); i++) k.torus(jacket, R + 0.085, 0.012, [-L / 2 + (i * L) / Math.round(L / 0.9), yS, 0], 'x', 6, 64)
  k.cyl(head, R + 0.02, 0.5, [-L / 2 - 0.25, yS, 0], 'x', 64)
  k.cyl(head, R + 0.06, 0.08, [-L / 2 - 0.5, yS, 0], 'x', 64)
  k.cyl(head, R, 0.4, [L / 2 + 0.2, yS, 0], 'x', 64)
  k.lathe(head, [[R, 0], [R * 0.9, 0.12], [R * 0.55, 0.22], [0, 0.25]], [L / 2 + 0.4, yS, 0], 'x', 48)
  for (const [x, ax] of [[-L / 2 - 0.5, '-x'], [L / 2 + 0.4, 'x']] as const) {
    k.boltCircle('boltXylan', 'nut', 16, R - 0.02, [x - (ax === 'x' ? 0.05 : -0.05), yS, 0], ax, 0.02, 0.08, [0.06])
    // davit hinge for the door
    k.rod(head, [x, yS + R * 0.5, R + 0.05], [x, yS - R * 0.5, R + 0.05], 0.04, 10)
  }
  k.cyl('glass', 0.04, 0.02, [L / 2 + 0.64, yS, 0], 'x', 16)
  // flue outlet on the rear smoke box and stack
  const stackR = clamp(0.18 + 0.03 * t, 0.25, 0.8)
  const stackTop = yS + R + 3.5 + 0.15 * t
  ring(k, head, stackR, stackR + 0.08, 0.06, [L / 2 + 0.2, yS + R + 0.18, 0], 'y')
  k.cyl(head, stackR + 0.02, 0.18, [L / 2 + 0.2, yS + R + 0.09, 0], 'y', 32, undefined, true)
  k.pipe('galvanised', [L / 2 + 0.2, yS + R + 0.21, 0], [L / 2 + 0.2, stackTop, 0], stackR * 2, 0.006, 40)
  ring(k, 'galvanised', stackR, stackR + 0.07, 0.05, [L / 2 + 0.2, yS + R + 0.24, 0], 'y')
  for (let y = yS + R + 1.5; y < stackTop - 0.5; y += 1.5) ring(k, 'galvanised', stackR, stackR + 0.03, 0.04, [L / 2 + 0.2, y, 0], 'y')
  k.cyl('stainless', 0.02, 0.15, [L / 2 + 0.2 + stackR + 0.07, yS + R + 1.0, 0], 'x', 8)

  // duoblock burner: windbox on the front door, FD fan with motor and inlet silencer on the skid front
  const xb = -L / 2 - 0.55
  const yb = yS - 0.12 * D
  const wb = clamp(0.5 + 0.06 * t, 0.7, 1.8)
  k.rbox(burnerC, [0.55, wb, wb], 0.04, [xb - 0.28, yb, 0])
  k.cyl(burnerC, wb * 0.32, 0.5, [xb - 0.8, yb, 0], 'x', 32)
  k.cyl('stainless', 0.06, 0.6, [xb - 1.2, yb, 0], 'x', 16)
  k.box('actuatorBlue', [0.14, 0.14, 0.14], [xb - 0.5, yb + wb * 0.5 + 0.07, 0.15])
  k.cyl('glass', 0.03, 0.04, [xb - 0.56, yb + 0.2, wb * 0.5 + 0.01], 'z', 14)
  const fx = xb - 0.28 - 0.3 * wb
  const fz = -(R + 0.25)
  const fy = 0.15 + wb * 0.62
  const yd = yb + wb / 2 + 0.15
  const ox = fx + 0.3 * wb
  k.cyl(burnerC, wb * 0.5, wb * 0.45, [fx, fy, fz], 'z', 40)
  k.box(burnerC, [wb * 0.35, yd - fy, wb * 0.45], [ox, (fy + yd) / 2, fz])
  k.box(burnerC, [wb * 0.35, 0.3, -fz + wb * 0.22], [ox, yd, fz / 2 - wb * 0.11])
  k.cyl(burnerC, wb * 0.18, 0.08, [fx, fy, fz - wb * 0.27], 'z', 28)
  k.cyl('motorPaint', wb * 0.2, wb * 0.55, [fx, fy, fz - wb * 0.57], 'z', 28)
  const sil = new THREE.CylinderGeometry(wb * 0.26, wb * 0.26, 0.5, 28, 1, false)
  const uv = sil.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3)
  k.add(louvreMaterial('#5a6f8a'), sil, new THREE.Matrix4().compose(new THREE.Vector3(fx - wb * 0.5 - 0.25, fy, fz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), new THREE.Vector3(1, 1, 1)))
  k.box(SK, [wb * 1.1, fy - wb * 0.5 - 0.15, wb * 0.5], [fx, (fy - wb * 0.5 + 0.15) / 2, fz])
  // gas train: ball valve, filter, regulator, double block shut-offs, pressure switches, into the burner head
  const gy = g.gas.y
  const gz = g.gas.z - 0.25
  const gnps = g.fuelNps
  const god = pipeOD(gnps)
  const face = nozzle(k, { base: [g.gas.x, gy, gz], dir: [0, 0, 1], nps: gnps, rating: 150, standout: 0.25, mat: 'safetyYellow' })
  void face
  const gx1 = xb - 0.8
  pipeRun(k, [[g.gas.x, gy, gz], [g.gas.x, gy, gz - 0.15], [gx1, gy, gz - 0.15], [gx1, gy, wb * 0.25], [gx1, yb - 0.2, wb * 0.25], [gx1 + 0.2, yb - 0.2, wb * 0.25]], gnps, { mat: 'safetyYellow' })
  const comps: [number, string, number][] = [[0.15, 'ball', 0.08], [0.45, 'filter', 0.12], [0.8, 'reg', 0.16], [1.15, 'ssov', 0.13], [1.45, 'ssov', 0.13]]
  for (const [d, kind, s] of comps) {
    const x = g.gas.x - 0.1 - d
    if (x < gx1 + 0.2) continue
    if (kind === 'ball') {
      k.cyl('valveBody', god * 0.8, s * 1.5, [x, gy, gz - 0.15], 'x', 18)
      k.box('actuatorRed', [0.2, 0.02, 0.03], [x, gy + god * 0.8 + 0.03, gz - 0.07])
    } else if (kind === 'filter') k.rbox('aluminium', [s * 1.4, s * 1.6, s * 1.4], 0.02, [x, gy, gz - 0.15])
    else if (kind === 'reg') {
      k.cyl('castIron', god * 0.9, s * 1.4, [x, gy, gz - 0.15], 'x', 18)
      k.cyl(paint('#3d5f8f'), s * 0.9, s * 0.35, [x, gy + god + s * 0.2, gz - 0.15], 'y', 28)
    } else {
      k.rbox('aluminium', [s * 1.3, s * 1.1, s * 1.1], 0.02, [x, gy, gz - 0.15])
      k.rbox('actuatorYellow', [s * 0.9, s * 1.2, s * 0.9], 0.02, [x, gy + s * 1.15, gz - 0.15])
    }
  }
  for (const x of [g.gas.x - 0.05, gx1 + 0.12]) {
    k.box('galvanised', [0.06, gy - god / 2 - 0.15, 0.06], [x, 0.15 + (gy - god / 2 - 0.15) / 2, gz - 0.15])
    k.box('galvanised', [0.2, 0.012, 0.2], [x, 0.156, gz - 0.15])
  }
  if (p.fuel === 'dual') {
    k.tube('stainless', [[gx1 - 0.3, 0.6, -wb * 0.2], [gx1 - 0.3, yb - 0.1, -wb * 0.2], [xb - 0.95, yb - 0.1, -0.05]], 0.012)
    k.rbox(paint('#7a3b1d'), [0.4, 0.35, 0.3], 0.02, [gx1 - 0.3, 0.6, -wb * 0.2])
  }
  // control panel beside the burner
  const cx = xf - 1.55
  const cz = R + 0.15
  k.rbox(paint('#d9dbd6'), [0.8, 1.7, 0.35], 0.02, [cx, 0.15 + 0.1 + 0.85, cz])
  k.plane(textMaterial('BOILER  ' + Math.round(t) + ' t/h', '#0e1b2a', '#8fd0ff', 512, 96), 0.4, 0.08, [cx, 0.15 + 1.45, cz + 0.176])
  for (const [i, c] of ['#27c24a', '#e5b114', '#d22a1f'].entries()) k.cyl(paint(c, { emissive: c, emissiveIntensity: 0.5 }), 0.02, 0.02, [cx - 0.15 + i * 0.15, 0.15 + 1.25, cz + 0.18], 'z', 12)
  k.box(SK, [0.9, 0.1, 0.45], [cx, 0.2, cz])
  k.tube('cable', [[cx, 0.3, cz - 0.17], [cx + 0.3, 0.3, cz - 0.4], [xb - 0.6, yb - wb * 0.5 + 0.05, wb * 0.3]], 0.015)
  // top: main steam nozzle, safety valves with escape pipes, manway, air vent, pressure trim
  nozzle(k, { base: [g.sx, yS + R + 0.06, 0], dir: [0, 1, 0], nps: g.steamNps, rating: p.rating, standout: g.steamTop - (yS + R + 0.06), mat: jacket })
  gasket(k, g.steamNps, p.rating, [g.sx, g.steamTop + 0.00225, 0], 'y')
  for (const dz of [-0.35, 0.35]) {
    const x = 0.3 * L
    const vNps = g.steamNps >= 6 ? 3 : 2
    nozzle(k, { base: [x, yS + R + 0.05, dz], dir: [0, 1, 0], nps: vNps, rating: p.rating, standout: 0.22, mat: jacket })
    const yv = yS + R + 0.27
    k.cyl('valveBody', pipeOD(vNps) * 0.75, 0.25, [x, yv + 0.125, dz], 'y', 20)
    k.cyl('valveBody', pipeOD(vNps) * 0.5, 0.35, [x, yv + 0.42, dz], 'y', 16)
    k.cyl('actuatorRed', pipeOD(vNps) * 0.35, 0.08, [x, yv + 0.63, dz], 'y', 14)
    k.rod('handwheel', [x, yv + 0.55, dz], [x + 0.18, yv + 0.62, dz], 0.008, 6)
    pipeRun(k, [[x, yv + 0.15, dz], [x + 0.3, yv + 0.15, dz], [x + 0.3, yv + 2.4, dz]], vNps + 1, { mat: 'galvanised' })
    k.cyl('galvanised', pipeOD(vNps + 1) * 0.85, 0.3, [x + 0.3, yv + 0.5, dz], 'y', 16)
  }
  manway(k, [-0.15 * L, yS + R + 0.05, 0], [0, 1, 0], 0.15, 16, 300, jacket)
  k.cyl('valveBody', 0.03, 0.25, [0.42 * L, yS + R + 0.15, 0], 'y', 10)
  k.handwheel('handwheel', 0.1, [0.42 * L, yS + R + 0.29, 0], 'y', 4)
  k.tube('stainless', [[-0.3 * L, yS + R + 0.05, 0.3], [-0.3 * L, yS + R + 0.25, 0.3], [-0.3 * L + 0.1, yS + R + 0.25, 0.3], [-0.3 * L + 0.1, yS + R + 0.35, 0.3]], 0.008)
  gauge(k, [-0.3 * L + 0.1, yS + R + 0.42, 0.3], 'z', 0.15, 'bar', 25)
  for (const dx of [0.2, 0.35]) k.box('stainless', [0.1, 0.12, 0.1], [-0.3 * L + dx, yS + R + 0.12, 0.3])
  // water column with two gauge glasses and level controls on the +Z side near the front
  const wx = -0.38 * L
  const wz = R + 0.3
  const wy0 = yS - 0.1 * R
  const wy1 = yS + 0.55 * R
  k.cyl('castIron', 0.05, wy1 - wy0 + 0.3, [wx, (wy0 + wy1) / 2, wz], 'y', 16)
  for (const yy of [wy0, wy1]) pipeRun(k, [[wx, yy, wz], [wx, yy, R * Math.sqrt(1 - ((yy - yS) / R) ** 2) * 0.98]], 1)
  for (const dx of [-0.16, 0.16]) {
    k.box('stainless', [0.06, wy1 - wy0, 0.05], [wx + dx, (wy0 + wy1) / 2, wz + 0.04])
    k.box('glass', [0.025, wy1 - wy0 - 0.1, 0.01], [wx + dx, (wy0 + wy1) / 2, wz + 0.07])
    for (const yy of [wy0, wy1]) k.rod('stainless', [wx, yy - 0.05 + (yy === wy0 ? 0.1 : -0.1) * 0.5, wz], [wx + dx, yy - 0.05 + (yy === wy0 ? 0.1 : -0.1) * 0.5, wz + 0.04], 0.012, 8)
  }
  for (const yy of [yS + 0.05 * R, yS + 0.3 * R]) {
    k.cyl('castIron', 0.09, 0.3, [wx + 0.45, yy, wz], 'y', 20)
    k.rod('castIron', [wx, yy, wz], [wx + 0.45, yy, wz], 0.025, 8)
    k.rbox('actuatorBlue', [0.12, 0.12, 0.1], 0.01, [wx + 0.45, yy + 0.22, wz])
  }
  // feedwater nozzle with check and stop valves on the neck
  nozzle(k, { base: g.feed.base, dir: [0, 0, 1], nps: g.feedNps, rating: p.rating, standout: g.feed.standout, mat: jacket })
  // bottom blowdown: drain from the shell bottom, two blowdown valves, flanged outlet
  const bnps = g.bdNps
  const yBot = yS - R
  pipeRun(k, [[g.bd.x, yBot + 0.05, 0], [g.bd.x, g.bd.y, 0], [g.bd.x, g.bd.y, g.bd.z - 0.2]], bnps)
  nozzle(k, { base: [g.bd.x, g.bd.y, g.bd.z - 0.2], dir: [0, 0, 1], nps: bnps, rating: p.rating, standout: 0.2, mat: 'pipePaint' })
  for (const z of [R * 0.35, R * 0.75]) {
    k.cyl('valveBody', pipeOD(bnps) * 0.85, 0.14, [g.bd.x, g.bd.y, z], 'z', 16)
    k.rod('handwheel', [g.bd.x, g.bd.y + 0.05, z], [g.bd.x + 0.35, g.bd.y + 0.15, z], 0.012, 6)
  }
  // top access platform and ladder at the rear
  if (p.platform) {
    const yp = yS + R + 0.12
    const zc = -R + 0.2
    const x0 = 0.02 * L
    const x1 = L / 2 - 0.1
    for (const x of [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1]) {
      const zs = -Math.sqrt(R * R - (R * 0.35) ** 2)
      k.box(SK, [0.06, yp - (yS - zs * 0) - R * 0.94 + 0.06, 0.06], [x, (yp + yS + R * 0.94) / 2 - 0.03, -R * 0.35])
      member(k, [x, yp - 0.08, -R * 0.15], [x, yp - 0.08, zc - 0.45], 'UPN 120', 'galvanised', [0, 1, 0])
    }
    grating(k, [(x0 + x1) / 2, yp, zc], x1 - x0, 0.9)
    handrail(k, [[x1 - 0.6, yp, zc - 0.45], [x0, yp, zc - 0.45], [x0, yp, zc + 0.45]], 'safetyYellow')
    handrail(k, [[x1, yp, zc - 0.45], [x1, yp, zc + 0.45]], 'safetyYellow')
    ladder(k, [x1 - 0.3, 0.15, zc - 0.47], yp, [0, 0, -1])
  }
  // lifting lugs, earth boss, nameplate
  for (const x of [-0.42 * L, 0.42 * L]) for (const s of [-1, 1]) k.box(SK, [0.2, 0.18, 0.04], [x, 0.37 + 0.1, s * (R * 0.7 + 0.13)])
  earthBond(k, [skC - skL / 2 + 0.5, 0.15 + hk / 2, R * 0.7 + 0.11], [0, 0, 1], 0, 0.6)
  tagPlate(k, p.tag || `EN 12953  ${p.pressure} barg`, [-L / 2 - 0.545, yS + R * 0.78, 0], '-x', 0.3)
}
