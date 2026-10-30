/**
 * Enclosed module — local equipment room (A60 steel container building).
 *
 * Local frame: origin = centre of the module footprint at deck level, size = [x, y, z] extents.
 * The building sits on a 0.6 m skid / cable cellar (cable transits are in the cellar wall), so the
 * internal floor and door thresholds are at y = 0.6 and every door has an external landing with a
 * stair down to the deck. Walls: vertical-rib profiled cladding between corner posts; roof with
 * parapet, two packaged HVAC units (condenser fans, ducts, fire dampers), louvres, beacons, lights,
 * signage.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import type { Module } from '../../model/types'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit, mat4, type MatKey, type V3 } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { ribbedPanel } from './machinery/cladding'
import { gratingPanel, handrail, tagPlate } from './machinery/parts'
import { fanGuardMaterial, signMaterial } from './machinery/textures'

const CLAD: MatKey = 'moduleCladding'
const FRAME: MatKey = 'structSteelDark'
const DOOR: MatKey = 'equipmentPaint'
const HF = 0.6 // floor / threshold height

/** Quaternion that turns a +Z-facing element to face the given wall normal (in XZ). */
const faceQ = (nx: number, nz: number) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nx, 0, nz))

interface Wall {
  /** outward normal */
  n: [number, number]
  /** centre of wall plane at y = 0 */
  c: V3
  /** width along the wall */
  w: number
}

