/**
 * Field instruments.
 *
 * CONVENTIONS
 *   - origin = point on the OUTER SURFACE of the host pipe / vessel; the assembly extends along +Y
 *     (the lead orients +Y to the mounting direction). `hostOd` is the host OD — fittings (thredolet,
 *     sockolet, weldolet) are extended below y = 0 by the sagitta of the host curvature so they seat
 *     on the pipe without a gap.
 *   - FT and PDT assume the host PIPE AXIS is local X: the orifice flange pair of FT is centred on the
 *     host axis at (0, -hostOd/2, 0) and is oriented along X; PDT's two taps are at x = ±0.07.
 *   - LT / LG (bridle chamber): the chamber runs PARALLEL to the host surface along local +Z, standing
 *     off 0.4 m in +Y. Lower process connection at z = 0 (the origin), upper at z = size (default 1.2 m).
 *     The GWR head (LT) sits on top of the chamber, at the +Z end. So the lead must orient local +Z
 *     = UP for these two types (i.e. mount on a vertical surface with roll chosen so +Z is world up).
 *   - FIRE & GAS detectors (FD, GD, OGD, HD, SD, MAC — built in ./fireGas.ts) use the equipment-mount frame
 *     of piping/build.ts (`on: { equipment, at }`): origin = bracket / clamp on the structure, +Y = `dir`
 *     (horizontal standoff / aim), +Z = world UP, +X = dir × up. Wall-bracket types stand off along +Y
 *     (FD aims +Y tilted 20° down; OGD's optical axis is the local Y axis); HD / SD hang below a clamp
 *     plate (head facing −Z). `hostOd` is ignored for them.
 *   - every instrument carries a small stamped stainless tag plate when `tag` is given.
 *
 * Geometry is cached per (type, hostOd, size) and shared between instances.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { InstrumentType } from '../../model/types'
import { flange, pipeOD } from '../../model/catalog'
import { cached } from '../../three/pipeGeometry'
import { paint } from '../../three/materials'
import { Kit, mat4, type Built, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { flangedJoint, pipeFlange, smallGauge, tagPlate } from './machinery/parts'
import { dialMaterial, lcdMaterial, levelFlagMaterial, levelScaleMaterial } from './machinery/textures'
import { ValveModel } from './Valve'
import { FIRE_GAS, buildFireGas, faceOut, fireGasTagPos } from './fireGas'

const SS: MatKey = 'stainless'
const HOUSING: MatKey = 'actuatorBlue'
const FS: MatKey = 'flangeSteel'
/** brushed stainless enclosure */
const CABINET: MatKey = paint('#c9ced2', 'detail', { metalness: 0.55, roughness: 0.38 })

const sagitta = (hostOd: number, w: number) => {
  const R = Math.max(hostOd / 2, w * 1.05)
  return R - Math.sqrt(R * R - w * w)
}

/** Weldolet/thredolet at x,z seated on the host. Returns the top height. */
function olet(k: Kit, hostOd: number, x = 0, z = 0, w = 0.022, h = 0.045) {
  const s = sagitta(hostOd, w * 1.35) + 0.004
  k.lathe(FS, [
    [w * 1.35, -s],
    [w * 1.3, 0.004],
    [w * 1.05, h * 0.55],
    [w * 0.85, h],
    [0.0, h],
  ], [x, 0, z], 'y', 20)
  return h
}

/** Small instrument root valve (bar-stock ball valve), vertical flow, T-handle on +Z. Returns top. */
function rootValve(k: Kit, y0: number, x = 0, z = 0, handleDir: 1 | -1 = 1) {
  k.hex(SS, 0.03, 0.02, [x, y0 + 0.01, z])
  k.box(SS, [0.04, 0.045, 0.04], [x, y0 + 0.042, z])
  k.hex(SS, 0.03, 0.02, [x, y0 + 0.075, z])
  k.cyl(SS, 0.007, 0.05, [x, y0 + 0.042, z + handleDir * 0.04], 'z', 8)
  k.box('actuatorRed', [0.09, 0.012, 0.012], [x + 0.035, y0 + 0.042, z + handleDir * 0.068])
  return y0 + 0.085
}

