/**
 * Renders the fabricated piping (see build.ts): one merged mesh per line for the hollow
 * pipe + elbows, one for insulation, and instanced flanges / gaskets / studs / nuts /
 * bands / supports for the whole deck. Valves and instruments are placed as components.
 *
 * Live state: each valve's moving part follows the simulation's travel (`valves[tag].pos`, eased in
 * useFrame inside ValveModel — no re-render of the piping), the actuated valves carry instanced
 * open / closed / stuck flags (fx/ValveFlags), and the deluge spray pipes discharge water while their
 * deluge valve is open (fx/DelugeSpray).
 */
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { BuiltPiping, Joint, Support } from './build'
import { GASKET, SERVICE, flange } from '../../model/catalog'
import { materials, registerMaterial } from '../../three/materials'
import { weldNeckFlange, cached } from '../../three/pipeGeometry'
import { ValveModel } from '../equipment/Valve'
import { InstrumentModel } from '../equipment/Instrument'
import type { PickData } from '../../model/types'
import { useStore } from '../../state/store'
import { usePlantStore } from '../../state/plantStore'
import { ValveFlags } from '../fx/ValveFlags'
import { DelugeSpray } from '../fx/DelugeSpray'

const Y = new THREE.Vector3(0, 1, 0)
const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()

const woolMat = registerMaterial(new THREE.MeshStandardMaterial({ color: '#cbb878', roughness: 0.95, metalness: 0, side: THREE.DoubleSide }), 'internal')
const bandMat = registerMaterial(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.1 }), 'detail')

export function Piping({ built }: { built: BuiltPiping }) {
  const layers = useStore((s) => s.layers)
  const plant = usePlantStore((s) => s.plant)
  return (
    <group>
      {layers.piping && (
        <>
          {built.lines.map((b) => (
            <LineMesh key={b.line.tag} b={b} />
          ))}
          <Flanges built={built} />
          <Bands built={built} />
          <Supports built={built} />
          <Tees built={built} />
          <Sprays built={built} />
          <DelugeSpray built={built} plant={plant} />
          <ValveFlags built={built} />
          <EndsAndSleeves built={built} />
          {built.valves.map((v) => (
            <group
              key={v.valve.tag}
              position={v.pos}
              quaternion={v.quat}
              userData={{ pick: { tag: v.valve.tag, kind: 'valve' } satisfies PickData }}
            >
              <ValveModel
                type={v.valve.type}
                nps={v.nps}
                actuator={v.valve.actuator}
                open={v.valve.normally === 'open'}
                tag={v.valve.tag}
              />
            </group>
          ))}
        </>
      )}
      {layers.instruments &&
        built.instruments.map((p) => (
          <group key={p.inst.tag} position={p.pos} quaternion={p.quat} userData={{ pick: { tag: p.inst.tag, kind: 'instrument' } satisfies PickData }}>
            <InstrumentModel type={p.inst.type} hostOd={p.hostOd} tag={p.inst.tag} size={p.inst.type === 'LT' ? 1.6 : undefined} />
          </group>
        ))}
    </group>
  )
}

function LineMesh({ b }: { b: BuiltPiping['lines'][number] }) {
  const m = materials()
  const outer = b.line.service === 'firewater' ? m.firewaterPaint : m.pipePaint
  const pick = { pick: { tag: b.line.tag, kind: 'line' } satisfies PickData }
  return (
    <group userData={pick}>
      <mesh geometry={b.pipe} material={[outer, m.pipeBore]} castShadow receiveShadow />
      {b.insulation && <mesh geometry={b.insulation} material={[m.insulation, woolMat]} castShadow receiveShadow />}
    </group>
  )
}

