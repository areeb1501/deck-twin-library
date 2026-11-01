/**
 * All the platform pedestal cranes of the field (model/cranes.ts CRANES: CR-A1, CR-A2 on Alpha's
 * weather deck, CR-N1 on WHP-N, CR-R1 on RP, CR-W1 on WI), animated from the crane-operations
 * simulation (sim/cranes.ts → useCranes): slew, luff and hoist ease smoothly between sim ticks.
 *
 * The pedestal, slewing house, lattice boom, hook block, spreader and whip ball are the component library's
 * pedestal-crane (registry/lifting/pedestal-crane.tsx) with its own materials and signage; the boom rests, the rope
 * sets and the loads come from crane.ts, because they follow the simulation.
 *
 * Draw-call budget (browser): one skinned mesh per crane plus the static parts, one draw per material.
 *  - pedestals + boom rests (+ hook pads) never move: all cranes' static parts are merged per material in
 *    world space;
 *  - each crane's moving parts are one SkinnedMesh: every part is rigidly bound to one bone (slew → boom,
 *    stretched rope sets, hook → loads …). Animation only sets bone transforms in useFrame (no React
 *    state, no allocations). Geometry is shared between cranes of the same spec.
 * The shadow map (re-rendered on demand by Scene.tsx) is refreshed at most once a second, after a
 * visible crane move.
 * WORLD coordinates (mounted in Surroundings); deck-local + [0, 28, 0].
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { craneParts } from '../../../../registry/lifting/pedestal-crane'
import { Kit, type Built } from '../../../../registry/lib/kit'
import { Batches, boxMinMax, tube } from '../structure/batch'
import { buildCrane, CRANE_PARTS, type CraneBatches, type CranePart } from './crane'
import { envMat } from './envShared'
import { boomPointTo, CARGO, CRANES, parkedPose, type CargoKind, type CraneDims, type CraneSite, type CraneSpec } from '../../model/cranes'
import { useCranes } from '../../sim/cranes'

const WY = 28
type MatKey = 'yellow' | 'white' | 'steel' | 'steelDark' | 'glass' | 'soot' | 'blue' | 'net' | 'light'
const MAT_OF: Record<MatKey, string> = {
  yellow: 'yellow',
  white: 'white',
  steel: 'steel',
  steelDark: 'steelDark',
  glass: 'glass',
  soot: 'soot',
  blue: 'blue',
  net: 'grating',
  light: 'avLight',
}
/** fallback paint colours if a material has none */
const PAINT: Record<MatKey, string> = {
  yellow: '#e2b21a',
  white: '#dfe2de',
  steel: '#8f969a',
  steelDark: '#3d4347',
  glass: '#17222a',
  soot: '#1f1d1b',
  blue: '#285f9c',
  net: '#7d8488',
  light: '#b00d06',
}
type Mats = Partial<Record<string, THREE.Material>>

function batchesFor(B: Batches<MatKey>): CraneBatches {
  const g = (k: MatKey) => B.get(k)
  return {
    yellow: g('yellow'),
    white: g('white'),
    steel: g('steel'),
    steelDark: g('steelDark'),
    glass: g('glass'),
    soot: g('soot'),
    blue: g('blue'),
    net: g('net'),
    light: g('light'),
    rail: { rail: g('yellow'), kick: g('yellow') },
  }
}

function colourOf(mats: Mats, k: MatKey) {
  const m = mats[MAT_OF[k]] as THREE.MeshStandardMaterial | undefined
  return m?.color ? m.color.clone() : new THREE.Color(PAINT[k])
}

/** paint a geometry with one colour (vertex colours) */
function paintGeo(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}
/** bind every vertex of a geometry rigidly to one bone */
function bindTo(g: THREE.BufferGeometry, bone: number) {
  const n = g.getAttribute('position').count
  const idx = new Uint16Array(n * 4)
  const w = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    idx[i * 4] = bone
    w[i * 4] = 1
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4))
  g.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4))
  return g
}

