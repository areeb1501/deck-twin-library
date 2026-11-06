/**
 * Piping "fabrication" — converts each PipeLine route into concrete components:
 *   straight hollow spools, long-radius hollow elbows, mating weld-neck flanges + gaskets +
 *   stud bolts at every equipment nozzle / valve / spool break, insulation & cladding,
 *   ISO 14726 service bands, supports (rack shoes, stanchions, rod hangers), valve and
 *   instrument placements, and a smooth centreline path for flow particles.
 *
 * Pure functions, no React. All output in deck-local coordinates.
 */
import * as THREE from 'three'
import { mergeFast, transformGeometry } from '../../three/fastGeo'
import type { Instrument, Nozzle, PipeLine, Plant, Rating, Valve, Vec3 } from '../../model/types'
import { GASKET, elbowRadius, flange, pipeOD, pipeWall, valveLength } from '../../model/catalog'
import { RACK_TIER } from '../../model/plant'
import { hollowElbow, hollowPipe, mergeGroups } from '../../three/pipeGeometry'
import { footprints, type Footprint } from '../../model/footprint'

const V = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2])

export interface Joint {
  /** joint plane centre */
  pos: THREE.Vector3
  /** pipe axis (unit) */
  axis: THREE.Vector3
  nps: number
  rating: Rating
  /** directions (from the joint plane) on which a MATING weld-neck flange must be drawn */
  flangeSides: THREE.Vector3[]
  line: string
}

export interface ValvePlacement {
  valve: Valve
  nps: number
  pos: THREE.Vector3
  quat: THREE.Quaternion
  length: number
}

export interface InstrumentPlacement {
  inst: Instrument
  pos: THREE.Vector3
  quat: THREE.Quaternion
  hostOd: number
}

export type SupportKind = 'shoe' | 'stanchion' | 'hanger' | 'guide'
export interface Support {
  kind: SupportKind
  /** point on the pipe bottom (shoe/stanchion) or top (hanger) */
  pos: THREE.Vector3
  /** pipe axis */
  axis: THREE.Vector3
  od: number
  /** stanchion: height from deck; hanger: rod length */
  height: number
}

export interface Band {
  pos: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  color: string
}

export interface BuiltLine {
  line: PipeLine
  /** hollow pipe + elbows; groups 0 paint, 1 bore */
  pipe: THREE.BufferGeometry
  /** cladding + mineral wool; groups 0 cladding, 1 wool */
  insulation: THREE.BufferGeometry | null
  /** for flow particles: dense centreline samples */
  path: THREE.Vector3[]
  pathLen: number[]
  bore: number
  joints: Joint[]
  supports: Support[]
  bands: Band[]
  /** spray nozzle positions (deluge) */
  sprays: { pos: THREE.Vector3; dir: THREE.Vector3 }[]
  /** small-bore vents (up) and drains (down) with their isolation valve: on the pipe surface, pointing away from it */
  stubs: { pos: THREE.Vector3; dir: THREE.Vector3; yaw: number }[]
  /** stainless cladding straps on insulated pipe */
  straps: { pos: THREE.Vector3; axis: THREE.Vector3; radius: number }[]
  /** tee weld saddles where a branch meets a header */
  tees: { pos: THREE.Vector3; axis: THREE.Vector3; od: number; hostOd: number }[]
  /** free ends in mid-air: weld cap (small bore) or blind flange (headers) */
  caps: { pos: THREE.Vector3; dir: THREE.Vector3; od: number; nps: number; rating: Rating; blind: boolean }[]
  /** where a line passes through a deck plate */
  sleeves: { pos: THREE.Vector3; od: number }[]
  length: number
}

export interface BuiltPiping {
  lines: BuiltLine[]
  valves: ValvePlacement[]
  instruments: InstrumentPlacement[]
  /** joints at PSV inlets (bolts only) */
  extraJoints: Joint[]
}

/** insulation thickness by size (heat conservation) */
export const insulationThickness = (nps: number) => (nps <= 2 ? 0.04 : nps <= 6 ? 0.05 : nps <= 12 ? 0.065 : 0.075)