// ---------------------------------------------------------------- flanged joints
function Flanges({ built }: { built: BuiltPiping }) {
  const m = materials()
  const joints = useMemo(() => [...built.lines.flatMap((l) => l.joints), ...built.extraJoints], [built])

  // group mating flanges by size/rating
  const flangeGroups = useMemo(() => {
    const map = new Map<string, { nps: number; rating: Joint['rating']; mats: THREE.Matrix4[]; tags: string[] }>()
    for (const j of joints) {
      const fl = cached(`wn-${j.nps}-${j.rating}`, () => weldNeckFlange(j.nps, j.rating))
      for (const s of j.flangeSides) {
        const key = `${j.nps}-${j.rating}`
        if (!map.has(key)) map.set(key, { nps: j.nps, rating: j.rating, mats: [], tags: [] })
        const pos = j.pos.clone().addScaledVector(s, GASKET / 2 + fl.length)
        const q = new THREE.Quaternion().setFromUnitVectors(Y, s.clone().negate())
        map.get(key)!.mats.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)))
        map.get(key)!.tags.push(j.line)
      }
    }
    return [...map.values()]
  }, [joints])

  // studs, nuts, gaskets
  const { studs, nuts, gaskets, jointTags } = useMemo(() => {
    const studs: THREE.Matrix4[] = []
    const nuts: THREE.Matrix4[] = []
    const gaskets: THREE.Matrix4[] = []
    const jointTags: string[] = []
    for (const j of joints) {
      const f = flange(j.nps, j.rating)
      const rfH = 0.0016 * (j.rating >= 600 ? 4 : 1) + 0.002
      const nutH = f.boltDia * 1.0
      const back = GASKET / 2 + rfH + f.thickness
      const half = back + nutH + f.boltDia * 0.45
      const q = new THREE.Quaternion().setFromUnitVectors(Y, j.axis)
      // perpendicular basis
      const u = new THREE.Vector3(1, 0, 0).applyQuaternion(q)
      const w = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
      const r = f.boltCircle / 2
      for (let k = 0; k < f.bolts; k++) {
        const a = ((k + 0.5) / f.bolts) * Math.PI * 2
        const p = j.pos.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(w, Math.sin(a) * r)
        studs.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(f.boltDia / 2, half * 2, f.boltDia / 2)))
        for (const s of [-1, 1]) {
          const np = p.clone().addScaledVector(j.axis, s * (back + nutH / 2))
          // rotate each nut a little so they don't look cloned
          const nq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, (k * 0.7) % 1.04))
          nuts.push(new THREE.Matrix4().compose(np, nq, new THREE.Vector3(f.boltDia * 0.87, nutH, f.boltDia * 0.87)))
        }
      }
      gaskets.push(new THREE.Matrix4().compose(j.pos, q, new THREE.Vector3(f.raisedFaceDia / 2 + 0.014, GASKET, f.raisedFaceDia / 2 + 0.014)))
      jointTags.push(j.line)
    }
    return { studs, nuts, gaskets, jointTags }
  }, [joints])

  const studGeo = useMemo(() => cached('unit-stud', () => new THREE.CylinderGeometry(1, 1, 1, 10, 1)), [])
  const nutGeo = useMemo(() => cached('unit-nut', () => chamferedHex()), [])
  const gasketGeo = useMemo(() => cached('unit-gasket', () => new THREE.CylinderGeometry(1, 1, 1, 40, 1)), [])

  return (
    <group>
      {flangeGroups.map((g) => (
        <Instanced
          key={`${g.nps}-${g.rating}`}
          geometry={cached(`wn-${g.nps}-${g.rating}`, () => weldNeckFlange(g.nps, g.rating)).geometry}
          material={[m.flangeSteel, m.pipeBore, m.pipeCut]}
          matrices={g.mats}
          tags={g.tags}
          kind="line"
        />
      ))}
      <Instanced geometry={studGeo} material={m.boltXylan} matrices={studs} />
      <Instanced geometry={nutGeo} material={m.nut} matrices={nuts} />
      <Instanced geometry={gasketGeo} material={m.gasket} matrices={gaskets} tags={jointTags} kind="line" />
    </group>
  )
}