/** a load hanging from the hook (vertex coloured), slings from the hook bowl to its top corners */
function loadGeometry(kind: CargoKind, d: CraneDims, mats: Mats) {
  const B = new Batches<MatKey | 'orange' | 'red'>()
  const [lf, lh, ls] = CARGO[kind].size
  const yTop = -(d.hookDrop + d.sling)
  const y0 = yTop - lh
  const hook: [number, number, number] = [0, -d.hookDrop, 0]
  const corners: [number, number][] = kind === 'pipe' ? [[-lf / 3, 0], [lf / 3, 0]] : [[-lf / 2 + 0.1, -ls / 2 + 0.1], [lf / 2 - 0.1, -ls / 2 + 0.1], [lf / 2 - 0.1, ls / 2 - 0.1], [-lf / 2 + 0.1, ls / 2 - 0.1]]
  for (const [f, s] of corners) tube(B.get('soot'), hook, [f, yTop, s], 0.025, 4, true)
  if (kind === 'container') {
    boxMinMax(B.get('orange'), [-lf / 2, y0, -ls / 2], [lf / 2, yTop, ls / 2])
    for (const f of [-lf / 2, lf / 2]) boxMinMax(B.get('steelDark'), [f - 0.06, y0, -ls / 2 - 0.02], [f + 0.06, yTop + 0.02, ls / 2 + 0.02])
  } else if (kind === 'basket') {
    const t = 0.06
    boxMinMax(B.get('steel'), [-lf / 2, y0, -ls / 2], [lf / 2, y0 + 0.12, ls / 2])
    boxMinMax(B.get('yellow'), [-lf / 2, y0, -ls / 2], [lf / 2, yTop, -ls / 2 + t])
    boxMinMax(B.get('yellow'), [-lf / 2, y0, ls / 2 - t], [lf / 2, yTop, ls / 2])
    boxMinMax(B.get('yellow'), [-lf / 2, y0, -ls / 2], [-lf / 2 + t, yTop, ls / 2])
    boxMinMax(B.get('yellow'), [lf / 2 - t, y0, -ls / 2], [lf / 2, yTop, ls / 2])
    boxMinMax(B.get('blue'), [-lf / 2 + 0.2, y0 + 0.12, -ls / 2 + 0.2], [-0.1, y0 + 0.8, ls / 2 - 0.2])
  } else if (kind === 'personnel') {
    const r = lf / 2
    for (const y of [y0, y0 + 0.25, yTop - 0.05]) tube(B.get('orange'), [0, y, 0], [0, y + 0.18, 0], r, 18, false)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      tube(B.get('white'), [Math.cos(a) * r * 0.97, y0, Math.sin(a) * r * 0.97], [Math.cos(a) * r * 0.97, yTop, Math.sin(a) * r * 0.97], 0.035, 5, true)
    }
    tube(B.get('steelDark'), [0, y0, 0], [0, y0 + 0.08, 0], r * 0.95, 18, false)
  } else {
    for (let i = 0; i < 6; i++) {
      const s = ((i % 3) - 1) * 0.36
      const y = y0 + (i < 3 ? 0.17 : 0.5)
      tube(B.get('steelDark'), [-lf / 2, y, s], [lf / 2, y, s], 0.16, 10, false)
    }
    for (const f of [-lf / 3, lf / 3]) boxMinMax(B.get('red'), [f - 0.05, y0 - 0.02, -ls / 2], [f + 0.05, yTop, ls / 2])
  }
  const extra: Record<string, string> = { orange: '#d0561f', red: '#a8261c' }
  const geos = B.buildAll().map(({ key, geometry }) => {
    return paintGeo(geometry, key in extra ? new THREE.Color(extra[key]) : colourOf(mats, key as MatKey))
  })
  const g = mergeGeometries(geos)!
  for (const x of geos) x.dispose()
  g.computeBoundingSphere()
  return g
}

/** bones of a crane's skinned mesh (index = skinIndex) */
const BONES = ['root', 'slew', 'boom', 'lead', 'tackle', 'spreader', 'falls', 'hook', 'ball', 'container', 'basket', 'personnel', 'pipe'] as const
type BoneName = (typeof BONES)[number]
const BONE = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>
const PARENT: Partial<Record<BoneName, BoneName>> = { slew: 'root', boom: 'slew', lead: 'slew', tackle: 'slew', spreader: 'slew', falls: 'slew', hook: 'slew', ball: 'slew', container: 'hook', basket: 'hook', personnel: 'hook', pipe: 'hook' }
/** grating + obstruction lights inside the moving parts are painted (one material per crane) */
const NET_PAINT = new THREE.Color('#6f777b')
const LIGHT_PAINT = new THREE.Color('#d81408')

/** rope sets stay on the rig; everything else is the library's */
const ROPE_PARTS = new Set<CranePart>(['lead', 'tackle', 'falls'])

interface SpecGeo {
  dims: CraneDims
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
}
const specKey = (s: CraneSpec) => `${s.boomL}|${s.bearing}|${s.scale}`
const newParts = () => Object.fromEntries(CRANE_PARTS.map((p) => [p, new Batches<MatKey>()])) as Record<CranePart, Batches<MatKey>>

