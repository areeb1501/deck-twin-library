/**
 * Fire & gas detectors (FD, GD, OGD, HD, SD, MAC) built into a Kit, used by Instrument.tsx.
 *
 * MOUNTING FRAME (src/scene/piping/build.ts, instruments with `on: { equipment, at }`):
 *   origin = the mounting point on the structure, local +Y = `dir` (horizontal standoff / aim away
 *   from the steel or wall the bracket is bolted to), local +Z = world up, local +X = dir × up.
 *   Every model puts its bracket / clamp at the origin:
 *   - wall-bracket types (FD, GD, OGD, MAC): a stainless plate in the XZ plane at y = 0…0.008,
 *     the detector stands off along +Y;
 *   - ceiling types (HD, SD): a clamp plate in the XY plane at z = −0.008…0 (underside of steel),
 *     the head hangs below (−Z).
 *   - FD looks along +Y tilted 20° down (matches the coverage cone in FireGasOverlay); OGD's optical
 *     axis is the local Y axis through the origin, so the overlay beam (mount-to-mount) leaves its lens.
 * Sizes are true to life or slightly generous; colour and silhouette carry readability at 3–8 m.
 */
import * as THREE from 'three'
import { paint, registerMaterial } from '../../three/materials'
import { Kit, mat4, type MatKey, type V3 } from './machinery/kit'

const SS: MatKey = 'stainless'
const RED: MatKey = 'actuatorRed'
const YEL: MatKey = 'actuatorYellow'
const LENS: MatKey = paint('#15202b', 'detail', { metalness: 0.3, roughness: 0.06 })
const WHITE: MatKey = paint('#eceae4', 'detail', { metalness: 0.05, roughness: 0.55 })
const LED_GREEN: MatKey = paint('#2bff6e', 'detail', { emissive: '#2bff6e', emissiveIntensity: 0.9, roughness: 0.3 })
const LED_RED: MatKey = paint('#ff3b30', 'detail', { emissive: '#ff3b30', emissiveIntensity: 0.9, roughness: 0.3 })

export const FIRE_GAS = new Set(['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'])

const V = (p: V3) => new THREE.Vector3(...p)
/** plane-facing frame: local +Z → +Y (out), local +Y → +Z (up), so textures read upright from the front */
export const faceOut = (p: V3) => new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)).setPosition(...p)

// ------------------------------------------------------------------ textures

const texCache = new Map<string, THREE.MeshStandardMaterial>()
function canvasMaterial(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  let m = texCache.get(key)
  if (m) return m
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  m = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.1, roughness: 0.45 })
  m.name = key
  registerMaterial(m, 'detail')
  texCache.set(key, m)
  return m
}

/** Manual call point front: red frame, white break-glass window with the "house + hand" pictogram. */
function macFaceMaterial() {
  return canvasMaterial('fg-mac-face', 256, 256, (g) => {
    g.fillStyle = '#c22a20'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#f4f2ec'
    g.fillRect(34, 34, 188, 188)
    g.strokeStyle = '#1a1a1a'
    g.lineWidth = 6
    g.strokeRect(46, 46, 164, 164)
    // house outline
    g.lineWidth = 8
    g.strokeStyle = '#c22a20'
    g.beginPath()
    g.moveTo(80, 120)
    g.lineTo(128, 74)
    g.lineTo(176, 120)
    g.moveTo(92, 110)
    g.lineTo(92, 170)
    g.lineTo(164, 170)
    g.lineTo(164, 110)
    g.stroke()
    // pushing hand (simplified) + "PUSH"
    g.fillStyle = '#c22a20'
    g.beginPath()
    g.arc(128, 140, 16, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#1a1a1a'
    g.font = 'bold 30px Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('PUSH', 128, 198)
    g.fillStyle = '#ffffff'
    g.font = 'bold 22px Arial, sans-serif'
    g.fillText('FIRE', 128, 18)
  })
}

/** Gas detector display: 0 %LEL readout with bar graph. */
function gdLcdMaterial() {
  return canvasMaterial('fg-gd-lcd', 256, 256, (g) => {
    g.fillStyle = '#9fb59a'
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#1c2a1d'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 84px "Courier New", monospace'
    g.fillText('0', 128, 106)
    g.font = 'bold 34px Arial, sans-serif'
    g.fillText('%LEL', 128, 172)
    g.font = 'bold 22px Arial, sans-serif'
    g.fillText('CH4', 128, 52)
    g.fillRect(56, 200, 144, 5)
  })
}

/** Yellow / black hazard sign plate above the call point. */
function macSignMaterial() {
  return canvasMaterial('fg-mac-sign', 512, 256, (g) => {
    g.fillStyle = '#f2c318'
    g.fillRect(0, 0, 512, 256)
    // black/yellow hazard border
    g.save()
    g.beginPath()
    g.rect(0, 0, 512, 256)
    g.rect(22, 22, 468, 212)
    g.clip('evenodd')
    g.fillStyle = '#141414'
    for (let x = -256; x < 768; x += 44) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x + 22, 0)
      g.lineTo(x - 234, 256)
      g.lineTo(x - 256, 256)
      g.closePath()
      g.fill()
    }
    g.restore()
    g.fillStyle = '#141414'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 74px Arial, sans-serif'
    g.fillText('FIRE ALARM', 256, 104)
    g.font = 'bold 44px Arial, sans-serif'
    g.fillText('CALL POINT', 256, 176)
  })
}