/** hexagonal nut with chamfered corners, unit across-corners radius, unit height */
function chamferedHex() {
  const pts: [number, number][] = [
    [0.45, -0.5],
    [0.92, -0.5],
    [1, -0.42],
    [1, 0.42],
    [0.92, 0.5],
    [0.45, 0.5],
  ]
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    6,
  )
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------- generic instancing helper
function Instanced({
  geometry,
  material,
  matrices,
  colors,
  tags,
  kind,
  castShadow = true,
}: {
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  matrices: THREE.Matrix4[]
  colors?: THREE.Color[]
  tags?: string[]
  kind?: PickData['kind']
  castShadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m))
    if (colors) colors.forEach((c, i) => mesh.setColorAt(i, c))
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.computeBoundingBox()
  }, [matrices, colors])
  if (!matrices.length) return null
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, matrices.length]}
      castShadow={castShadow}
      receiveShadow
      userData={tags && kind ? { instanceTags: tags, instanceKind: kind } : undefined}
    />
  )
}

// ---------------------------------------------------------------- service bands
function Bands({ built }: { built: BuiltPiping }) {
  const geo = useMemo(() => cached('unit-band', () => new THREE.CylinderGeometry(1, 1, 1, 48, 1, true)), [])
  const { mats, cols, tags } = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    const cols: THREE.Color[] = []
    const tags: string[] = []
    for (const l of built.lines) {
      const c = new THREE.Color(SERVICE[l.line.service].paint)
      for (const b of l.bands) {
        const q = new THREE.Quaternion().setFromUnitVectors(Y, b.axis)
        mats.push(new THREE.Matrix4().compose(b.pos, q, new THREE.Vector3(b.radius, 0.1, b.radius)))
        cols.push(c)
        tags.push(l.line.tag)
      }
    }
    return { mats, cols, tags }
  }, [built])
  return <Instanced geometry={geo} material={bandMat} matrices={mats} colors={cols} tags={tags} kind="line" castShadow={false} />
}

// ---------------------------------------------------------------- tees (weldolet saddles)
function Tees({ built }: { built: BuiltPiping }) {
  const m = materials()
  const geo = useMemo(
    () =>
      cached('unit-weldolet', () => {
        // flared contour: wide at the header, tapering to the branch OD
        const g = new THREE.CylinderGeometry(0.5, 0.68, 1, 32, 1, false)
        g.translate(0, 0.5, 0)
        return g
      }),
    [],
  )
  const mats = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (const l of built.lines)
      for (const t of l.tees) {
        const q = new THREE.Quaternion().setFromUnitVectors(Y, t.axis)
        const start = t.pos.clone().addScaledVector(t.axis, t.hostOd * 0.36)
        const h = t.hostOd * 0.16 + t.od * 0.35
        out.push(new THREE.Matrix4().compose(start, q, new THREE.Vector3(t.od * 1.04, h, t.od * 1.04)))
      }
    return out
  }, [built])
  return <Instanced geometry={geo} material={m.pipePaint} matrices={mats} />
}