/** Valve manifold block with N handles, vertical. Returns top. */
function manifoldBlock(k: Kit, y0: number, n: 2 | 3 | 5, x = 0, w = 0.06) {
  const h = 0.06
  k.box(SS, [n === 2 ? w : w * 1.8, h, 0.045], [x, y0 + h / 2, 0])
  const xs = n === 2 ? [0] : n === 3 ? [-w * 0.6, 0, w * 0.6] : [-w * 0.7, -w * 0.35, 0, w * 0.35, w * 0.7]
  xs.forEach((dx, i) => {
    const zSide = n === 2 && i === 0 ? 1 : i % 2 === 0 ? 1 : -1
    k.cyl(SS, 0.008, 0.03, [x + dx, y0 + h / 2, zSide * 0.035], 'z', 8)
    k.cyl(i === Math.floor(xs.length / 2) && n > 2 ? 'actuatorRed' : 'handwheel', 0.006, 0.05, [x + dx, y0 + h / 2, zSide * 0.052], 'x', 8)
  })
  // vent / test port with plug
  k.hex('brass', 0.016, 0.012, [x + (n === 2 ? w / 2 : w * 0.9) + 0.006, y0 + h * 0.3, 0], 'x')
  return y0 + h
}

/**
 * Coplanar DP/GP transmitter (Rosemount 3051-style): coplanar flange at y0, sensor module,
 * dual-compartment electronics housing (axis along Z) with LCD cover facing +Z, cable gland + cable.
 */
function transmitter(k: Kit, y0: number, x = 0, cable = true) {
  // coplanar flange + bolts
  k.box(SS, [0.085, 0.022, 0.055], [x, y0 + 0.011, 0])
  for (const dx of [-0.032, 0.032]) for (const dz of [-0.02, 0.02]) k.hex('nut', 0.012, 0.01, [x + dx, y0 + 0.027, dz])
  // sensor module
  k.cyl(SS, 0.042, 0.075, [x, y0 + 0.022 + 0.0375, 0], 'y', 24)
  k.cyl(SS, 0.02, 0.025, [x, y0 + 0.11, 0], 'y', 16)
  // housing
  const yh = y0 + 0.16
  k.cyl(HOUSING, 0.048, 0.1, [x, yh, 0], 'z', 28)
  k.cyl(HOUSING, 0.053, 0.026, [x, yh, 0.058], 'z', 28)
  k.cyl(HOUSING, 0.053, 0.026, [x, yh, -0.058], 'z', 28)
  k.torus(HOUSING, 0.044, 0.005, [x, yh, 0.0715], 'z', 6, 24)
  k.add(lcdMaterial(), new THREE.CircleGeometry(0.036, 24), mat4([x, yh, 0.0715], new THREE.Quaternion()))
  k.disc('glass', 0.039, [x, yh, 0.073], 'z', 24)
  // conduit entry + gland on +X
  k.cyl(HOUSING, 0.014, 0.03, [x + 0.055, yh, 0.02], 'x', 10)
  k.hex('brass', 0.026, 0.02, [x + 0.078, yh, 0.02], 'x')
  k.cyl('brass', 0.01, 0.02, [x + 0.095, yh, 0.02], 'x', 10)
  k.hex('brass', 0.022, 0.012, [x - 0.055, yh, 0.02], '-x') // blanking plug
  // stainless nameplate wire-tag on housing
  k.box('nameplate', [0.05, 0.02, 0.002], [x, yh + 0.049, 0], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2))
  if (cable)
    k.spline('cable', [[x + 0.105, yh, 0.02], [x + 0.17, yh - 0.02, 0.03], [x + 0.22, yh - 0.12, 0.06], [x + 0.25, 0.05, 0.12]], 0.0065, 6, 30)
  return yh + 0.05
}