/** a frame with +X along the flow axis and +Y along `up` (orthogonalised) */
export function axisFrame(axis: THREE.Vector3, upHint: THREE.Vector3) {
  const x = axis.clone().normalize()
  let up = upHint.clone().sub(x.clone().multiplyScalar(upHint.dot(x)))
  if (up.lengthSq() < 1e-6) {
    const alt = Math.abs(x.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    up = alt.sub(x.clone().multiplyScalar(alt.dot(x)))
    if (up.lengthSq() < 1e-6) up = new THREE.Vector3(0, 0, 1)
  }
  up.normalize()
  const z = new THREE.Vector3().crossVectors(x, up)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, z))
}

/** quaternion mapping +Y onto dir */
const quatY = (dir: THREE.Vector3) => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())

interface Cut {
  /** distance along the segment from p[i] */
  a: number
  b: number
  kind: 'valve' | 'spool' | 'nozzle' | 'tee' | 'free' | 'elbow'
}

export function buildPiping(plant: Plant): BuiltPiping {
  const nozzleOf = (eq: string, id: string): Nozzle => {
    const e = plant.equipment.find((x) => x.tag === eq)
    const n = e?.nozzles.find((x) => x.id === id)
    if (!n) throw new Error(`missing nozzle ${eq}/${id}`)
    return n
  }
  const lineByTag = new Map(plant.lines.map((l) => [l.tag, l]))
  const psvByLine = new Map(plant.valves.filter((v) => v.type === 'psv').map((v) => [v.line, v]))

  const outLines: BuiltLine[] = []
  const fps = footprints(plant.equipment, 0.15)
  const offshore = (plant.deck.site ?? 'offshoreAlpha') === 'offshoreAlpha'
  const ceilingY = offshore ? 10 : Infinity
  const valvePlacements: ValvePlacement[] = []
  const extraJoints: Joint[] = []

  for (const line of plant.lines) {
    const pts = line.route.map(V)
    const nSeg = pts.length - 1
    const od = pipeOD(line.nps)
    const wall = pipeWall(line.nps, line.schedule)
    const fl = flange(line.nps, 300)
    const rating: Rating = line.spec.startsWith('E') ? 900 : line.spec.startsWith('D') ? 600 : 300
    const flR = flange(line.nps, rating)
    const flLen = flR.length
    const segDir: THREE.Vector3[] = []
    const segLen: number[] = []
    for (let i = 0; i < nSeg; i++) {
      const d = pts[i + 1].clone().sub(pts[i])
      segLen.push(d.length())
      segDir.push(d.normalize())
    }

    // elbows: tangent lengths at each interior vertex
    const tan: number[] = new Array(pts.length).fill(0)
    const elbows: { start: THREE.Vector3; dA: THREE.Vector3; dB: THREE.Vector3; R: number; angle: number }[] = []
    for (let i = 1; i < nSeg; i++) {
      const dA = segDir[i - 1]
      const dB = segDir[i]
      const cos = THREE.MathUtils.clamp(dA.dot(dB), -1, 1)
      const angle = Math.acos(cos)
      if (angle < 1e-3) continue
      let R = elbowRadius(line.nps)
      const T0 = Math.tan(angle / 2)
      const maxT = 0.48 * Math.min(segLen[i - 1], segLen[i])
      if (R * T0 > maxT) R = maxT / T0
      tan[i] = R * T0
      elbows.push({ start: pts[i].clone().addScaledVector(dA, -tan[i]), dA, dB, R, angle })
    }

    const parts: { geo: THREE.BufferGeometry; group: number }[] = []
    const insParts: { geo: THREE.BufferGeometry; group: number }[] = []
    const insT = line.insulation ? insulationThickness(line.nps) : 0
    const insOd = od + 2 * insT
    const joints: Joint[] = []
    const supports: Support[] = []
    const stubs: BuiltLine['stubs'] = []
    const straps: BuiltLine['straps'] = []
    const bands: Band[] = []
    const tees: BuiltLine['tees'] = []
    const sprays: BuiltLine['sprays'] = []
    const caps: BuiltLine['caps'] = []
    const sleeves: BuiltLine['sleeves'] = []
    const segs = line.nps >= 10 ? 40 : line.nps >= 4 ? 30 : 20

    // elbow meshes
    for (const e of elbows) {
      const bend = e.dB.clone().sub(e.dA.clone().multiplyScalar(e.dB.dot(e.dA))).normalize()
      const z = new THREE.Vector3().crossVectors(bend, e.dA)
      const m = new THREE.Matrix4().makeBasis(bend, e.dA, z).setPosition(e.start)
      const g = hollowElbow(e.R, od, wall, e.angle, segs, Math.max(10, Math.round(e.angle * 12)))
      transformGeometry(g, m)
      parts.push({ geo: g, group: -1 }) // already grouped; handled below
      if (insT > 0) {
        const gi = hollowElbow(e.R, insOd, insT - 0.002, e.angle, segs, Math.max(10, Math.round(e.angle * 12)))
        transformGeometry(gi, m)
        insParts.push({ geo: gi, group: -1 })
      }
    }

    // end conditions
    const endTrim = (which: 'from' | 'to'): { trim: number; kind: Cut['kind'] } => {
      const end = line[which]
      const segIdx = which === 'from' ? 0 : nSeg - 1
      const p = which === 'from' ? pts[0] : pts[nSeg]
      const outward = which === 'from' ? segDir[0].clone() : segDir[segIdx].clone().negate() // pointing INTO the line
      if ('equipment' in end) {
        const n = nozzleOf(end.equipment, end.nozzle)
        const jp = V(n.pos).addScaledVector(V(n.dir), GASKET / 2)
        joints.push({ pos: jp, axis: V(n.dir), nps: n.nps, rating: n.rating, flangeSides: [V(n.dir)], line: line.tag })
        return { trim: GASKET + flange(n.nps, n.rating).length, kind: 'nozzle' }
      }
      if ('line' in end) {
        const host = lineByTag.get(end.line)
        const hostOd = host ? pipeOD(host.nps) : od
        tees.push({ pos: p.clone(), axis: outward, od, hostOd })
        return { trim: hostOd * 0.42, kind: 'tee' }
      }
      // terminates on a riser top flange (jacket export risers): flanged joint
      if (/riser/i.test(end.offDeck)) {
        const jp = p.clone().addScaledVector(outward, GASKET / 2)
        joints.push({ pos: jp, axis: outward.clone(), nps: line.nps, rating, flangeSides: [outward.clone()], line: line.tag })
        return { trim: GASKET + flLen, kind: 'nozzle' }
      }
      // off-deck: PSV outlet?
      const psv = which === 'from' ? psvByLine.get(line.tag) : undefined
      if (psv) {
        const jp = p.clone().addScaledVector(outward, GASKET / 2)
        joints.push({ pos: jp, axis: outward.clone(), nps: line.nps, rating: 150, flangeSides: [outward.clone()], line: line.tag })
        return { trim: GASKET + flange(line.nps, 150).length, kind: 'nozzle' }
      }
      // through a deck plate (or to grade): continues out of the model
      if (p.y < -0.2 || p.y > ceilingY - 0.1) return { trim: 0, kind: 'free' }
      // otherwise the end is in mid-air: close it properly so it reads as an intentional stub
      const away = outward.clone().negate()
      if (line.nps >= 6) {
        const r: Rating = rating
        const jp = p.clone()
        joints.push({ pos: jp, axis: away.clone(), nps: line.nps, rating: r, flangeSides: [outward.clone()], line: line.tag })
        caps.push({ pos: jp, dir: away, od, nps: line.nps, rating: r, blind: true })
        return { trim: GASKET / 2 + flange(line.nps, r).length, kind: 'nozzle' }
      }
      caps.push({ pos: p.clone(), dir: away, od, nps: line.nps, rating, blind: false })
      return { trim: 0, kind: 'free' }
    }
    const fromEnd = endTrim('from')
    const toEnd = endTrim('to')

    let total = 0
    for (let i = 0; i < nSeg; i++) {
      const p0 = pts[i]
      const d = segDir[i]
      const L = segLen[i]
      if (Math.abs(d.y) > 0.9) {
        const y0 = p0.y
        const y1 = pts[i + 1].y
        for (const plane of offshore ? [0, 10, -8] : [0]) {
          if ((y0 - plane) * (y1 - plane) < 0) sleeves.push({ pos: new THREE.Vector3(p0.x, plane, p0.z), od: od + 2 * (line.insulation ? insulationThickness(line.nps) : 0) })
        }
      }
      total += L
      const cuts: Cut[] = []
      // start/end occupancy
      const s0 = tan[i] + (i === 0 ? fromEnd.trim : 0)
      const s1 = L - tan[i + 1] - (i === nSeg - 1 ? toEnd.trim : 0)
      cuts.push({ a: -1e9, b: s0, kind: i === 0 ? fromEnd.kind : 'elbow' })
      cuts.push({ a: s1, b: 1e9, kind: i === nSeg - 1 ? toEnd.kind : 'elbow' })

      // valves on this segment
      for (const v of plant.valves) {
        if (v.line !== line.tag || v.seg !== i) continue
        const vl = valveLength(v.type, line.nps)
        const c = v.t * L
        const half = vl / 2
        const occ = half + GASKET + flLen
        if (c - occ < s0 - 1e-3 || c + occ > s1 + 1e-3) console.warn(`[piping] ${v.tag} does not fit on ${line.tag} seg ${i}`)
        cuts.push({ a: c - occ, b: c + occ, kind: 'valve' })
        const center = p0.clone().addScaledVector(d, c)
        const up = v.up ? V(v.up) : new THREE.Vector3(0, 1, 0)
        valvePlacements.push({ valve: v, nps: line.nps, pos: center, quat: axisFrame(d, up), length: vl })
        for (const s of [-1, 1]) {
          const side = d.clone().multiplyScalar(s)
          joints.push({
            pos: center.clone().addScaledVector(side, half + GASKET / 2),
            axis: d.clone(),
            nps: line.nps,
            rating,
            flangeSides: [side],
            line: line.tag,
          })
        }
      }
      cuts.sort((x, y) => x.a - y.a)

      // free intervals
      const free: { a: number; b: number; ka: Cut['kind']; kb: Cut['kind'] }[] = []
      let cursor = cuts[0].b
      let kPrev = cuts[0].kind
      for (let k = 1; k < cuts.length; k++) {
        if (cuts[k].a > cursor + 1e-4) free.push({ a: cursor, b: cuts[k].a, ka: kPrev, kb: cuts[k].kind })
        if (cuts[k].b > cursor) {
          cursor = cuts[k].b
          kPrev = cuts[k].kind
        }
      }

      // long runs get a field flange break every ~11 m (spools are shop-fabricated)
      const pieces: typeof free = []
      for (const f of free) {
        const len = f.b - f.a
        const nBreaks = Math.floor(len / 11.5)
        if (nBreaks === 0 || line.nps < 3) {
          pieces.push(f)
          continue
        }
        let a = f.a
        let ka = f.ka
        for (let k = 1; k <= nBreaks; k++) {
          const m = f.a + (len * k) / (nBreaks + 1)
          const occ = GASKET / 2 + flLen
          pieces.push({ a, b: m - occ, ka, kb: 'spool' })
          joints.push({
            pos: p0.clone().addScaledVector(d, m),
            axis: d.clone(),
            nps: line.nps,
            rating,
            flangeSides: [d.clone().negate(), d.clone()],
            line: line.tag,
          })
          a = m + occ
          ka = 'spool'
        }
        pieces.push({ a, b: f.b, ka, kb: f.kb })
      }

      for (const pc of pieces) {
        const len = pc.b - pc.a
        if (len <= 1e-3) continue
        const start = p0.clone().addScaledVector(d, pc.a)
        const q = quatY(d)
        const g = hollowPipe(len, od, wall, segs)
        g.applyQuaternion(q)
        g.translate(start.x, start.y, start.z)
        parts.push({ geo: g, group: -1 })

        if (insT > 0) {
          const gap = (k: Cut['kind']) => (k === 'elbow' || k === 'free' ? 0 : k === 'tee' ? 0.05 : 0.14)
          const ia = pc.a + gap(pc.ka)
          const ib = pc.b - gap(pc.kb)
          if (ib - ia > 0.05) {
            const gi = hollowPipe(ib - ia, insOd, insT - 0.002, segs)
            gi.applyQuaternion(q)
            const s = p0.clone().addScaledVector(d, ia)
            gi.translate(s.x, s.y, s.z)
            insParts.push({ geo: gi, group: -1 })
          }
        }

        // a vent or drain on most long runs, and the straps that hold the cladding on
        if (len > 2.4 && line.nps >= 2 && !line.sprayNozzles) {
          const horiz = Math.abs(d.y) < 0.1
          const seed = Math.abs(start.x * 7.1 + start.z * 13.7 + start.y * 3.3)
          if (horiz && seed % 1 < 0.72) {
            const up = seed % 2 < 1
            stubs.push({ pos: p0.clone().addScaledVector(d, pc.a + len * (0.3 + 0.4 * ((seed * 3) % 1))).add(new THREE.Vector3(0, ((up ? 1 : -1) * (insT > 0 ? insOd : od)) / 2, 0)), dir: new THREE.Vector3(0, up ? 1 : -1, 0), yaw: seed })
          }
        }
        if (insT > 0)
          for (let k = pc.a + 0.6; k < pc.b - 0.3; k += 0.6) straps.push({ pos: p0.clone().addScaledVector(d, k), axis: d.clone(), radius: insOd / 2 + 0.0015 })

        // ISO 14726 identification bands next to flanged joints / valves
        const bandR = (insT > 0 ? insOd : od) / 2 + 0.002
        if (pc.ka !== 'elbow' && pc.ka !== 'free' && pc.ka !== 'tee' && len > 0.6)
          bands.push({ pos: p0.clone().addScaledVector(d, pc.a + 0.32), axis: d.clone(), radius: bandR, color: '' })
        if (pc.kb !== 'elbow' && pc.kb !== 'free' && pc.kb !== 'tee' && len > 0.6)
          bands.push({ pos: p0.clone().addScaledVector(d, pc.b - 0.32), axis: d.clone(), radius: bandR, color: '' })

        // supports
        addSupports(supports, line, start, d, len, od + 2 * insT, fps)
      }

      // deluge spray nozzles on the last segment
      if (line.sprayNozzles && i === nSeg - 1) {
        const n = Math.floor((L - tan[i]) / 1.2)
        for (let k = 1; k <= n; k++) {
          const pos = p0.clone().addScaledVector(d, tan[i] + k * 1.2 - 0.4)
          const side = new THREE.Vector3(0, 0, 1).cross(d).lengthSq() > 0.1 ? new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize() : new THREE.Vector3(1, 0, 0)
          const toward = side.multiplyScalar(k % 2 === 0 ? 1 : -1)
          sprays.push({ pos, dir: new THREE.Vector3(0, -1, 0).add(toward.multiplyScalar(0.6)).normalize() })
        }
      }
    }

    // merge: pre-grouped geometries -> regroup by material index
    const pipe = mergeGrouped(parts.map((p) => p.geo))
    const insulation = insParts.length ? mergeGrouped(insParts.map((p) => p.geo)) : null
    for (const p of parts) p.geo.dispose()
    for (const p of insParts) p.geo.dispose()

    // flow path with rounded elbows
    const path: THREE.Vector3[] = [pts[0].clone()]
    for (let i = 1; i < nSeg; i++) {
      const e = elbows.find((x) => x.start.distanceTo(pts[i].clone().addScaledVector(segDir[i - 1], -tan[i])) < 1e-6)
      if (!e) {
        path.push(pts[i].clone())
        continue
      }
      const bend = e.dB.clone().sub(e.dA.clone().multiplyScalar(e.dB.dot(e.dA))).normalize()
      const centre = e.start.clone().addScaledVector(bend, e.R)
      const from = e.start.clone().sub(centre)
      const steps = 8
      for (let k = 0; k <= steps; k++) {
        const a = (k / steps) * e.angle
        const v = from.clone().applyAxisAngle(new THREE.Vector3().crossVectors(e.dA, bend).normalize(), a)
        path.push(centre.clone().add(v))
      }
    }
    path.push(pts[nSeg].clone())
    const pathLen = [0]
    for (let k = 1; k < path.length; k++) pathLen.push(pathLen[k - 1] + path[k].distanceTo(path[k - 1]))

    outLines.push({
      line,
      pipe,
      insulation,
      path,
      pathLen,
      bore: od / 2 - wall,
      joints,
      supports,
      bands,
      sprays,
      stubs,
      straps,
      tees,
      caps,
      sleeves,
      length: total,
    })
    void fl
  }

  // PSV inlet joints (bolts + gasket only; PSV and nozzle each own their flange)
  for (const v of plant.valves) {
    if (v.type !== 'psv' || !v.mount) continue
    const n = nozzleOf(v.mount.equipment, v.mount.nozzle)
    extraJoints.push({ pos: V(n.pos).addScaledVector(V(n.dir), GASKET / 2), axis: V(n.dir), nps: n.nps, rating: n.rating, flangeSides: [], line: v.tag })
    const out = V(v.outletDir ?? [1, 0, 0])
    const y = V(n.dir)
    const z = new THREE.Vector3().crossVectors(out, y)
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(out, y, z))
    valvePlacements.push({ valve: v, nps: n.nps, pos: V(n.pos).addScaledVector(y, GASKET), quat, length: 0 })
  }

  // instruments
  const instruments: InstrumentPlacement[] = []
  for (const inst of plant.instruments) {
    if ('line' in inst.on) {
      const b = outLines.find((l) => l.line.tag === (inst.on as { line: string }).line)
      if (!b) continue
      const r = b.line.route
      const seg = inst.on.seg
      const a = V(r[seg])
      const d = V(r[seg + 1]).sub(a)
      const L = d.length()
      d.normalize()
      const centre = a.addScaledVector(d, inst.on.t * L)
      const ins = b.line.insulation ? insulationThickness(b.line.nps) : 0
      const host = pipeOD(b.line.nps)
      let dir = V(inst.dir ?? [0, 1, 0])
      dir.sub(d.clone().multiplyScalar(dir.dot(d)))
      if (dir.lengthSq() < 1e-6) dir = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      dir.normalize()
      const pos = centre.addScaledVector(dir, host / 2 + ins)
      // rotate so the instrument's local +X runs along the pipe axis (nice for FT orifice runs)
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, dir, new THREE.Vector3().crossVectors(d, dir)))
      instruments.push({ inst, pos, quat: q, hostOd: host + 2 * ins })
    } else {
      const eq = plant.equipment.find((e) => e.tag === (inst.on as { equipment: string }).equipment)
      if (!eq) continue
      if (inst.on.nozzle) {
        const n = eq.nozzles.find((x) => x.id === (inst.on as { nozzle: string }).nozzle)!
        const dir = V(n.dir)
        instruments.push({ inst, pos: V(n.pos).addScaledVector(dir, GASKET), quat: quatY(dir), hostOd: pipeOD(n.nps) })
      } else if (inst.on.at) {
        // standoff along +Y = dir, and local +Z = world up (LT/LG bridles run along local +Z)
        const dir = V(inst.dir ?? [0, 0, 1]).normalize()
        const up = new THREE.Vector3(0, 1, 0)
        const x = new THREE.Vector3().crossVectors(dir, up).normalize()
        const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, dir, up))
        instruments.push({ inst, pos: V(inst.on.at), quat: q, hostOd: 2.0 })
      }
    }
  }

  return { lines: outLines, valves: valvePlacements, instruments, extraJoints }
}