// ---------------------------------------------------------------- deluge spray nozzles
function Sprays({ built }: { built: BuiltPiping }) {
  const m = materials()
  const geo = useMemo(
    () =>
      cached('spray-nozzle', () => {
        const g = new THREE.LatheGeometry(
          [
            [0.012, 0],
            [0.016, 0],
            [0.016, 0.05],
            [0.026, 0.07],
            [0.03, 0.1],
            [0.022, 0.105],
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          12,
        )
        g.computeVertexNormals()
        return g
      }),
    [],
  )
  const mats = useMemo(() => {
    const out: THREE.Matrix4[] = []
    for (const l of built.lines)
      for (const s of l.sprays) {
        const q = new THREE.Quaternion().setFromUnitVectors(Y, s.dir)
        out.push(new THREE.Matrix4().compose(s.pos.clone().addScaledVector(s.dir, 0.04), q, new THREE.Vector3(1, 1, 1)))
      }
    return out
  }, [built])
  return <Instanced geometry={geo} material={m.brass} matrices={mats} />
}

// ---------------------------------------------------------------- supports
function Supports({ built }: { built: BuiltPiping }) {
  const m = materials()
  const box = useMemo(() => cached('unit-box', () => new THREE.BoxGeometry(1, 1, 1)), [])
  const post = useMemo(() => cached('unit-post', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1)), [])
  const ubolt = useMemo(() => cached('unit-ubolt', () => new THREE.TorusGeometry(1, 0.045, 6, 24, Math.PI)), [])
  const ring = useMemo(() => cached('unit-clamp', () => new THREE.TorusGeometry(1, 0.06, 6, 28)), [])

  const sets = useMemo(() => {
    const plates: THREE.Matrix4[] = []
    const posts: THREE.Matrix4[] = []
    const ubolts: THREE.Matrix4[] = []
    const clamps: THREE.Matrix4[] = []
    const rods: THREE.Matrix4[] = []
    const all: Support[] = built.lines.flatMap((l) => l.supports)
    for (const s of all) {
      const ax = s.axis.clone().setY(0).normalize()
      const yaw = Math.atan2(-ax.z, ax.x)
      const qYaw = new THREE.Quaternion().setFromAxisAngle(Y, yaw)
      const r = s.od / 2
      if (s.kind === 'shoe') {
        // T-shoe: web + base plate + curved top plate approximated as a flat pad
        plates.push(mtx(s.pos.clone().add(new THREE.Vector3(0, -0.05, 0)), qYaw, [0.32, 0.1, 0.014]))
        plates.push(mtx(s.pos.clone().add(new THREE.Vector3(0, -0.094, 0)), qYaw, [0.34, 0.012, Math.max(0.16, r * 0.9)]))
        plates.push(mtx(s.pos.clone().add(new THREE.Vector3(0, -0.004, 0)), qYaw, [0.3, 0.01, Math.max(0.1, r * 0.8)]))
        // hold-down guide lugs on the beam either side
        const side = new THREE.Vector3(0, 0, 1).applyQuaternion(qYaw)
        for (const sg of [-1, 1])
          plates.push(mtx(s.pos.clone().addScaledVector(side, sg * (Math.max(0.16, r * 0.9) / 2 + 0.02)).add(new THREE.Vector3(0, -0.07, 0)), qYaw, [0.1, 0.06, 0.012]))
      } else if (s.kind === 'stanchion') {
        const pr = s.od > 0.25 ? 0.084 : 0.057
        const h = s.height - 0.02
        posts.push(mtx(new THREE.Vector3(s.pos.x, h / 2, s.pos.z), tmpQ.identity(), [pr, h, pr]))
        plates.push(mtx(new THREE.Vector3(s.pos.x, 0.01, s.pos.z), qYaw, [pr * 4, 0.02, pr * 4]))
        plates.push(mtx(new THREE.Vector3(s.pos.x, h - 0.006, s.pos.z), qYaw, [Math.max(0.16, r * 0.7), 0.014, Math.max(0.2, r * 1.4)]))
        // U-bolt over the pipe
        const centre = s.pos.clone().add(new THREE.Vector3(0, r, 0))
        const qU = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))
        ubolts.push(mtx(centre, qU, [r + 0.012, r + 0.012, (r + 0.012) * 1]))
        // gusset
        plates.push(mtx(new THREE.Vector3(s.pos.x, 0.12, s.pos.z), qYaw, [0.012, 0.22, pr * 3.4]))
      } else if (s.kind === 'hanger') {
        const centre = s.pos.clone().add(new THREE.Vector3(0, -r, 0))
        const qC = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2))
        clamps.push(mtx(centre, qC, [r + 0.014, r + 0.014, r + 0.014]))
        rods.push(mtx(new THREE.Vector3(s.pos.x, s.pos.y + 0.03 + s.height / 2, s.pos.z), tmpQ.identity(), [0.012, s.height, 0.012]))
        // turnbuckle + beam clamp
        rods.push(mtx(new THREE.Vector3(s.pos.x, s.pos.y + s.height * 0.45, s.pos.z), tmpQ.identity(), [0.022, 0.14, 0.022]))
        plates.push(mtx(new THREE.Vector3(s.pos.x, s.pos.y + s.height - 0.02, s.pos.z), qYaw, [0.18, 0.04, 0.14]))
      }
    }
    return { plates, posts, ubolts, clamps, rods }
  }, [built])

  return (
    <group>
      <Instanced geometry={box} material={m.structSteelDark} matrices={sets.plates} />
      <Instanced geometry={post} material={m.structSteel} matrices={sets.posts} />
      <Instanced geometry={ubolt} material={m.stainless} matrices={sets.ubolts} castShadow={false} />
      <Instanced geometry={ring} material={m.stainless} matrices={sets.clamps} castShadow={false} />
      <Instanced geometry={post} material={m.stainless} matrices={sets.rods} />
    </group>
  )
}