function pressureTx(k: Kit, hostOd: number, kind: 'PT' | 'PI') {
  let y = olet(k, hostOd)
  y = rootValve(k, y)
  k.cyl(SS, 0.009, 0.05, [0, y + 0.025, 0], 'y', 10)
  y = manifoldBlock(k, y + 0.05, 2)
  transmitter(k, y, 0, kind === 'PT')
  if (kind === 'PI') {
    // local indicator: big LCD window on top cover, no cable (loop-powered display)
    k.cyl('brass', 0.008, 0.03, [0.06, y + 0.16, 0.02], 'x', 8)
  }
}

function dpTx(k: Kit, hostOd: number) {
  const dx = 0.07
  for (const s of [-1, 1]) {
    const y = olet(k, hostOd, s * dx, 0, 0.018, 0.04)
    rootValve(k, y, s * dx, 0, s > 0 ? 1 : -1)
  }
  // impulse tubing from both roots into a 3-valve manifold above the centre
  const ym = 0.26
  for (const s of [-1, 1]) k.tube('tubing', [[s * dx, 0.125, 0], [s * dx, 0.18, 0], [s * 0.035, 0.22, 0], [s * 0.035, ym, 0]], 0.006)
  const y = manifoldBlock(k, ym, 3, 0, 0.05)
  transmitter(k, y)
  // H / L stamping plates
  k.box('nameplate', [0.012, 0.012, 0.002], [-0.035, ym + 0.03, 0.024])
  k.box('nameplate', [0.012, 0.012, 0.002], [0.035, ym + 0.03, 0.024])
}

function pressureGauge(k: Kit, hostOd: number) {
  let y = olet(k, hostOd)
  y = rootValve(k, y)
  // siphon (pigtail) — coil in the XY plane
  k.cyl(SS, 0.007, 0.03, [0, y + 0.015, 0], 'y', 8)
  const R = 0.028
  k.torus(SS, R, 0.0055, [R, y + 0.03 + R, 0], 'z', 8, 28, Math.PI * 2)
  k.cyl(SS, 0.007, 0.04, [0, y + 0.03 + 2 * R + 0.02, 0], 'y', 8)
  y = y + 0.03 + 2 * R + 0.04
  // gauge block valve + socket
  k.hex(SS, 0.026, 0.02, [0, y + 0.01, 0])
  k.cyl(SS, 0.009, 0.02, [0, y + 0.03, 0], 'y', 8)
  // 100 mm gauge, bottom connection, dial facing +Z
  const d = 0.1
  smallGauge(k, [0, y + 0.04 + d / 2, 0], 'z', dialMaterial('bar', 100), d)
  // blow-out back
  k.cyl('rubberBlack', d * 0.18, 0.004, [0, y + 0.04 + d / 2, -d * 0.17], 'z', 16)
}

/** Thermowell nozzle (1.5" flanged) + extension, returns top y. */
function thermowell(k: Kit, hostOd: number) {
  const nps = 1.5
  const r = pipeOD(nps) / 2
  const s = sagitta(hostOd, r * 1.1) + 0.004
  k.cyl(FS, r * 1.1, 0.03 + s, [0, (0.03 - s) / 2, 0], 'y', 20)
  k.cyl('equipmentPaint', r, 0.09, [0, 0.03 + 0.045, 0], 'y', 20)
  const f = flange(nps, 300)
  const yJoint = 0.03 + 0.09 + f.length
  pipeFlange(k, nps, 300, [0, yJoint - 0.002, 0], 'y')
  // thermowell flange (blind-style, raised face down) with studs
  k.cyl(FS, f.od / 2, f.thickness, [0, yJoint + 0.002 + f.thickness / 2, 0], 'y', 28)
  k.cyl('gasket', f.raisedFaceDia / 2, 0.004, [0, yJoint, 0], 'y', 20)
  k.boltCircle('boltXylan', 'nut', f.bolts, f.boltCircle / 2, [0, yJoint - f.thickness - 0.02, 0], 'y', f.boltDia, 2 * f.thickness + 0.045, [0.01, 2 * f.thickness + 0.035])
  // lagging extension + union
  let y = yJoint + 0.002 + f.thickness
  k.hex(SS, 0.032, 0.02, [0, y + 0.01, 0])
  k.cyl(SS, 0.011, 0.09, [0, y + 0.065, 0], 'y', 10)
  k.hex(SS, 0.034, 0.022, [0, y + 0.12, 0])
  y += 0.13
  return y
}