/** merge geometries that each already carry groups 0/1 (from mergeGroups) */
function mergeGrouped(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g0: THREE.BufferGeometry[] = []
  const g1: THREE.BufferGeometry[] = []
  for (const g of geos) {
    const [a, b] = splitGroups(g)
    if (a) g0.push(a)
    if (b) g1.push(b)
  }
  const parts: { geo: THREE.BufferGeometry; group: number }[] = []
  if (g0.length) parts.push({ geo: mergeFast(g0)!, group: 0 })
  if (g1.length) parts.push({ geo: mergeFast(g1)!, group: 1 })
  return mergeGroups(parts)
}

function splitGroups(g: THREE.BufferGeometry): [THREE.BufferGeometry | null, THREE.BufferGeometry | null] {
  const out: (THREE.BufferGeometry | null)[] = [null, null]
  for (const gr of g.groups) {
    if (gr.materialIndex === undefined || gr.materialIndex > 1) continue
    out[gr.materialIndex] = compact(g, gr.start, gr.count)
  }
  return [out[0], out[1]]
}

/** one index range of a geometry as its own, with only the vertices it uses, so merged buffers stay small */
function compact(g: THREE.BufferGeometry, start: number, count: number) {
  const idx = g.index!.array
  let mn = Infinity
  let mx = -1
  for (let i = start, e = start + count; i < e; i++) {
    const v = idx[i]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const range = mx - mn + 1
  const remap = new Int32Array(range).fill(-1)
  const newIdx = new Uint32Array(count)
  let n = 0
  for (let i = 0; i < count; i++) {
    const v = idx[start + i] - mn
    let r = remap[v]
    if (r < 0) r = remap[v] = n++
    newIdx[i] = r
  }
  const out = new THREE.BufferGeometry()
  for (const name of Object.keys(g.attributes)) {
    const src = g.attributes[name] as THREE.BufferAttribute
    const k = src.itemSize
    const from = src.array as ArrayLike<number>
    const arr = new Float32Array(n * k)
    for (let v = 0; v < range; v++) {
      const r = remap[v]
      if (r < 0) continue
      for (let c = 0; c < k; c++) arr[r * k + c] = from[(mn + v) * k + c]
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, k))
  }
  out.setIndex(new THREE.BufferAttribute(n > 65535 ? newIdx : new Uint16Array(newIdx), 1))
  return out
}

