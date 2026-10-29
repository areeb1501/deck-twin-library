// E-house / local equipment room: prefabricated A60 steel module on a skid with cable cellar, doors, stairs, roof HVAC and an optional switchgear interior. ISO 14122, IEC 62271-202.
import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import { Kit, eul, mat4, uvScale, type Built, type MatKey, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { grating, handrail, ladder, liftingLug, member, tagPlate } from '../lib/parts'
import { Rotors, fanRotor, type RotorSpec } from '../lib/rotors'
import { stairFlight } from '../lib/standards'
import { fanGuardMaterial, signMaterial } from '../lib/textures'
import { beacon, cableTransit, earthBoss, louvre, louvrePanel, ribbedPanel } from './_parts'
import { lineup, panelSize } from './_panels'
import { ceilingMaterial, lamp, liningMaterial, raisedFloorMaterial } from './_textures'

export interface EHouseProps {
  /** outside length along X, m */
  length?: number
  /** outside width along Z, m */
  width?: number
  /** eaves height above deck, m */
  height?: number
  /** internal floor above deck (cable cellar under it), m */
  cellar?: number
  cladding?: 'corrugated' | 'flat'
  doorOpen?: boolean
  /** switchgear and MCC line-ups, lit ceiling, raised floor */
  interior?: boolean
  /** switchgear voltage, kV */
  kv?: number
  label?: string
  tag?: string
  /** spin the roof HVAC condenser fans */
  running?: boolean
}

export const defaults = {
  length: 12,
  width: 6,
  height: 4.4,
  cellar: 0.9,
  cladding: 'corrugated' as 'corrugated' | 'flat',
  doorOpen: false,
  interior: true,
  kv: 11,
  label: 'LOCAL EQUIPMENT ROOM',
  tag: 'B-9100',
  running: true,
}

type P = Omit<typeof defaults, 'running'>

const T = 0.14 // wall: cladding + mineral wool + lining (A60)
const POST = 0.2
const FR = 0.08 // door frame width
const OPEN = 1.6
const FRAME: MatKey = 'structSteelDark'
const CLAD: MatKey = 'cladding'

type WallId = '+z' | '-z' | '+x' | '-x'
interface Wall {
  id: WallId
  len: number
  rotY: number
  origin: V3
  m: THREE.Matrix4
}
interface Door {
  wall: WallId
  u: number
  w: number
  h: number
  double: boolean
}
interface Leaf {
  pos: V3
  rotY: number
  open: number
  built: Built
}

export function EHouse({ running = true, ...rest }: EHouseProps & GroupProps) {
  const { length, width, height, cellar, cladding, doorOpen, interior, kv, label, tag, ...group } = { ...defaults, ...rest }
  const b = useMemo(() => build({ length, width, height, cellar, cladding, doorOpen, interior, kv, label, tag }), [length, width, height, cellar, cladding, doorOpen, interior, kv, label, tag])
  useEffect(() => () => [b.shell, ...new Set([...b.leaves.map((l) => l.built), ...b.rotors.map((r) => r.built)])].forEach((x) => x.geometry.dispose()), [b])
  return (
    <group {...group}>
      <KitMesh data={b.shell} />
      {b.leaves.map((l, i) => (
        <group key={i} position={l.pos} rotation={[0, l.rotY, 0]}>
          <group rotation={[0, doorOpen ? l.open : 0, 0]}>
            <KitMesh data={l.built} />
          </group>
        </group>
      ))}
      <Rotors rotors={b.rotors} running={running} />
    </group>
  )
}

export default EHouse

function wallsOf(SX: number, SZ: number): Wall[] {
  const mk = (id: WallId, rotY: number, origin: V3, len: number): Wall => ({ id, rotY, origin, len, m: new THREE.Matrix4().makeRotationY(rotY).setPosition(...origin) })
  return [mk('+z', 0, [0, 0, SZ / 2], SX), mk('-z', Math.PI, [0, 0, -SZ / 2], SX), mk('+x', Math.PI / 2, [SX / 2, 0, 0], SZ), mk('-x', -Math.PI / 2, [-SX / 2, 0, 0], SZ)]
}
const toModule = (w: Wall, p: V3): V3 => new THREE.Vector3(...p).applyMatrix4(w.m).toArray() as V3

function build(p: P) {
  const SX = Math.min(30, Math.max(4, p.length))
  const SZ = Math.min(12, Math.max(3, p.width))
  const HF = Math.min(3, Math.max(0.5, p.cellar))
  const SY = Math.min(HF + 6, Math.max(HF + 2.9, p.height))
  const k = new Kit()
  const rotors: RotorSpec[] = []
  const walls = wallsOf(SX, SZ)
  const W = (id: WallId) => walls.find((w) => w.id === id)!
  const onWall = (w: Wall, fn: () => void) => k.with(w.m, fn)
  const flight = stairFlight(HF)

  // doors: double equipment door and personnel door on the front, escape door on the +X end
  const dd: Door = { wall: '+z', u: Math.max(-SX / 2 + 1.5, -SX * 0.18), w: 1.8, h: 2.4, double: true }
  const pd: Door = { wall: '+z', u: Math.min(SX / 2 - 0.9, Math.max(dd.u + 2.2, SX * 0.3)), w: 0.9, h: 2.1, double: false }
  const ed: Door = { wall: '+x', u: -SZ * 0.15, w: 0.9, h: 2.1, double: false }
  const doors = [dd, pd, ed]

  // skid: HEB 300 perimeter and cross beams, earthing bosses, side pad-eyes
  for (const s of [-1, 1]) member(k, [-SX / 2, 0.15, s * (SZ / 2 - 0.15)], [SX / 2, 0.15, s * (SZ / 2 - 0.15)], 'HEB 300', FRAME)
  const nc = Math.max(2, Math.ceil(SX / 2))
  for (let i = 0; i <= nc; i++) {
    const x = -SX / 2 + 0.15 + (i * (SX - 0.3)) / nc
    member(k, [x, 0.15, -SZ / 2 + 0.3], [x, 0.15, SZ / 2 - 0.3], 'HEB 300', FRAME)
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (SX / 2 - 0.6), 0.05, sz * (SZ / 2 + 0.0125)], 'x', 1.4, 'safetyYellow')
  earthBoss(k, [SX / 2, 0.15, SZ / 2 - 0.6], 'x')
  earthBoss(k, [-SX / 2, 0.15, -SZ / 2 + 0.6], '-x')

  // cable cellar skirt and inner block, sill ring, corner posts
  k.box('deckPlate', [SX - 0.1, 0.01, SZ - 0.1], [0, 0.305, 0]) // cellar floor; the cellar itself is open space under the raised floor
  for (const w of walls)
    onWall(w, () => {
      const L = w.len - 2 * POST
      if (p.cladding === 'corrugated') k.add(CLAD, ribbedPanel(L, HF - 0.32, 0.25, 0.035), mat4([0, 0.3, -0.045]))
      else k.box(CLAD, [L, HF - 0.32, 0.01], [0, 0.3 + (HF - 0.32) / 2, -0.02])
      k.box(FRAME, [w.len, 0.06, 0.08], [0, HF - 0.03, -0.03])
    })
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(FRAME, [POST, SY - 0.3, POST], [sx * (SX / 2 - POST / 2), 0.3 + (SY - 0.3) / 2, sz * (SZ / 2 - POST / 2)])

  // walls with real door openings: lining inside, profiled or flat cladding outside
  const lining = liningMaterial()
  const wallTop = SY - 0.125
  const cladTop = SY - 0.35
  for (const w of walls) {
    const ext: [number, number] = w.id === '+z' || w.id === '-z' ? [-w.len / 2, w.len / 2] : [-w.len / 2 + T, w.len / 2 - T]
    const holes = doors.filter((d) => d.wall === w.id).map((d) => ({ a: d.u - d.w / 2 - FR, b: d.u + d.w / 2 + FR, y1: HF + d.h + FR }))
    holes.sort((a, b) => a.a - b.a)
    const seg = (a: number, b: number, y0: number, y1: number) => {
      if (b - a < 0.005 || y1 - y0 < 0.005) return
      const g = new THREE.BoxGeometry(b - a, y1 - y0, T - 0.05)
      uvScale(g, (b - a) / 1.2, 1)
      k.add(lining, g, mat4([(a + b) / 2, (y0 + y1) / 2, -(T + 0.05) / 2]))
      const ca = Math.max(a, -w.len / 2 + POST)
      const cb = Math.min(b, w.len / 2 - POST)
      const cy1 = Math.min(y1, cladTop)
      if (cb - ca < 0.01 || cy1 - y0 < 0.01) return
      if (p.cladding === 'corrugated') k.add(CLAD, ribbedPanel(cb - ca, cy1 - y0, 0.25, 0.035), mat4([(ca + cb) / 2, y0, -0.045]))
      else {
        k.box(CLAD, [cb - ca, cy1 - y0, 0.04], [(ca + cb) / 2, (y0 + cy1) / 2, -0.03])
        for (let x = Math.ceil((ca + 0.01) / 1.2) * 1.2; x < cb - 0.01; x += 1.2) k.box(CLAD, [0.03, cy1 - y0, 0.012], [x, (y0 + cy1) / 2, -0.004])
      }
    }
    onWall(w, () => {
      let cur = ext[0]
      for (const h of holes) {
        seg(cur, Math.max(cur, h.a), HF, wallTop)
        seg(h.a, h.b, h.y1, wallTop)
        cur = Math.max(cur, h.b)
      }
      seg(cur, ext[1], HF, wallTop)
      k.box(CLAD, [w.len + 0.08, 0.35, 0.05], [0, SY - 0.175, 0.0]) // eaves flashing
    })
  }

  // roof: deck plate, profiled roof sheet, perimeter handrail with a gap at the ladder
  k.box(CLAD, [SX - 0.1, 0.05, SZ - 0.1], [0, SY - 0.1, 0])
  k.add(CLAD, ribbedPanel(SX - 0.3, SZ - 0.3, 0.3, 0.03, false), new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)).setPosition(0, SY - 0.072, -(SZ - 0.3) / 2))
  const yr = SY - 0.045
  const ex = SX / 2 - 0.12
  const ez = SZ / 2 - 0.12
  const xl = SX * 0.35 // roof ladder, rear wall
  handrail(k, [[xl - 0.45, yr, -ez], [-ex, yr, -ez], [-ex, yr, ez], [ex, yr, ez], [ex, yr, -ez], [xl + 0.45, yr, -ez]])

  // floor and interior
  const IX = SX - 2 * T
  const IZ = SZ - 2 * T
  {
    const g = new THREE.BoxGeometry(IX, 0.05, IZ)
    uvScale(g, IX / 0.6, IZ / 0.6)
    k.add(raisedFloorMaterial(), g, mat4([0, HF - 0.025, 0]))
  }
  const CH = SY - 0.5
  if (p.interior) interiorFit(k, p, { SX, SZ, HF, CH, IX, IZ, dd })

  // doors: frames, canopies, lights, signage, leaves
  const leaves: Leaf[] = []
  const leafCache = new Map<string, Built>()
  const leafOf = (w: number, h: number, dir: 1 | -1) => {
    const key = `${w}|${h}|${dir}`
    if (!leafCache.has(key)) leafCache.set(key, leafBuilt(w, h, dir))
    return leafCache.get(key)!
  }
  for (const [i, d] of doors.entries()) {
    const w = W(d.wall)
    onWall(w, () => doorDressing(k, d, HF, p.interior, i === 0 ? p : null))
    const hinges: [number, 1 | -1, number][] = d.double ? [[d.u - d.w / 2, 1, d.w / 2], [d.u + d.w / 2, -1, d.w / 2]] : [[d.u + d.w / 2, -1, d.w]]
    for (const [hu, dir, lw] of hinges) leaves.push({ pos: toModule(w, [hu, HF, 0]), rotY: w.rotY, open: -dir * OPEN, built: leafOf(lw, d.h, dir) })
  }

  // landings and ISO 14122-3 stairs: front walkway serving both front doors, landing at the escape door
  onWall(W('+z'), () => access(k, dd.u - dd.w / 2 - 0.45, pd.u + pd.w / 2 + 0.45, 1.6, -1, HF, SX / 2, flight))
  onWall(W('+x'), () => access(k, ed.u - ed.w / 2 - 0.45, ed.u + ed.w / 2 + 0.45, 1.2, 1, HF, SZ / 2, flight))

  // HVAC wall louvres with fire dampers (rear wall, high level) and the -X end
  onWall(W('-z'), () => {
    for (const f of [-0.3, 0.05]) {
      louvre(k, SX * f, SY - 1.1, 0.9, 0.55, FRAME)
      // gas detector at the HVAC intake (trips the HVAC / closes the dampers on gas)
      k.box('stainless', [0.1, 0.12, 0.06], [SX * f - 0.65, SY - 1.2, 0.03])
      k.cyl('stainless', 0.03, 0.12, [SX * f - 0.65, SY - 1.32, 0.05], 'y', 14)
      k.box('actuatorRed', [0.18, 0.12, 0.1], [SX * f + 0.6, SY - 0.9, 0.06])
    }
  })
  onWall(W('-x'), () => {
    louvre(k, 0, SY - 1.1, Math.min(1.2, SZ * 0.3), 0.6, FRAME)
    // overpressure relief damper (room is held a few mbar above ambient)
    k.box(FRAME, [0.42, 0.42, 0.12], [SZ * 0.3, HF + 1.0, 0.06])
    k.box('rubberBlack', [0.34, 0.34, 0.01], [SZ * 0.3, HF + 1.0, 0.125])
    for (let i = 0; i < 4; i++) k.box('galvanised', [0.34, 0.07, 0.006], [SZ * 0.3, HF + 0.86 + i * 0.09, 0.135], eul(-0.5, 0, 0))
  })

  // multi-cable transits into the cellar on the rear wall, cables up to a ladder tray on brackets
  onWall(W('-z'), () => {
    const yT = HF + 2.0
    const us = [SX * 0.0, SX * 0.12, SX * 0.24]
    const t0 = -SX * 0.12
    const t1 = SX * 0.42
    const yc = 0.3 + (HF - 0.3) / 2
    for (const [i, u] of us.entries()) {
      cableTransit(k, u, yc, 6, HF > 0.75 ? 2 : 1, FRAME)
      for (let c = 0; c < 4; c++) {
        const x = u - 0.15 + c * 0.1
        k.spline('cable', [[x, yc, 0.13], [x, yc, 0.45], [x, yc + 0.6, 0.55], [x, yT - 0.4, 0.6], [x + i * 0.02, yT + 0.02, 0.62]], 0.016, 6, 28)
      }
    }
    for (const s of [-1, 1]) k.box('cableTray', [t1 - t0, 0.1, 0.006], [(t0 + t1) / 2, yT + 0.05, 0.62 + s * 0.25])
    for (let x = t0 + 0.15; x < t1; x += 0.3) k.box('cableTray', [0.03, 0.02, 0.5], [x, yT + 0.01, 0.62])
    for (let x = t0 + 0.3; x < t1; x += 1.5) {
      k.box(FRAME, [0.06, 0.06, 0.92], [x, yT - 0.03, 0.42])
      k.box(FRAME, [0.06, 0.4, 0.06], [x, yT - 0.26, 0.04])
    }
  })

  // roof access ladder with cage (rear wall)
  onWall(W('-z'), () => {
    ladder(k, [-xl, 0, 0.25], SY - 0.05, [0, 0, 1])
    for (const y of [1.5, SY - 1.2]) for (const s of [-1, 1]) k.box('safetyYellow', [0.04, 0.04, 0.25], [-xl + s * 0.225, y, 0.125])
  })

  // roof: packaged HVAC units with condenser fans, beacons, pad-eyes
  const nU = SX >= 8 ? 2 : 1
  const fan = fanRotor('rubberBlack', 0.32, [0, 0, 0], 'y', 220, { blades: 4 })
  for (let i = 0; i < nU; i++) {
    const ux = nU === 1 ? -SX * 0.1 : (i ? 1 : -1) * SX * 0.22
    const hz = -SZ * 0.12
    const hb = SY - 0.05
    k.box(FRAME, [2.0, 0.15, 1.3], [ux, hb + 0.075, hz])
    k.rbox(CLAD, [1.9, 1.0, 1.2], 0.03, [ux, hb + 0.65, hz])
    for (const s of [-1, 1]) louvrePanel(k, 1.6, 0.6, [ux, hb + 0.6, hz + s * 0.601], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s > 0 ? 0 : Math.PI))
    for (const fx of [-0.45, 0.45]) {
      k.cyl(CLAD, 0.36, 0.14, [ux + fx, hb + 1.21, hz], 'y', 32, undefined, true)
      k.disc('rubberBlack', 0.355, [ux + fx, hb + 1.145, hz], 'y', 28)
      k.cyl('nut', 0.05, 0.08, [ux + fx, hb + 1.19, hz], 'y', 12)
      k.disc(fanGuardMaterial(), 0.355, [ux + fx, hb + 1.285, hz], 'y', 28)
      rotors.push({ ...fan, pos: [ux + fx, hb + 1.23, hz] })
    }
    // supply / return ducts down through the roof, isolator
    k.box('galvanised', [0.5, 0.15, 0.4], [ux + 0.6, hb + 0.075, hz + 0.85])
    k.box('galvanised', [0.5, 0.5, 0.15], [ux + 0.6, hb + 0.3, hz + 0.68])
    k.rbox('stainless', [0.2, 0.25, 0.12], 0.02, [ux - 0.75, hb + 0.25, hz + 0.68])
  }
  beacon(k, [-SX / 2 + 0.45, SY - 0.05, SZ / 2 - 0.45], lamp('red'))
  beacon(k, [-SX / 2 + 0.7, SY - 0.05, SZ / 2 - 0.45], lamp('amber'))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) liftingLug(k, [sx * (SX / 2 - 0.4), SY - 0.05, sz * (SZ / 2 - 0.4)], 'x', 1.2, FRAME)

  return { shell: k.build(), leaves, rotors }
}