function tempTx(k: Kit, hostOd: number) {
  const y = thermowell(k, hostOd)
  // head-mounted transmitter housing (dual compartment, axis along Y) with LCD on top
  k.cyl(SS, 0.012, 0.03, [0, y + 0.015, 0], 'y', 10)
  const yh = y + 0.075
  k.cyl(HOUSING, 0.05, 0.075, [0, yh, 0], 'y', 28)
  k.cyl(HOUSING, 0.055, 0.022, [0, yh + 0.045, 0], 'y', 28)
  k.cyl(HOUSING, 0.055, 0.02, [0, yh - 0.04, 0], 'y', 28)
  k.disc(lcdMaterial(), 0.036, [0, yh + 0.0565, 0], 'y', 24)
  k.disc('glass', 0.04, [0, yh + 0.058, 0], 'y', 24)
  k.hex('brass', 0.026, 0.02, [0.06, yh - 0.005, 0], 'x')
  k.spline('cable', [[0.07, yh - 0.005, 0], [0.14, yh - 0.03, 0.02], [0.2, yh - 0.2, 0.06], [0.24, 0.05, 0.12]], 0.0065, 6, 30)
}

function tempGauge(k: Kit, hostOd: number) {
  const y = thermowell(k, hostOd)
  // bimetal "every-angle" thermometer: stem + swivel + 100 mm dial facing +Z
  k.cyl(SS, 0.008, 0.06, [0, y + 0.03, 0], 'y', 10)
  k.sphere(SS, 0.014, [0, y + 0.065, 0], undefined, 12)
  const d = 0.1
  smallGauge(k, [0, y + 0.07 + d / 2, -0.01], 'z', dialMaterial('°C', 200), d)
}

/** Bridle chamber (3") along +Z standing off `off` in +Y, with two isolation branches. */
function bridle(k: Kit, hostOd: number, H: number, off = 0.4) {
  const nps = 3
  const r = pipeOD(nps) / 2
  const z0 = -0.18
  const z1 = H + 0.2
  // chamber
  k.cyl('pipePaint', r, z1 - z0, [0, off, (z0 + z1) / 2], 'z', 24)
  // bottom: blind flange + drain valve
  flangedJoint(k, nps, 300, [0, off, z0 - 0.002], 'z')
  // (the lower flange of the joint is a blind: cap it)
  const f = flange(nps, 300)
  k.cyl(FS, f.od / 2, f.thickness, [0, off, z0 - 0.03 - f.thickness], 'z', 28)
  k.cyl(SS, 0.012, 0.08, [0, off, z0 - 0.05 - f.thickness], 'z', 10)
  k.box(SS, [0.04, 0.04, 0.04], [0, off, z0 - 0.1 - f.thickness])
  k.box('actuatorRed', [0.09, 0.01, 0.01], [0.04, off + 0.03, z0 - 0.1 - f.thickness])
  // top flange
  flangedJoint(k, nps, 300, [0, off, z1 + 0.002], 'z')
  // vent connection
  k.cyl(SS, 0.01, 0.08, [r + 0.03, off, z1 - 0.12], 'x', 10)
  k.box(SS, [0.035, 0.035, 0.035], [r + 0.08, off, z1 - 0.12])
  // process branches (1"): host -> chamber at z = 0 and z = H; isolation valve rendered separately
  for (const z of [0, H]) {
    olet(k, hostOd, 0, z, 0.025, 0.04)
    k.cyl('pipePaint', pipeOD(1) / 2, 0.06, [0, 0.07, z], 'y', 14)
    k.cyl('pipePaint', pipeOD(1) / 2, off - 0.28, [0, 0.25 + (off - 0.28) / 2, z], 'y', 14)
  }
  // chamber guides / clamps every metre
  for (let z = 0.5; z < H; z += 1.0) k.torus('nut', r + 0.004, 0.006, [0, off, z], 'z', 6, 24)
  return { z0, z1, r, off, f }
}