/** the library parts of a crane of this spec */
const libraryParts = (spec: CraneSpec, tag: string) => craneParts({ boomLength: spec.boomL, pedestalHeight: spec.bearing, scale: spec.scale, swl: spec.scale >= 1 ? 50 : 15, tag })
const draw = (fn: (k: Kit) => void): Built => {
  const k = new Kit()
  fn(k)
  return k.build()
}

/** the triangles of one material of a built part, as their own compact geometry */
function pieceOf(g: THREE.BufferGeometry, start: number, count: number) {
  const index = g.getIndex()!
  const map = new Map<number, number>()
  const out: number[] = []
  for (let i = start; i < start + count; i++) {
    const v = index.getX(i)
    if (!map.has(v)) map.set(v, map.size)
    out.push(map.get(v)!)
  }
  const piece = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name) as THREE.BufferAttribute
    const data = new Float32Array(map.size * a.itemSize)
    for (const [from, to] of map) for (let k = 0; k < a.itemSize; k++) data[to * a.itemSize + k] = a.array[from * a.itemSize + k]
    piece.setAttribute(name, new THREE.BufferAttribute(data, a.itemSize))
  }
  piece.setIndex(out)
  return piece
}

/** geometry buckets, one per material */
type Buckets = Map<THREE.Material, THREE.BufferGeometry[]>
function bucket(b: Buckets, m: THREE.Material, g: THREE.BufferGeometry) {
  if (!b.has(m)) b.set(m, [])
  b.get(m)!.push(g)
}
function addBuilt(b: Buckets, built: Built, vc: THREE.Material, each: (g: THREE.BufferGeometry) => void) {
  const index = built.geometry.getIndex() ? built.geometry : mergeVertices(built.geometry)
  for (const grp of index.groups) {
    const piece = pieceOf(index, grp.start, grp.count)
    each(piece)
    // plain paint goes in with the vertex-coloured rig, one draw per crane; only signage, stripes and glass need their own
    const m = built.material[grp.materialIndex ?? 0] as THREE.MeshStandardMaterial
    if (m.map || m.transparent) bucket(b, m, piece)
    else bucket(b, vc, paintGeo(piece, m.color))
  }
  built.geometry.dispose()
  if (index !== built.geometry) index.dispose()
}
const plain = (g: THREE.BufferGeometry) => (g.index ? g : mergeVertices(g))
/** the same attributes on every piece so they merge */
function fitted(g: THREE.BufferGeometry) {
  const out = plain(g)
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2))
  if (!out.getAttribute('normal')) out.computeVertexNormals()
  // the library's materials ignore vertex colours, but every piece must carry the same attributes to merge
  if (!out.getAttribute('color')) out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(out.getAttribute('position').count * 3).fill(1), 3))
  for (const name of Object.keys(out.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(name)) out.deleteAttribute(name)
  return out
}
/** one geometry with a group per material, and that material list */
function flatten(b: Buckets) {
  const materials = [...b.keys()]
  const merged = materials.map((m) => mergeGeometries(b.get(m)!.map(fitted), false)!)
  const geometry = merged.length ? mergeGeometries(merged, true)! : null
  for (const g of merged) g.dispose()
  for (const list of b.values()) for (const g of list) g.dispose()
  geometry?.computeBoundingSphere()
  return { geometry, materials }
}

/** one skinned geometry with every moving part (and the loads) of a crane of this spec */
function buildSpecGeo(spec: CraneSpec, mats: Mats, vc: THREE.Material): SpecGeo {
  const B = newParts()
  const { dims } = buildCrane((p) => batchesFor(B[p]), spec, { restF: 20, hookPad: false })
  const buckets: Buckets = new Map()
  // ropes and loads follow the simulation: they keep the rig's vertex-coloured geometry
  for (const p of CRANE_PARTS) {
    const built = B[p].buildAll()
    for (const { key, geometry } of built) {
      if (!ROPE_PARTS.has(p)) {
        geometry.dispose()
        continue
      }
      bucket(buckets, vc, bindTo(paintGeo(geometry, key === 'net' ? NET_PAINT : key === 'light' ? LIGHT_PAINT : colourOf(mats, key)), BONE[p as BoneName]))
    }
  }
  for (const k of Object.keys(CARGO) as CargoKind[]) bucket(buckets, vc, bindTo(loadGeometry(k, dims, mats), BONE[k]))
  // the library crane, part by part, each on its bone
  const lib = libraryParts(spec, '')
  const parts: [(k: Kit) => void, BoneName][] = [[lib.slewing, 'slew'], [lib.boom, 'boom'], [lib.block, 'hook'], [lib.spreader, 'spreader'], [lib.ball, 'ball']]
  for (const [fn, bone] of parts) addBuilt(buckets, draw(fn), vc, (g) => void bindTo(g, BONE[bone]))
  const { geometry, materials } = flatten(buckets)
  return { dims, geometry: geometry!, materials }
}