/** Landing [u0, u1] × depth on the wall at floor height HF, stair descending along the wall (sd) or straight out if it would overrun the end. */
function access(k: Kit, u0: number, u1: number, depth: number, sd: 1 | -1, HF: number, half: number, f: ReturnType<typeof stairFlight>) {
  const run = f.steps * f.going
  const sw = 0.9
  const edge = sd > 0 ? u1 : u0
  const along = sd > 0 ? edge + run <= half + 0.2 : edge - run >= -half - 0.2
  const uc = (u0 + u1) / 2
  grating(k, [uc, HF, depth / 2 + 0.02], u1 - u0, depth)
  member(k, [u0, HF - 0.03 - 0.07, depth + 0.02], [u1, HF - 0.03 - 0.07, depth + 0.02], 'UPN 140', FRAME, [0, 0, 1])
  const np = Math.max(2, Math.ceil((u1 - u0) / 2.5) + 1)
  for (let i = 0; i < np; i++) {
    const u = u0 + 0.06 + ((u1 - u0 - 0.12) * i) / (np - 1)
    member(k, [u, 0, depth - 0.05], [u, HF - 0.17, depth - 0.05], 'SHS 100x100x6.3', FRAME, [0, 0, 1])
    k.box(FRAME, [0.2, 0.012, 0.2], [u, 0.006, depth - 0.05])
  }
  const tread = (c: V3, sx: number, sz: number) => grating(k, c, sx, sz)
  if (along) {
    const zc = depth - sw / 2 - 0.05
    for (let i = 1; i < f.steps; i++) tread([edge + sd * (i - 0.5) * f.going, HF - i * f.riser, zc], f.going - 0.015, sw)
    for (const o of [zc - sw / 2 - 0.02, zc + sw / 2 + 0.02]) {
      member(k, [edge, HF - 0.09, o], [edge + sd * run, 0.09, o], 'UPN 160', FRAME, [0, 1, 0])
      handrail(k, [[edge, HF, o], [edge + sd * (f.steps - 1) * f.going, f.riser, o]])
    }
    const far = sd > 0 ? u0 : u1
    handrail(k, [[edge, HF, 0.06], [edge, HF, zc - sw / 2 - 0.02]])
    handrail(k, [[edge, HF, depth + 0.02], [far, HF, depth + 0.02], [far, HF, 0.06]])
  } else {
    const us = sd > 0 ? u1 - sw / 2 - 0.05 : u0 + sw / 2 + 0.05
    for (let i = 1; i < f.steps; i++) tread([us, HF - i * f.riser, depth + 0.02 + (i - 0.5) * f.going], sw, f.going - 0.015)
    for (const o of [us - sw / 2 - 0.02, us + sw / 2 + 0.02]) {
      member(k, [o, HF - 0.09, depth + 0.02], [o, 0.09, depth + 0.02 + run], 'UPN 160', FRAME, [0, 1, 0])
      handrail(k, [[o, HF, depth + 0.02], [o, f.riser, depth + 0.02 + (f.steps - 1) * f.going]])
    }
    const near = sd > 0 ? us - sw / 2 - 0.02 : us + sw / 2 + 0.02
    const far = sd > 0 ? u0 : u1
    handrail(k, [[near, HF, depth + 0.02], [far, HF, depth + 0.02], [far, HF, 0.06]])
    handrail(k, [[sd > 0 ? u1 : u0, HF, 0.06], [sd > 0 ? u1 : u0, HF, depth + 0.02]])
  }
}