// ------------------------------------------------------------------ shared bits

/** Stainless wall plate at the origin (XZ plane), 4 fixing bolts. */
function wallPlate(k: Kit, w: number, h: number, zc = 0) {
  k.box(SS, [w, 0.008, h], [0, 0.004, zc])
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.hex('nut', 0.016, 0.008, [sx * (w / 2 - 0.014), 0.012, zc + sz * (h / 2 - 0.014)], 'y')
}

/** Stainless clamp plate under steel at the origin (XY plane), 2 clamp bolts. */
function ceilingPlate(k: Kit, s: number) {
  k.box(SS, [s, s, 0.008], [0, 0, -0.004])
  for (const sx of [-1, 1]) k.hex('nut', 0.018, 0.01, [sx * (s / 2 - 0.016), 0, -0.013], 'z')
}

function cable(k: Kit, pts: V3[]) {
  k.spline('cable', pts, 0.0065, 6, 24)
}

// ------------------------------------------------------------------ detectors

/** IR3 flame detector on a swivel mount, aimed along +Y tilted 20° down, with a weather hood. */
function flameDetector(k: Kit) {
  wallPlate(k, 0.1, 0.16)
  const tilt = (20 * Math.PI) / 180
  const aim = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt))
  const up = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt))
  const O = new THREE.Vector3(0, 0.075, 0.075)
  const ball = O.clone().addScaledVector(up, -0.082).addScaledVector(aim, 0.045)
  const b: V3 = [0, ball.y, ball.z]
  // swivel arm + ball joint + clamp collar
  k.rod(SS, [0, 0.008, b[2]], b, 0.012, 12)
  k.box(SS, [0.04, 0.012, 0.04], [0, 0.014, b[2]])
  k.sphere(SS, 0.02, b, undefined, 14)
  const neck = O.clone().addScaledVector(up, -0.062).addScaledVector(aim, 0.045)
  k.rod(SS, b, [0, neck.y, neck.z], 0.01, 10)
  k.hex('nut', 0.03, 0.012, [0, (ball.y + neck.y) / 2, (ball.z + neck.z) / 2], [0, neck.y - ball.y, neck.z - ball.z])
  const F = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), aim, up).setPosition(O)
  k.with(F, () => {
    k.cyl(RED, 0.058, 0.02, [0, 0.01, 0], 'y', 24) // rear cover
    k.cyl(RED, 0.065, 0.11, [0, 0.075, 0], 'y', 28) // Ex d housing
    k.torus(RED, 0.065, 0.004, [0, 0.03, 0], 'y', 6, 28)
    k.cyl(SS, 0.068, 0.018, [0, 0.139, 0], 'y', 28) // front bezel
    k.disc(LENS, 0.058, [0, 0.1485, 0], 'y', 28)
    // three IR sensor windows + BIT lamp + status LED under a shallow dome
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 3
      const p: V3 = [Math.cos(a) * 0.03, 0.149, Math.sin(a) * 0.03]
      k.cyl(SS, 0.015, 0.004, p, 'y', 16)
      k.dome(LENS, 0.012, [p[0], 0.151, p[2]], 'y', Math.PI / 2, 0.55, 14)
    }
    k.sphere(LED_GREEN, 0.006, [0, 0.151, 0], undefined, 10)
    k.dome('glass', 0.054, [0, 0.149, 0], 'y', Math.PI / 2, 0.22, 24)
    // weather hood over the top half of the window
    k.lathe(RED, [
      [0.07, 0.1],
      [0.075, 0.1],
      [0.075, 0.205],
      [0.07, 0.205],
      [0.07, 0.1],
    ], [0, 0, 0], 'y', 20, -0.6 * Math.PI, 1.2 * Math.PI)
    // nameplate + cable gland underneath
    k.box('nameplate', [0.002, 0.05, 0.03], [0.066, 0.075, 0])
    k.hex('brass', 0.03, 0.02, [0, 0.04, -0.072], 'z')
  })
  const gl = V([0, 0.04, -0.085]).applyMatrix4(F)
  cable(k, [[0, gl.y, gl.z], [0, gl.y - 0.01, gl.z - 0.04], [0.02, 0.02, -0.11], [0.025, 0.016, -0.45]])
}