function guidedWaveRadar(k: Kit, hostOd: number, H: number) {
  const b = bridle(k, hostOd, H)
  const zt = b.z1 + 0.004 + b.f.length
  // GWR process seal + housing (Rosemount 5300-style, angled dual compartment) pointing +Z
  k.cyl(SS, 0.03, 0.05, [0, b.off, zt + 0.025], 'z', 16)
  k.hex(SS, 0.06, 0.03, [0, b.off, zt + 0.065], 'z')
  k.cyl(SS, 0.02, 0.05, [0, b.off, zt + 0.105], 'z', 12)
  const zh = zt + 0.17
  k.cyl(HOUSING, 0.06, 0.12, [0, b.off, zh], 'z', 28)
  for (const s of [-1, 1]) k.cyl(HOUSING, 0.055, 0.12, [s * 0.075, b.off, zh + 0.02], 'x', 28)
  k.cyl(HOUSING, 0.062, 0.025, [0.14, b.off, zh + 0.02], 'x', 28)
  k.cyl(HOUSING, 0.062, 0.025, [-0.14, b.off, zh + 0.02], 'x', 28)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))
  k.add(lcdMaterial(), new THREE.CircleGeometry(0.042, 24), mat4([0.1535, b.off, zh + 0.02], q))
  k.hex('brass', 0.028, 0.02, [0, b.off - 0.07, zh + 0.02], '-y')
  k.spline('cable', [[0, b.off - 0.08, zh + 0.02], [0, b.off - 0.15, zh - 0.05], [0.05, b.off - 0.2, zh - 0.4], [0.1, b.off - 0.25, zh - 0.9]], 0.0065, 6, 30)
}

function magneticGauge(k: Kit, hostOd: number, H: number) {
  const b = bridle(k, hostOd, H)
  // indicator rail on the outer (+Y) side of the chamber: flags + scale, covered with a glass window
  const len = H + 0.1
  const zc = H / 2
  const yr = b.off + b.r + 0.02
  k.box(SS, [0.06, 0.03, len + 0.04], [0, yr, zc])
  const basis = (x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, p: V3) => new THREE.Matrix4().makeBasis(x, y, z).setPosition(...p)
  // plane faces +Y (its +Z), with texture-up along +Z
  const m = basis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), [0.008, yr + 0.0155, zc])
  k.add(levelFlagMaterial(0.55), new THREE.PlaneGeometry(0.03, len), m)
  const m2 = basis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), [-0.022, yr + 0.0155, zc])
  k.add(levelScaleMaterial(), new THREE.PlaneGeometry(0.022, len), m2)
  k.box('glass', [0.058, 0.004, len], [0, yr + 0.018, zc])
  for (const z of [0.1, H / 2, H - 0.05]) k.box(SS, [0.08, 0.04, 0.025], [0, yr - 0.01, z])
  // top float-stop cap
  k.cyl(FS, 0.07, 0.02, [0, b.off, b.z1 + 0.004 + b.f.length + 0.01], 'z', 24)
}