/** Frame, threshold, canopy, bulkhead light, signs (wall frame, outer face z = 0), plus exit sign and extinguisher inside. */
function doorDressing(k: Kit, d: Door, HF: number, inside: boolean, first: P | null) {
  const { u, w: dw, h } = d
  k.box(FRAME, [dw + 2 * FR, FR, T + 0.04], [u, HF + h + FR / 2, -T / 2 + 0.01])
  for (const s of [-1, 1]) k.box(FRAME, [FR, h, T + 0.04], [u + s * (dw / 2 + FR / 2), HF + h / 2, -T / 2 + 0.01])
  k.box(FRAME, [dw, 0.025, 0.03], [u, HF + h - 0.012, -0.09])
  k.box('stainless', [dw + 2 * FR, 0.012, T + 0.06], [u, HF + 0.006, -T / 2])
  k.box(CLAD, [dw + 0.6, 0.04, 0.6], [u, HF + h + 0.35, 0.3])
  k.box(CLAD, [dw + 0.6, 0.15, 0.03], [u, HF + h + 0.29, 0.6])
  for (const s of [-1, 1]) k.rod(FRAME, [u + s * (dw / 2 + 0.25), HF + h + 0.33, 0.55], [u + s * (dw / 2 + 0.25), HF + h + 0.75, 0.02], 0.012, 6)
  const lu = u - (dw / 2 + 0.35)
  k.rbox('stainless', [0.3, 0.12, 0.1], 0.03, [lu, HF + h + 0.15, 0.06])
  k.box('lampLens', [0.25, 0.07, 0.02], [lu, HF + h + 0.15, 0.115])
  k.plane(signMaterial('exit'), 0.4, 0.2, [u, HF + h + 0.18, 0.004])
  const su = u + dw / 2 + 0.6
  k.plane(signMaterial(first ? 'ler' : 'hv', first ? first.label : undefined), 0.8, 0.4, [su, HF + 1.6, 0.004])
  k.plane(signMaterial(d.double ? 'hv' : 'noentry'), 0.5, 0.25, [su, HF + 1.1, 0.004])
  if (first) tagPlate(k, first.tag, [su, HF + 2.1, 0.004], 'z', 0.6)
  // A60 rating label on the frame, card reader / push button by the personnel door
  k.box('nameplate', [0.1, 0.05, 0.004], [u - dw / 2 - FR / 2, HF + 1.8, 0.012])
  // manual alarm call point outside the door (yellow, F&G)
  k.box('actuatorYellow', [0.1, 0.1, 0.05], [u - dw / 2 - 0.25, HF + 1.4, 0.025])
  k.box('glass', [0.07, 0.07, 0.004], [u - dw / 2 - 0.25, HF + 1.4, 0.052])
  if (!inside) return
  k.box(lamp('green'), [0.36, 0.16, 0.04], [u, HF + h + 0.2, -T - 0.02])
  k.plane(signMaterial('exit'), 0.34, 0.15, [u, HF + h + 0.2, -T - 0.041], eul(0, Math.PI, 0))
  const eu = u + dw / 2 + 0.4
  const red = paint('#c0261c', { roughness: 0.35, metalness: 0.2 })
  k.box('nut', [0.16, 0.06, 0.06], [eu, HF + 0.95, -T - 0.03])
  k.cyl(red, 0.085, 0.5, [eu, HF + 0.62, -T - 0.11], 'y', 16)
  k.dome(red, 0.085, [eu, HF + 0.87, -T - 0.11], 'y', Math.PI / 2, 0.6, 16)
  k.cyl('nut', 0.025, 0.08, [eu, HF + 0.93, -T - 0.11], 'y', 8)
  k.box(red, [0.09, 0.09, 0.05], [eu, HF + 1.45, -T - 0.025])
  k.box('glass', [0.06, 0.06, 0.005], [eu, HF + 1.45, -T - 0.052])
}