/** Point IR gas detector: Ex d transmitter on a wall plate, sensor pointing down with splash guard + cal port. */
function pointGasDetector(k: Kit) {
  wallPlate(k, 0.12, 0.2)
  const yc = 0.067
  // mounting lugs + housing (cover faces +Y)
  k.box(SS, [0.16, 0.012, 0.03], [0, 0.014, 0.02])
  k.cyl(YEL, 0.062, 0.085, [0, yc - 0.005, 0], 'y', 28)
  k.cyl(YEL, 0.066, 0.022, [0, yc + 0.048, 0], 'y', 28)
  k.torus('nut', 0.058, 0.004, [0, yc + 0.06, 0], 'y', 6, 28)
  k.with(faceOut([0, yc + 0.0595, 0]), () => {
    k.add(gdLcdMaterial(), new THREE.CircleGeometry(0.034, 24), mat4([0, 0, 0]))
  })
  k.disc('glass', 0.04, [0, yc + 0.061, 0], 'y', 24)
  k.sphere(LED_GREEN, 0.005, [0.045, yc + 0.059, 0.02], undefined, 8)
  // sensor down (−Z): adaptor, sensor body, splash guard with sinter disc, calibration port
  k.cyl(YEL, 0.03, 0.02, [0, yc, -0.068], 'z', 18)
  k.hex(SS, 0.05, 0.016, [0, yc, -0.085], 'z')
  k.cyl(SS, 0.026, 0.1, [0, yc, -0.142], 'z', 20)
  k.lathe('rubberBlack', [
    [0.026, 0],
    [0.039, 0],
    [0.039, 0.075],
    [0.033, 0.075],
    [0.033, 0.006],
    [0.026, 0.006],
    [0.026, 0],
  ], [0, yc, -0.175], '-z', 24)
  k.disc(SS, 0.025, [0, yc, -0.19], '-z', 18)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.box(SS, [0.006, 0.006, 0.03], [Math.cos(a) * 0.04, yc + Math.sin(a) * 0.04, -0.22], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a))
  }
  k.cyl(SS, 0.007, 0.03, [0, yc + 0.052, -0.23], 'y', 10)
  k.cyl(RED, 0.01, 0.014, [0, yc + 0.072, -0.23], 'y', 12)
  // cable gland on the side, cable up the steel
  k.hex('brass', 0.03, 0.02, [0.07, yc - 0.01, -0.02], 'x')
  cable(k, [[0.082, yc - 0.01, -0.02], [0.11, yc - 0.02, 0.0], [0.1, 0.02, 0.12], [0.09, 0.016, 0.45]])
}