function orificeFt(k: Kit, hostOd: number) {
  // orifice flange pair centred on the host pipe axis (assumed local X)
  const nps = Math.max(2, closestNps(hostOd))
  const r = pipeOD(nps) / 2
  const yc = -r
  const f = flangedJoint(k, nps, 300, [0, yc, 0], 'x')
  // orifice plate paddle (tab) protruding up between the flanges
  k.box(SS, [0.003, f.od / 2 + 0.06 - (f.raisedFaceDia / 2), 0.05], [0, yc + (f.od / 2 + 0.06 + f.raisedFaceDia / 2) / 2, 0])
  k.box(SS, [0.004, 0.035, 0.07], [0, yc + f.od / 2 + 0.06, 0])
  // jack screws
  for (const s of [-1, 1]) k.cyl('boltXylan', 0.007, 0.06, [0, yc + s * 0.0, s * (f.od / 2 + 0.005)], 'x', 6)
  // flange taps (1/2") on top of each flange -> root valves -> impulse lines up to 5-valve manifold
  const tx = f.thickness / 2 + 0.006
  const ytap = yc + f.od / 2
  for (const s of [-1, 1]) {
    k.cyl(SS, 0.011, 0.04, [s * tx, ytap + 0.02, 0], 'y', 10)
    rootValve(k, ytap + 0.04, s * tx * 2.5, 0, s > 0 ? 1 : -1)
    k.tube('tubing', [[s * tx, ytap + 0.04, 0], [s * tx * 2.5, ytap + 0.045, 0]], 0.006)
    k.tube('tubing', [[s * tx * 2.5, ytap + 0.125, 0], [s * tx * 2.5, ytap + 0.2, 0], [s * 0.035, ytap + 0.25, 0], [s * 0.035, ytap + 0.3, 0]], 0.006)
  }
  const y = manifoldBlock(k, ytap + 0.3, 5, 0, 0.05)
  transmitter(k, y)
}

function closestNps(od: number) {
  const sizes = [2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24]
  let best = sizes[0]
  for (const s of sizes) if (Math.abs(pipeOD(s) - od) < Math.abs(pipeOD(best) - od)) best = s
  return best
}

function analyser(k: Kit, hostOd: number) {
  let y = olet(k, hostOd, 0, 0, 0.025, 0.05)
  // retractable sample probe + isolation ball valve
  k.cyl(FS, 0.03, 0.03, [0, y + 0.015, 0], 'y', 16)
  k.box(SS, [0.07, 0.07, 0.07], [0, y + 0.065, 0])
  k.box('actuatorRed', [0.14, 0.014, 0.014], [0.06, y + 0.11, 0])
  k.cyl(SS, 0.014, 0.2, [0, y + 0.2, 0], 'y', 12)
  y += 0.3
  // sample conditioning plate + analyser enclosure with window and sunshade
  const W = 0.42
  const Hh = 0.5
  const D = 0.24
  const yc = y + Hh / 2 + 0.05
  k.box(SS, [0.06, 0.08, 0.06], [0, y + 0.02, 0])
  k.rbox(CABINET, [W, Hh, D], 0.015, [0, yc, 0])
  k.box('glass', [W * 0.55, Hh * 0.4, 0.006], [0, yc + Hh * 0.12, D / 2 + 0.003])
  k.box('displayLcd', [W * 0.3, Hh * 0.14, 0.004], [0, yc + Hh * 0.15, D / 2 + 0.001])
  for (const s of [-1, 1]) k.box('nut', [0.02, 0.05, 0.02], [s * (W / 2 + 0.008), yc + s * 0.1, D / 2 - 0.03])
  k.box('flangeSteel', [W + 0.16, 0.01, D + 0.2], [0, yc + Hh / 2 + 0.07, 0.03], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.12))
  for (const s of [-1, 1]) k.rod(SS, [s * W / 2, yc + Hh / 2, -D / 2], [s * W / 2, yc + Hh / 2 + 0.06, -D / 2], 0.006, 6)
  // sample in/out tubing + vent, cable glands
  k.tube('tubing', [[0.02, y + 0.06, 0], [0.12, y + 0.06, 0], [0.12, yc - Hh / 2, 0]], 0.004)
  k.tube('tubing', [[-0.12, yc - Hh / 2, 0], [-0.12, y - 0.05, 0], [-0.04, y - 0.12, 0], [-0.04, 0.05, 0]], 0.004)
  for (const dx of [-0.08, 0, 0.08]) k.hex('brass', 0.022, 0.02, [dx + 0.05, yc - Hh / 2 - 0.01, -D / 4])
  k.spline('cable', [[0.13, yc - Hh / 2 - 0.02, -D / 4], [0.2, yc - Hh / 2 - 0.15, -D / 4], [0.3, 0.05, -0.1]], 0.0065, 6, 24)
}