export function buildModule(eq: Module) {
  const k = new Kit()
  const [SX, SY, SZ] = eq.size
  const post = 0.2
  const walls: Wall[] = [
    { n: [0, 1], c: [0, 0, SZ / 2], w: SX },
    { n: [0, -1], c: [0, 0, -SZ / 2], w: SX },
    { n: [1, 0], c: [SX / 2, 0, 0], w: SZ },
    { n: [-1, 0], c: [-SX / 2, 0, 0], w: SZ },
  ]
  /** place an element on wall `wi`: u = offset along the wall (right-hand when facing it), y, out = offset outward */
  const onWall = (wi: number, u: number, y: number, out: number): V3 => {
    const W = walls[wi]
    const t: [number, number] = [-W.n[1], W.n[0]] // tangent (rotate normal -90 about Y)
    // tangent such that when looking at the wall from outside, +u goes to the right
    return [W.c[0] + t[0] * -u + W.n[0] * out, y, W.c[2] + t[1] * -u + W.n[1] * out]
  }

  // ---------------------------------------------------------------- skid / cable cellar
  k.box(FRAME, [SX + 0.1, 0.3, SZ + 0.1], [0, 0.15, 0])
  k.box(FRAME, [SX + 0.14, 0.03, SZ + 0.14], [0, 0.315, 0])
  // cellar wall (plain plate) between skid and floor level
  k.box(CLAD, [SX - 0.02, HF - 0.33, SZ - 0.02], [0, 0.33 + (HF - 0.33) / 2, 0])
  // lifting pad-eyes on the skid
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(FRAME, [0.2, 0.18, 0.04], [sx * (SX / 2 - 0.5), 0.39, sz * (SZ / 2 + 0.07)])

  // ---------------------------------------------------------------- frame + cladding
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(FRAME, [post, SY - HF, post], [sx * (SX / 2 - post / 2), HF + (SY - HF) / 2, sz * (SZ / 2 - post / 2)])
  const wallH = SY - HF - 0.35
  for (const [wi, W] of walls.entries()) {
    const q = faceQ(W.n[0], W.n[1])
    const sheet = ribbedPanel(W.w - 2 * post, wallH, 0.25, 0.035)
    const p = onWall(wi, 0, HF, -0.04)
    k.add(CLAD, sheet, mat4(p, q))
    // base flashing + eaves flashing
    k.box(FRAME, [W.w - 2 * post, 0.06, 0.06], onWall(wi, 0, HF + 0.03, -0.02), q)
    k.box(CLAD, [W.w + 0.08, 0.35, 0.05], onWall(wi, 0, SY - 0.175, 0.0), q)
  }
  // roof deck + parapet
  k.box(CLAD, [SX - 0.1, 0.05, SZ - 0.1], [0, SY - 0.1, 0])
  const roofSheet = ribbedPanel(SX - 0.3, SZ - 0.3, 0.3, 0.03, false)
  k.add(CLAD, roofSheet, new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0).negate()).setPosition(0, SY - 0.075, -(SZ - 0.3) / 2))
  // (basis above: x->x, panel y->+Z, normal -> +Y; det = -1 is fine — Kit flips winding)

  // ---------------------------------------------------------------- doors
  const door = (wi: number, u: number, w: number, h: number, double: boolean, sign: 'ler' | 'hv') => {
    const W = walls[wi]
    const q = faceQ(W.n[0], W.n[1])
    const fr = 0.08
    // frame
    k.box(FRAME, [w + 2 * fr, fr, 0.12], onWall(wi, u, HF + h + fr / 2, 0.0), q)
    for (const s of [-1, 1]) k.box(FRAME, [fr, h, 0.12], onWall(wi, u + s * (w / 2 + fr / 2), HF + h / 2, 0.0), q)
    // leaves
    const leaves = double ? [-w / 4, w / 4] : [0]
    const lw = double ? w / 2 - 0.01 : w - 0.01
    for (const lu of leaves) {
      k.box(DOOR, [lw, h - 0.01, 0.05], onWall(wi, u + lu, HF + h / 2, 0.035), q)
      // vision panel + panic bar + kick plate
      k.box('glass', [lw * 0.3, h * 0.2, 0.01], onWall(wi, u + lu, HF + h * 0.72, 0.062), q)
      k.box('stainless', [lw * 0.7, 0.04, 0.05], onWall(wi, u + lu, HF + h * 0.48, 0.09), q)
      k.box('stainless', [lw * 0.95, 0.2, 0.006], onWall(wi, u + lu, HF + 0.12, 0.062), q)
      // hinges
      const hu = double ? u + lu + Math.sign(lu) * (lw / 2 - 0.02) : u - lw / 2 + 0.02
      for (const hy of [0.2, h - 0.25]) k.cyl('nut', 0.018, 0.12, onWall(wi, hu, HF + hy, 0.06), 'y', 8)
    }
    // door closer + canopy + bulkhead light + EXIT sign
    k.box('nut', [0.3, 0.06, 0.06], onWall(wi, u + (double ? -w / 4 : 0), HF + h - 0.05, 0.1), q)
    k.box(CLAD, [w + 0.6, 0.04, 0.6], onWall(wi, u, HF + h + 0.35, 0.3), q)
    k.box(CLAD, [w + 0.6, 0.15, 0.03], onWall(wi, u, HF + h + 0.29, 0.6), q)
    k.rbox('stainless', [0.3, 0.12, 0.1], 0.03, onWall(wi, u - w / 2 - 0.35, HF + h + 0.15, 0.06), q)
    k.box('glass', [0.25, 0.08, 0.02], onWall(wi, u - w / 2 - 0.35, HF + h + 0.15, 0.115), q)
    k.plane(signMaterial('exit'), 0.4, 0.2, onWall(wi, u, HF + h + 0.18, 0.075), q)
    k.plane(signMaterial(sign, eq.name.toUpperCase()), 0.8, 0.4, onWall(wi, u + w / 2 + 0.65, HF + 1.55, 0.04), q)
    k.plane(signMaterial('noentry'), 0.5, 0.25, onWall(wi, u + w / 2 + 0.65, HF + 1.05, 0.04), q)
    // landing (grating) + stair down to deck along the wall, handrails
    const lw2 = w + 0.9
    const ld = 1.2
    const lc = onWall(wi, u, HF - 0.015, ld / 2 + 0.02)
    const alongX = Math.abs(W.n[1]) > 0.5
    gratingPanel(k, lc, alongX ? lw2 : ld, alongX ? ld : lw2)
    for (const s of [-1, 1]) for (const o of [0.1, ld - 0.05]) k.box(FRAME, [0.08, HF - 0.03, 0.08], onWall(wi, u + s * (lw2 / 2 - 0.05), (HF - 0.03) / 2, o), q)
    const steps = Math.ceil(HF / 0.2)
    const run = 0.25
    const sx0 = u + lw2 / 2 // stair starts at the +u end of the landing and descends along +u
    for (let i = 1; i < steps; i++) {
      const y = HF - i * (HF / steps)
      gratingPanel(k, onWall(wi, sx0 + (i - 0.5) * run, y - 0.015, ld / 2 + 0.02), alongX ? run - 0.02 : 0.9, alongX ? 0.9 : run - 0.02)
    }
    for (const o of [ld / 2 + 0.02 - 0.47, ld / 2 + 0.02 + 0.47]) {
      const a = onWall(wi, sx0, HF, o)
      const b = onWall(wi, sx0 + (steps - 1) * run + 0.1, 0.0, o)
      k.rod(FRAME, [a[0], a[1] - 0.04, a[2]], [b[0], b[1] + 0.05, b[2]], 0.03, 6)
      handrail(k, [onWall(wi, sx0, HF, o), onWall(wi, sx0 + (steps - 1) * run, HF / steps, o)], 'safetyYellow', 1.0)
    }
    handrail(k, [onWall(wi, u - lw2 / 2 + 0.03, HF, 0.06), onWall(wi, u - lw2 / 2 + 0.03, HF, ld), onWall(wi, sx0, HF, ld)], 'safetyYellow', 1.0)
  }
  const dW = Math.min(1.8, SX * 0.25)
  door(0, -SX * 0.18, dW, 2.2, true, 'ler')
  door(3, SZ * 0.15, 1.0, 2.1, false, 'hv')

  // ---------------------------------------------------------------- louvres + fire dampers (on +Z and +X walls)
  const louvre = (wi: number, u: number, y: number, w: number, h: number) => {
    const q = faceQ(walls[wi].n[0], walls[wi].n[1])
    k.box(FRAME, [w + 0.08, h + 0.08, 0.08], onWall(wi, u, y, 0.02), q)
    k.box('rubberBlack', [w, h, 0.02], onWall(wi, u, y, 0.03), q)
    const n = Math.round(h / 0.07)
    for (let i = 0; i < n; i++) {
      const qq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.7))
      k.box(CLAD, [w, 0.075, 0.006], onWall(wi, u, y - h / 2 + (i + 0.5) * (h / n), 0.07), qq)
    }
    // damper actuator box
    k.box('actuatorRed', [0.18, 0.12, 0.1], onWall(wi, u + w / 2 + 0.15, y + h / 2 - 0.06, 0.06), q)
  }
  louvre(0, SX * 0.25, SY - 1.0, 0.8, 0.5)
  louvre(2, -SZ * 0.2, SY - 1.0, 0.8, 0.5)
  louvre(2, SZ * 0.2, HF + 0.6, 0.6, 0.4)

  // ---------------------------------------------------------------- cable transits (MCT frames) + cable ladder on -Z wall
  for (const [i, u] of [-SX * 0.25, 0, SX * 0.25].entries()) {
    const q = faceQ(0, -1)
    const y = 0.45
    k.box(FRAME, [0.5, 0.22, 0.12], onWall(1, u, y, 0.05), q)
    // packed blocks
    for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) k.box(c % 2 === r % 2 ? 'rubberBlack' : 'gasket', [0.07, 0.08, 0.02], onWall(1, u - 0.19 + c * 0.075, y - 0.045 + r * 0.09, 0.115), q)
    k.box('stainless', [0.46, 0.02, 0.03], onWall(1, u, y + 0.11, 0.115), q)
    // cables in from a ladder tray
    for (let c = 0; c < 4; c++) {
      const a = onWall(1, u - 0.15 + c * 0.1, y, 0.12)
      const b = onWall(1, u - 0.15 + c * 0.1, y, 0.5)
      const t = onWall(1, u - 0.15 + c * 0.1 + i * 0.02, 2.3 + c * 0.02, 0.62)
      k.spline('cable', [a, b, [b[0], 1.2, b[2]], t], 0.016, 6, 24)
    }
  }
  // vertical ladder tray rising from the transits to a high-level tray leaving the module
  const tq = faceQ(0, -1)
  k.box('cableTray', [SX * 0.7, 0.08, 0.5], onWall(1, 0, 2.4, 0.62), tq)
  for (let i = 0; i < 12; i++) k.box('cableTray', [0.03, 0.02, 0.5], onWall(1, -SX * 0.35 + (i * SX * 0.7) / 11, 2.35, 0.62), tq)
  for (const u of [-SX * 0.34, SX * 0.34]) k.box(FRAME, [0.06, 0.06, 0.7], onWall(1, u, 2.3, 0.35), tq)

  // ---------------------------------------------------------------- roof: HVAC units, ducts, beacons, pad-eyes
  for (const [i, ux] of [-SX * 0.22, SX * 0.22].entries()) {
    const hz = -SZ * 0.15
    const hb = SY - 0.075
    k.box(FRAME, [2.0, 0.15, 1.3], [ux, hb + 0.075, hz])
    k.rbox(CLAD, [1.9, 1.0, 1.2], 0.03, [ux, hb + 0.15 + 0.5, hz])
    // condenser fans on top
    for (const fx of [-0.45, 0.45]) {
      k.cyl(CLAD, 0.36, 0.12, [ux + fx, hb + 1.21, hz], 'y', 32)
      k.disc('rubberBlack', 0.34, [ux + fx, hb + 1.2, hz], 'y', 28)
      k.disc(fanGuardMaterial(), 0.35, [ux + fx, hb + 1.275, hz], 'y', 28)
    }
    // condenser coil side (dark louvres)
    for (const s of [-1, 1]) for (let j = 0; j < 8; j++) k.box('nut', [1.6, 0.03, 0.01], [ux, hb + 0.3 + j * 0.08, hz + s * 0.605])
    // supply / return ducts down into roof with fire dampers
    k.box('stainless', [0.5, 0.45, 0.4], [ux + (i ? -0.65 : 0.65), hb + 0.375, hz + 0.95])
    k.box('stainless', [0.5, 0.25, 0.7], [ux + (i ? -0.65 : 0.65), hb + 0.45, hz + 0.5])
    k.box('actuatorRed', [0.16, 0.12, 0.1], [ux + (i ? -0.65 : 0.65) + 0.33, hb + 0.4, hz + 0.95])
    k.rbox('stainless', [0.35, 0.3, 0.15], 0.02, [ux, hb + 0.45, hz - 0.68])
  }
  // gas detector at HVAC intake, beacons + sounder at the +Z/-X corner, roof pad-eyes
  for (const [x, c] of (['actuatorRed', 'actuatorYellow'] as MatKey[]).entries()) {
    k.cyl('nut', 0.06, 0.06, [-SX / 2 + 0.4 + x * 0.25, SY + 0.0, SZ / 2 - 0.4], 'y', 14)
    k.cyl(c, 0.055, 0.12, [-SX / 2 + 0.4 + x * 0.25, SY + 0.09, SZ / 2 - 0.4], 'y', 16)
  }
  k.cyl('nut', 0.08, 0.1, [-SX / 2 + 0.9, SY + 0.0, SZ / 2 - 0.4], 'y', 16)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box(FRAME, [0.25, 0.15, 0.03], [sx * (SX / 2 - 0.3), SY + 0.07, sz * (SZ / 2 - 0.3)])
  }
  // roof access cage ladder on the +X wall
  const lu = SZ * 0.42
  for (const s of [-1, 1]) k.box('safetyYellow', [0.06, SY - 0.2, 0.012], onWall(2, lu + s * 0.22, (SY - 0.2) / 2 + 0.25, 0.2), faceQ(1, 0))
  for (let i = 0; i < Math.floor((SY - 0.4) / 0.3); i++) {
    const a = onWall(2, lu - 0.22, 0.4 + i * 0.3, 0.2)
    const b = onWall(2, lu + 0.22, 0.4 + i * 0.3, 0.2)
    k.rod('safetyYellow', a, b, 0.012, 6)
  }
  for (const s of [-1, 1]) k.box('safetyYellow', [0.06, 0.06, 0.25], onWall(2, lu + s * 0.22, SY - 0.4, 0.09), faceQ(1, 0))
  handrail(k, [[SX / 2 - 0.05, SY - 0.05, lu - 0.6], [SX / 2 - 0.05, SY - 0.05, lu + 0.6]], 'safetyYellow', 1.0)
  // earthing bosses, tag
  k.cyl('brass', 0.03, 0.04, onWall(0, SX / 2 - 0.4, 0.45, 0.02), 'z', 10)
  tagPlate(k, eq.tag, onWall(0, SX * 0.18, HF + 2.0, 0.005), 'z', 0.6)
  return k.build()
}

export function ModuleModel({ eq }: { eq: Module }) {
  const built = useMemo(() => buildModule(eq), [eq])
  return (
    <group>
      <KitMesh data={built} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}