/** Switchgear opposite the double door, MCC on the -X end wall, ceiling with lights, overhead tray. */
function interiorFit(k: Kit, p: P, c: { SX: number; SZ: number; HF: number; CH: number; IX: number; IZ: number; dd: Door }) {
  const { HF, CH, IX, IZ } = c
  // ceiling tiles, recessed LED panels
  const g = new THREE.BoxGeometry(IX, 0.03, IZ)
  uvScale(g, IX / 0.6, IZ / 0.6)
  k.add(ceilingMaterial(), g, mat4([0, CH + 0.015, 0]))
  const light = paint('#ffffff', { emissive: '#fff3dc', emissiveIntensity: 1.5, roughness: 0.4, metalness: 0, clearcoat: 0, weather: 0 })
  const nx = Math.max(1, Math.round(IX / 2.2))
  const nz = Math.max(1, Math.round(IZ / 2.4))
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -IX / 2 + ((i + 0.5) * IX) / nx
      const z = -IZ / 2 + ((j + 0.5) * IZ) / nz
      k.box('aluminium', [0.64, 0.02, 1.24], [x, CH - 0.01, z])
      k.box(light, [0.58, 0.012, 1.18], [x, CH - 0.022, z])
    }
  // optical smoke detectors on the ceiling grid, between the light panels
  for (let i = 0; i < nx; i++) {
    const x = -IX / 2 + (i * IX) / nx + IX / nx
    if (i === nx - 1) continue
    for (const z of [-IZ * 0.2, IZ * 0.2]) {
      k.cyl('nameplate', 0.05, 0.025, [x, CH - 0.0125, z], 'y', 20)
      k.cyl(lamp('red'), 0.005, 0.006, [x + 0.03, CH - 0.026, z], 'y', 8)
    }
  }
  // MV switchgear against the rear wall, facing the double door
  const mvKind = IZ - 0.1 - panelSize('mv', p.kv)[2] >= 1.4 ? 'mv' : 'lv'
  const [pw, , D] = panelSize(mvKind, p.kv)
  const mcc = IX >= 6
  const x0 = -IX / 2 + (mcc ? 1.8 : 0.3)
  const x1 = IX / 2 - 0.3
  const n = Math.max(1, Math.min(14, Math.floor((x1 - x0 - 0.2) / pw)))
  const xm = (x0 + x1) / 2
  const rear = IZ - D - 0.8 >= 2.2 ? 0.8 : 0.1 // rear access aisle for metal-clad gear, else wall-standing front-access gear
  const zf = -IZ / 2 + rear + D
  k.at([xm, 0, zf], undefined, () => lineup(k, { kind: mvKind, panels: n, kv: p.kv, y0: HF, tag: 'SWBD-1' }))
  // MCC along the -X end wall, facing +X
  if (mcc) {
    const nm = Math.max(1, Math.min(10, Math.floor((IZ - 0.9) / 0.6)))
    k.at([-IX / 2 + 0.1 + 0.6, 0, -IZ / 2 + 0.25 + (nm * 0.6 + 0.1) / 2], eul(0, Math.PI / 2, 0), () => lineup(k, { kind: 'mcc', panels: nm, kv: 0.69, y0: HF, tag: 'MCC-1' }))
  }
  // ladder tray over the switchgear, rubber mat in front
  const yT = CH - 0.3
  for (const s of [-1, 1]) k.box('cableTray', [n * pw, 0.1, 0.006], [xm, yT, zf - D / 2 + s * 0.3])
  for (let x = xm - (n * pw) / 2 + 0.15; x < xm + (n * pw) / 2; x += 0.3) k.box('cableTray', [0.03, 0.02, 0.6], [x, yT - 0.04, zf - D / 2])
  for (let x = xm - (n * pw) / 2 + 0.4; x < xm + (n * pw) / 2; x += 1.5) for (const s of [-1, 1]) k.rod('nut', [x, yT - 0.05, zf - D / 2 + s * 0.3], [x, CH, zf - D / 2 + s * 0.3], 0.006, 5)
  k.box('rubberBlack', [n * pw, 0.008, 1.0], [xm, HF + 0.004, zf + 0.6])
}