/** Open-path gas detector (transmitter or receiver): stainless optical head on a pan/tilt alignment mount. */
function openPathGasDetector(k: Kit) {
  wallPlate(k, 0.14, 0.24, -0.04)
  // support arm under the head + pan/tilt mount
  k.box(SS, [0.06, 0.2, 0.012], [0, 0.108, -0.105])
  k.box(SS, [0.06, 0.012, 0.06], [0, 0.014, -0.08])
  k.cyl(SS, 0.03, 0.02, [0, 0.24, -0.09], 'z', 18) // pan turntable
  k.box(SS, [0.1, 0.07, 0.012], [0, 0.24, -0.074])
  for (const s of [-1, 1]) {
    k.box(SS, [0.008, 0.06, 0.06], [s * 0.05, 0.24, -0.045]) // tilt yoke cheeks
    k.hex('nut', 0.022, 0.012, [s * 0.058, 0.24, -0.03], 'x') // pivot bolts
    // alignment (jacking) screws with knurled knobs
    k.rod(SS, [s * 0.035, 0.205, -0.068], [s * 0.035, 0.14, -0.068], 0.005, 8)
    k.cyl('nut', 0.012, 0.016, [s * 0.035, 0.135, -0.068], 'y', 10)
  }
  k.box(SS, [0.05, 0.16, 0.016], [0, 0.29, -0.066]) // saddle
  // optical head along +Y, axis through the origin line (x = 0, z = 0)
  k.cyl(YEL, 0.064, 0.05, [0, 0.165, 0], 'y', 28) // rear end cap (yellow band)
  k.cyl(SS, 0.06, 0.3, [0, 0.34, 0], 'y', 28)
  for (const y of [0.24, 0.34]) k.torus(SS, 0.062, 0.006, [0, y, 0], 'y', 6, 28) // band clamps
  k.cyl(SS, 0.066, 0.02, [0, 0.49, 0], 'y', 28) // front flange
  // short yellow weather hood + large dark lens window (Fresnel ring + centre emitter/receiver)
  k.lathe(YEL, [
    [0.066, 0.5],
    [0.072, 0.5],
    [0.072, 0.535],
    [0.066, 0.535],
    [0.066, 0.5],
  ], [0, 0, 0], 'y', 28)
  k.disc(LENS, 0.062, [0, 0.5005, 0], 'y', 28)
  k.torus(SS, 0.04, 0.0022, [0, 0.501, 0], 'y', 6, 28)
  k.torus(SS, 0.022, 0.0018, [0, 0.501, 0], 'y', 6, 24)
  k.dome(LENS, 0.012, [0, 0.5005, 0], 'y', Math.PI / 2, 0.5, 14)
  // alignment sight on top + status LED on the rear cap
  k.cyl(SS, 0.008, 0.09, [0, 0.36, 0.072], 'y', 10)
  k.box(SS, [0.012, 0.03, 0.012], [0, 0.36, 0.064])
  k.sphere(LED_GREEN, 0.006, [0.04, 0.14, 0.03], undefined, 8)
  // cable gland on the rear cap, cable back to the steel and down
  k.hex('brass', 0.03, 0.02, [0, 0.13, -0.02], 'y')
  cable(k, [[0, 0.118, -0.02], [0, 0.07, -0.04], [0.04, 0.02, -0.14], [0.04, 0.016, -0.5]])
}

/** Rate-of-rise heat detector hanging under steel: clamp plate, red Ex d box, finned element + guard. */
function heatDetector(k: Kit) {
  ceilingPlate(k, 0.1)
  k.cyl(RED, 0.045, 0.06, [0, 0, -0.038], 'z', 24)
  k.cyl(RED, 0.048, 0.014, [0, 0, -0.072], 'z', 24)
  k.hex(SS, 0.04, 0.014, [0, 0, -0.086], 'z')
  k.cyl(SS, 0.009, 0.06, [0, 0, -0.12], 'z', 10)
  for (let i = 0; i < 5; i++) k.cyl(SS, 0.027, 0.003, [0, 0, -0.1 - i * 0.009], 'z', 18)
  // guard cage
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    k.rod('nut', [Math.cos(a) * 0.034, Math.sin(a) * 0.034, -0.092], [Math.cos(a) * 0.034, Math.sin(a) * 0.034, -0.152], 0.0025, 6)
  }
  k.torus('nut', 0.034, 0.003, [0, 0, -0.152], 'z', 6, 20)
  k.rod('nut', [-0.034, 0, -0.152], [0.034, 0, -0.152], 0.0025, 6)
  k.sphere(LED_RED, 0.005, [0, 0.046, -0.04], undefined, 8)
  k.hex('brass', 0.028, 0.018, [0.054, 0, -0.04], 'x')
  cable(k, [[0.064, 0, -0.04], [0.09, 0, -0.03], [0.12, 0, -0.012], [0.45, 0, -0.012]])
}