/** pedestals + boom rests of all cranes in world space, one draw per material */
function buildStatic(sites: CraneSite[], mats: Mats, vc: THREE.Material) {
  const buckets: Buckets = new Map()
  const nets: THREE.BufferGeometry[] = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const one = new THREE.Vector3(1, 1, 1)
  for (const c of sites) {
    const B = newParts()
    buildCrane((p) => batchesFor(B[p]), c.spec, { restF: c.restF, hookPad: c.hookPad })
    for (const p of CRANE_PARTS) {
      const built = B[p].buildAll()
      if (p !== 'rest') {
        for (const g of built) g.geometry.dispose()
        continue
      }
      m.compose(new THREE.Vector3(c.x, WY + c.deckY, c.z), q.setFromAxisAngle(up, -c.park), one)
      for (const { key, geometry } of built) {
        geometry.applyMatrix4(m)
        if (key === 'net') nets.push(geometry)
        else bucket(buckets, vc, paintGeo(geometry, key === 'light' ? LIGHT_PAINT : colourOf(mats, key)))
      }
    }
    m.makeTranslation(c.x, WY + c.deckY, c.z)
    const place = new THREE.Matrix4().copy(m)
    addBuilt(buckets, draw(libraryParts(c.spec, '').base), vc, (g) => void g.applyMatrix4(place))
  }
  const net = nets.length ? mergeGeometries(nets) : null
  for (const x of nets) x.dispose()
  net?.computeBoundingSphere()
  return { ...flatten(buckets), net }
}

const noRay = () => null
const DT_SMOOTH = 0.35
/** per-frame scratch (boom-frame points in the slewing frame) */
const _tip: [number, number] = [0, 0]
const _guide: [number, number] = [0, 0]
const _top: [number, number] = [0, 0]
const _aux: [number, number] = [0, 0]
/** displayed pose per crane (module scope: survives remounts) */
const DISP = new Map<string, { slew: number; luff: number; hook: number }>()
/** any crane moved since the last shadow refresh */
const motion = { amount: 0, lastShadow: 0 }

function makeRig(geo: SpecGeo) {
  const bones = BONES.map((n) => {
    const b = new THREE.Bone()
    b.name = n
    return b
  })
  for (const n of BONES) {
    const p = PARENT[n]
    if (p) bones[BONE[p]].add(bones[BONE[n]])
  }
  const mesh = new THREE.SkinnedMesh(geo.geometry, geo.materials)
  mesh.add(bones[0])
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false // bounds change as the boom luffs (5 meshes)
  mesh.raycast = noRay
  return { mesh, skeleton: new THREE.Skeleton(bones), bones }
}