function mtx(p: THREE.Vector3, q: THREE.Quaternion, s: [number, number, number]) {
  tmpS.set(s[0], s[1], s[2])
  return tmpM.clone().compose(p, q, tmpS)
}


// ---------------------------------------------------------------- caps, blinds, deck sleeves
function EndsAndSleeves({ built }: { built: BuiltPiping }) {
  const m = materials()
  const capGeo = useMemo(
    () =>
      cached('unit-weldcap', () => {
        // ASME B16.9 cap: semi-ellipsoidal, depth ~ 0.55 OD; unit radius
        const pts: THREE.Vector2[] = []
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * (Math.PI / 2)
          pts.push(new THREE.Vector2(Math.cos(a), Math.sin(a) * 0.55 * 2 * 0.5))
        }
        pts.push(new THREE.Vector2(0, 0.55))
        const g = new THREE.LatheGeometry(pts, 28)
        g.computeVertexNormals()
        return g
      }),
    [],
  )
  const disc = useMemo(() => cached('unit-disc', () => new THREE.CylinderGeometry(1, 1, 1, 40, 1)), [])
  const box = useMemo(() => cached('unit-box', () => new THREE.BoxGeometry(1, 1, 1)), [])
  const sets = useMemo(() => {
    const caps: THREE.Matrix4[] = []
    const blinds: THREE.Matrix4[] = []
    const collars: THREE.Matrix4[] = []
    const plates: THREE.Matrix4[] = []
    for (const l of built.lines) {
      for (const c of l.caps) {
        const q = new THREE.Quaternion().setFromUnitVectors(Y, c.dir)
        if (c.blind) {
          const f = flange(c.nps, c.rating)
          const pos = c.pos.clone().addScaledVector(c.dir, GASKET / 2 + f.thickness / 2 + 0.003)
          blinds.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(f.od / 2, f.thickness, f.od / 2)))
        } else {
          caps.push(new THREE.Matrix4().compose(c.pos, q, new THREE.Vector3(c.od / 2, c.od, c.od / 2)))
        }
      }
      for (const s of l.sleeves) {
        collars.push(new THREE.Matrix4().compose(s.pos.clone().setY(s.pos.y + 0.09), new THREE.Quaternion(), new THREE.Vector3(s.od * 0.62, 0.2, s.od * 0.62)))
        plates.push(new THREE.Matrix4().compose(s.pos.clone().setY(s.pos.y + 0.008), new THREE.Quaternion(), new THREE.Vector3(s.od * 2.2 + 0.1, 0.016, s.od * 2.2 + 0.1)))
      }
    }
    return { caps, blinds, collars, plates }
  }, [built])
  return (
    <group>
      <Instanced geometry={capGeo} material={m.pipePaint} matrices={sets.caps} />
      <Instanced geometry={disc} material={m.flangeSteel} matrices={sets.blinds} />
      <Instanced geometry={disc} material={m.structSteelDark} matrices={sets.collars} />
      <Instanced geometry={box} material={m.structSteelDark} matrices={sets.plates} castShadow={false} />
    </group>
  )
}