const BENTS = [-24, -18, -12, -6, 0, 6, 12, 18, 24]
/** no post may stand in the production deck's escape aisles or perimeter walkway */
const onWalkway = (p: THREE.Vector3) => (Math.abs(p.z) > 2.5 && Math.abs(p.z) < 4.5) || Math.abs(p.z) > 18.7 || Math.abs(p.x) > 28.7
const UPPER_DECK_UNDERSIDE = 9.4

function addSupports(out: Support[], line: PipeLine, start: THREE.Vector3, d: THREE.Vector3, len: number, outerOd: number, fps: Footprint[]) {
  const overEquipment = (p: THREE.Vector3) => fps.some((f) => p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z < f.z1)
  if (Math.abs(d.y) > 0.5) return // verticals: guided at nozzles; skip
  if (line.nps < 2) return
  const bottomY = start.y - outerOd / 2
  const onRackZ = (z: number) => z > -2.05 && z < 2.05
  // rack shoe: pipe sits on a tier
  for (const tier of [1, 2] as const) {
    if (Math.abs(bottomY - (RACK_TIER[tier] + 0.1)) < 0.03 && Math.abs(d.x) > 0.9 && onRackZ(start.z)) {
      for (const bx of BENTS) {
        const t = (bx - start.x) / d.x
        if (t > 0.15 && t < len - 0.15) {
          const p = start.clone().addScaledVector(d, t)
          out.push({ kind: 'shoe', pos: new THREE.Vector3(p.x, bottomY, p.z), axis: d.clone(), od: outerOd, height: 0.1 })
        }
      }
      return
    }
  }
  // crossing over the rack along Z: rests on tier-2 stringers is unrealistic — hang it
  const spacing = line.nps >= 8 ? 5.5 : line.nps >= 4 ? 4.5 : 3.5
  const n = Math.max(len > 1.6 ? 1 : 0, Math.floor(len / spacing))
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? len / 2 : ((k + 0.5) * len) / n
    const p = start.clone().addScaledVector(d, t)
    if (onRackZ(p.z) && p.y > 4 && p.y < 7.2) continue
    if (start.y > 6.2 && start.y < UPPER_DECK_UNDERSIDE) {
      const top = p.y + outerOd / 2
      out.push({ kind: 'hanger', pos: new THREE.Vector3(p.x, top, p.z), axis: d.clone(), od: outerOd, height: UPPER_DECK_UNDERSIDE - top })
    } else if (bottomY > 0.15 && bottomY < 6.2 && !overEquipment(p)) {
      if (!onWalkway(p)) out.push({ kind: 'stanchion', pos: new THREE.Vector3(p.x, bottomY, p.z), axis: d.clone(), od: outerOd, height: bottomY })
    }
  }
}