/** A60 steel door leaf from its hinge along dir·X, sitting just inside the outer face. */
function leafBuilt(w: number, h: number, dir: 1 | -1): Built {
  const k = new Kit()
  const DOOR = paint('#cbd0cc', { metalness: 0.2, roughness: 0.45 })
  const t = 0.05
  const zc = -0.045
  const X = (x: number) => dir * x
  const lw = w - 0.012
  const x0 = 0.006
  const ww = Math.min(0.3, lw * 0.35)
  const wy0 = h * 0.6
  const wy1 = Math.min(h - 0.25, wy0 + 0.55)
  const wc = x0 + lw / 2
  const piece = (a: number, b: number, y0: number, y1: number) => k.box(DOOR, [b - a, y1 - y0, t], [X((a + b) / 2), (y0 + y1) / 2, zc])
  piece(x0, x0 + lw, 0.005, wy0)
  piece(x0, x0 + lw, wy1, h - 0.005)
  piece(x0, wc - ww / 2, wy0, wy1)
  piece(wc + ww / 2, x0 + lw, wy0, wy1)
  k.box('glass', [ww, wy1 - wy0, 0.012], [X(wc), (wy0 + wy1) / 2, zc])
  for (const zz of [zc + t / 2 + 0.004, zc - t / 2 - 0.004]) {
    for (const yy of [wy0, wy1]) k.box('stainless', [ww + 0.04, 0.02, 0.008], [X(wc), yy, zz])
    for (const s of [-1, 1]) k.box('stainless', [0.02, wy1 - wy0 + 0.04, 0.008], [X(wc + s * (ww / 2)), (wy0 + wy1) / 2, zz])
    k.box('stainless', [lw * 0.95, 0.22, 0.004], [X(wc), 0.13, zz])
  }
  for (const hy of [0.22, h / 2, h - 0.25]) k.cyl('nut', 0.016, 0.12, [X(0.004), hy, -0.012], 'y', 10)
  const zi = zc - t / 2
  k.rod('stainless', [X(0.12), 1.0, zi - 0.075], [X(lw - 0.06), 1.0, zi - 0.075], 0.017, 10)
  for (const bx of [0.12, lw - 0.09]) k.rbox('nut', [0.08, 0.1, 0.07], 0.01, [X(bx), 1.0, zi - 0.035])
  const zo = zc + t / 2
  const hx = lw - 0.08
  k.rod('stainless', [X(hx), 0.85, zo + 0.05], [X(hx), 1.25, zo + 0.05], 0.014, 8)
  for (const yy of [0.88, 1.22]) k.rod('stainless', [X(hx), yy, zo], [X(hx), yy, zo + 0.05], 0.01, 6)
  k.cyl('brass', 0.016, 0.02, [X(hx), 1.32, zo + 0.008], 'z', 12)
  k.rbox('nut', [0.3, 0.065, 0.06], 0.015, [X(0.25), h - 0.1, zi - 0.03])
  k.box('nut', [0.25, 0.015, 0.025], [X(0.38), h - 0.05, zi - 0.075], eul(0, dir * 0.6, 0))
  k.box('nameplate', [0.12, 0.05, 0.003], [X(0.1), h - 0.3, zo + 0.002])
  return k.build()
}