function CraneRig({ site, geo }: { site: CraneSite; geo: SpecGeo }) {
  const d = geo.dims
  const rig = useMemo(() => makeRig(geo), [geo])
  const lastCargo = useRef<CargoKind | null | undefined>(undefined)
  // bind once the mesh is placed: bind pose = every bone at identity in the mesh frame
  useLayoutEffect(() => {
    rig.mesh.updateMatrixWorld(true)
    rig.skeleton.calculateInverses()
    rig.mesh.bind(rig.skeleton, rig.mesh.matrixWorld.clone())
    for (const k of Object.keys(CARGO) as CargoKind[]) rig.bones[BONE[k]].scale.setScalar(1e-4)
    lastCargo.current = undefined
    DISP.delete(site.tag)
    return () => rig.skeleton.dispose()
  }, [rig, site.tag])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const run = useCranes.getState().cranes[site.tag]
    const b = rig.bones
    let p = DISP.get(site.tag)
    let first = false
    if (!p) {
      p = run ? { slew: run.slew, luff: run.luff, hook: run.hook } : parkedPose(site)
      DISP.set(site.tag, p)
      first = true
    }
    if (run) {
      const k = 1 - Math.exp(-dt / DT_SMOOTH)
      let ds = run.slew - p.slew
      ds = Math.atan2(Math.sin(ds), Math.cos(ds))
      const dl = run.luff - p.luff
      const dh = run.hook - p.hook
      const moving = Math.abs(ds) + Math.abs(dl) + Math.abs(dh) * 0.05 > 1e-4
      if (moving) {
        p.slew += ds * k
        p.luff += dl * k
        p.hook += dh * k
        motion.amount += (Math.abs(ds) + Math.abs(dl)) * k * 12 + Math.abs(dh) * k * 0.3
      }
      if (lastCargo.current !== run.cargo) {
        lastCargo.current = run.cargo
        for (const kk of Object.keys(CARGO) as CargoKind[]) b[BONE[kk]].scale.setScalar(run.cargo === kk ? 1 : 1e-4)
        motion.amount += 1
      } else if (!moving && !first) return // at rest: nothing to update
    }
    b[BONE.slew].rotation.y = -p.slew
    b[BONE.boom].position.set(d.foot, d.yFoot, 0)
    b[BONE.boom].rotation.z = p.luff
    const [tx, ty] = boomPointTo(d, p.luff, d.tip.t, d.tip.n, _tip)
    const [gx, gy] = boomPointTo(d, p.luff, d.footGuide.t, d.footGuide.n, _guide)
    const [px, py] = boomPointTo(d, p.luff, d.tipTop.t, d.tipTop.n, _top)
    const [ax, ay] = boomPointTo(d, p.luff, d.aux.t, d.aux.n, _aux)
    const hookY = Math.min(p.hook, ty - 2.5)
    span(b[BONE.lead], d.lead[0], d.lead[1], gx, gy)
    span(b[BONE.tackle], d.uHub[0], d.uHub[1], px, py)
    b[BONE.spreader].position.set(d.uHub[0] + (px - d.uHub[0]) * 0.3, d.uHub[1] + (py - d.uHub[1]) * 0.3, 0)
    b[BONE.spreader].rotation.z = Math.atan2(-(px - d.uHub[0]), py - d.uHub[1])
    b[BONE.falls].position.set(tx, ty, 0)
    b[BONE.falls].scale.y = Math.max(0.05, ty - hookY)
    b[BONE.hook].position.set(tx, hookY, 0)
    b[BONE.ball].position.set(ax + 0.33, ay, 0)
  })

  return (
    <group name={`crane-${site.tag}`} position={[site.x, WY + site.deckY, site.z]}>
      <primitive object={rig.mesh} />
    </group>
  )
}

/** stretched rope set: +y of the unit geometry along the span (slewing frame), rotated about z */
function span(g: THREE.Bone, x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0
  const dy = y1 - y0
  g.position.set(x0, y0, 0)
  g.rotation.z = Math.atan2(-dx, dy)
  g.scale.y = Math.max(0.01, Math.hypot(dx, dy))
}

function ShadowWhileMoving() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__gl = gl
  }, [gl])
  useFrame((state) => {
    // refresh the on-demand shadow map at most once a second, and only after a visible move
    // (≈ 5° of slew / luff or 3 m of hook travel) — crane shadows lag a little, the frame rate doesn't
    if (motion.amount < 1) return
    const t = state.clock.elapsedTime
    if (t - motion.lastShadow < 1) return
    motion.lastShadow = t
    motion.amount = 0
    gl.shadowMap.needsUpdate = true
  })
  return null
}

export function Cranes({ mats, upperDeck = true }: { mats: Mats; upperDeck?: boolean }) {
  const sites = useMemo(() => CRANES.filter((c) => upperDeck || c.platform !== 'Alpha'), [upperDeck])
  const vc = useMemo(() => envMat('craneVertexColour', { color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0.25 }), [])
  const specs = useMemo(() => {
    const m = new Map<string, SpecGeo>()
    for (const c of CRANES) if (!m.has(specKey(c.spec))) m.set(specKey(c.spec), buildSpecGeo(c.spec, mats, vc))
    return m
  }, [mats, vc])
  const statics = useMemo(() => buildStatic(sites, mats, vc), [sites, mats, vc])
  useEffect(() => () => void (statics.geometry?.dispose(), statics.net?.dispose()), [statics])
  useEffect(() => () => specs.forEach((g) => g.geometry.dispose()), [specs])
  return (
    <group name="Cranes">
      {statics.geometry && <mesh name="cranes-static" geometry={statics.geometry} material={statics.materials} castShadow receiveShadow raycast={noRay} />}
      {statics.net && mats.grating && <mesh name="cranes-grating" geometry={statics.net} material={mats.grating} receiveShadow raycast={noRay} />}
      {sites.map((c) => (
        <CraneRig key={c.tag} site={c} geo={specs.get(specKey(c.spec))!} />
      ))}
      <ShadowWhileMoving />
    </group>
  )
}

export default Cranes