function buildInstrument(type: InstrumentType, hostOd: number, size: number): Built {
  const k = new Kit()
  if (FIRE_GAS.has(type)) {
    // keep glass / nameplate: detector windows and lenses must not turn into polished steel
    k.alias = { tubing: SS, boltXylan: 'nut', gasket: 'nut', handwheel: 'nut', equipmentPaint: 'pipePaint' }
    buildFireGas(k, type)
    return k.build()
  }
  // instruments are numerous: fold minor accessory materials into the main ones (fewer draw groups)
  k.alias = { tubing: SS, nameplate: SS, glass: SS, boltXylan: 'nut', gasket: 'nut', handwheel: 'nut', equipmentPaint: 'pipePaint' }
  switch (type) {
    case 'PT':
    case 'PI':
      pressureTx(k, hostOd, type)
      break
    case 'PDT':
      dpTx(k, hostOd)
      break
    case 'PG':
      pressureGauge(k, hostOd)
      break
    case 'TT':
      tempTx(k, hostOd)
      break
    case 'TG':
      tempGauge(k, hostOd)
      break
    case 'LT':
      guidedWaveRadar(k, hostOd, size)
      break
    case 'LG':
      magneticGauge(k, hostOd, size)
      break
    case 'FT':
      orificeFt(k, hostOd)
      break
    case 'AT':
      analyser(k, hostOd)
      break
  }
  return k.build()
}

export function instrumentGeometry(type: InstrumentType, hostOd: number, size?: number) {
  const s = size ?? 1.2
  const od = FIRE_GAS.has(type) ? 0 : hostOd
  return cached(`inst|${type}|${od.toFixed(3)}|${type === 'LT' || type === 'LG' ? s.toFixed(2) : 0}`, () => buildInstrument(type, od, s))
}

function tagGeometry(tag: string, type: InstrumentType, size: number) {
  return cached(`insttag|${tag}|${type}|${size.toFixed(2)}`, () => {
    const k = new Kit()
    if (FIRE_GAS.has(type)) {
      // plate facing +Y (out from the structure), text upright (+Z = world up), wired to the bracket
      const { pos, anchor } = fireGasTagPos(type)
      k.with(faceOut(pos), () => tagPlate(k, tag, [0, 0, 0], 'z', 0.075))
      k.rod('stainless', [pos[0], pos[1], pos[2] + 0.012], anchor, 0.0008, 4)
      return k.build()
    }
    // wire-hung near the root valve / chamber
    const pos: V3 = type === 'LT' || type === 'LG' ? [0.09, 0.4, 0.3] : type === 'FT' ? [0.0, 0.06, 0.11] : type === 'TT' || type === 'TG' ? [0, 0.17, 0.06] : [0, 0.07, 0.035]
    const normal = type === 'LT' || type === 'LG' ? 'x' : 'z'
    tagPlate(k, tag, pos, normal, 0.075)
    k.rod('stainless', [pos[0], pos[1] + 0.012, pos[2] - (normal === 'z' ? 0.002 : 0)], [pos[0] * 0.6, pos[1] + 0.035, pos[2] * 0.6], 0.0008, 4)
    return k.build()
  })
}

export function InstrumentModel(props: { type: InstrumentType; hostOd: number; tag?: string; size?: number }) {
  const { type, hostOd, tag, size = 1.2 } = props
  const geo = useMemo(() => instrumentGeometry(type, hostOd, size), [type, hostOd, size])
  const tagGeo = useMemo(() => (tag ? tagGeometry(tag, type, size) : null), [tag, type, size])
  const bridle = type === 'LT' || type === 'LG'
  return (
    <group>
      <KitMesh data={geo} />
      {tagGeo && <KitMesh data={tagGeo} shadows={false} />}
      {bridle &&
        [0, size].map((z) => (
          // 1" isolation gate valve on each bridle branch; flow axis X -> +Y, stem towards -X
          <group key={z} position={[0, 0.175, z]} rotation-z={Math.PI / 2}>
            <ValveModel type="gate" nps={1} />
          </group>
        ))}
    </group>
  )
}