/** Optical smoke detector hanging under steel: clamp plate, white base + vented dome. */
function smokeDetector(k: Kit) {
  ceilingPlate(k, 0.13)
  k.cyl(WHITE, 0.062, 0.02, [0, 0, -0.018], 'z', 32)
  k.cyl(WHITE, 0.053, 0.026, [0, 0, -0.041], 'z', 32)
  // smoke entry vents around the head
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    k.box('rubberBlack', [0.004, 0.01, 0.014], [Math.cos(a) * 0.0525, Math.sin(a) * 0.0525, -0.041], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a))
  }
  k.dome(WHITE, 0.053, [0, 0, -0.054], '-z', Math.PI / 2, 0.42, 28)
  k.sphere(LED_RED, 0.0045, [0.03, 0, -0.071], undefined, 8)
  k.hex('brass', 0.026, 0.016, [0.068, 0, -0.018], 'x')
  cable(k, [[0.078, 0, -0.018], [0.1, 0, -0.014], [0.45, 0, -0.012]])
}

/** Manual alarm call point: red box with push/break-glass window on a standoff bracket, hazard sign above. */
function manualCallPoint(k: Kit) {
  wallPlate(k, 0.1, 0.12)
  for (const s of [-1, 1]) k.box(SS, [0.012, 0.03, 0.09], [s * 0.035, 0.023, 0])
  const yb = 0.038 + 0.0325
  k.rbox(RED, [0.13, 0.065, 0.13], 0.01, [0, yb, 0])
  // recessed white bezel, pictogram face, hinged clear flap, test-key hole
  k.with(faceOut([0, yb + 0.0328, 0.006]), () => {
    k.add(macFaceMaterial(), new THREE.PlaneGeometry(0.105, 0.105), mat4([0, 0, 0]))
  })
  k.box('glass', [0.09, 0.004, 0.09], [0, yb + 0.036, 0.006])
  k.cyl(SS, 0.003, 0.09, [0, yb + 0.036, 0.053], 'x', 6) // flap hinge
  k.cyl('nut', 0.006, 0.004, [0, yb + 0.0335, -0.056], 'y', 12)
  k.sphere(LED_GREEN, 0.004, [0.05, yb + 0.033, -0.056], undefined, 8)
  // cable gland underneath
  k.hex('brass', 0.03, 0.02, [0, yb, -0.075], 'z')
  cable(k, [[0, yb, -0.085], [0, yb - 0.01, -0.12], [0, 0.02, -0.18], [0, 0.016, -0.5]])
  // yellow/black sign plate above on two standoffs
  const zs = 0.155
  for (const s of [-1, 1]) k.cyl(SS, 0.006, 0.02, [s * 0.09, 0.01, zs], 'y', 8)
  k.box(SS, [0.226, 0.004, 0.116], [0, 0.022, zs])
  k.with(faceOut([0, 0.0242, zs]), () => {
    k.add(macSignMaterial(), new THREE.PlaneGeometry(0.22, 0.11), mat4([0, 0, 0]))
  })
}

/** Build the fire & gas model for `type` into `k` (mounting frame described above). */
export function buildFireGas(k: Kit, type: string) {
  switch (type) {
    case 'FD':
      return flameDetector(k)
    case 'GD':
      return pointGasDetector(k)
    case 'OGD':
      return openPathGasDetector(k)
    case 'HD':
      return heatDetector(k)
    case 'SD':
      return smokeDetector(k)
    case 'MAC':
      return manualCallPoint(k)
  }
}

/** Where the stamped tag plate hangs (plate centre, facing +Y) and the wire anchor, per F&G type. */
export function fireGasTagPos(type: string): { pos: V3; anchor: V3 } {
  switch (type) {
    case 'HD':
      return { pos: [0, 0.07, -0.04], anchor: [0, 0.05, -0.008] }
    case 'SD':
      return { pos: [0, 0.085, -0.04], anchor: [0, 0.065, -0.008] }
    case 'GD':
      return { pos: [-0.11, 0.012, 0.03], anchor: [-0.06, 0.009, 0.08] }
    case 'OGD':
      return { pos: [0.11, 0.012, -0.1], anchor: [0.07, 0.009, -0.06] }
    case 'MAC':
      return { pos: [0, 0.012, -0.11], anchor: [0, 0.009, -0.06] }
    default:
      return { pos: [0, 0.012, -0.12], anchor: [0, 0.009, -0.08] }
  }
}
