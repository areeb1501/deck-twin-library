/**
 * Hazardous-area overlay (Layers → "Hazardous areas (Zone 0/1/2)", plan 14): the classified volumes of
 * safety/hazardAreas.ts drawn in the industry colours — Zone 0 red, Zone 1 orange, Zone 2 yellow — as
 * translucent volumes (one merged mesh + one merged outline per zone and deck group, depthWrite off) and
 * hatched deck-floor footprints so they read from above (Zone 0 cross-hatch, Zone 1 dense, Zone 2 sparse
 * diagonal; the plan is sampled at 0.5 m above each walk level, highest hazard wins, pressurised rooms
 * stay unhatched). A small DOM legend sits over the canvas while the layer is on.
 *
 * Mount inside the deck-local group (next to FgCoverageOverlay): the volumes are deck-local. The weather
 * deck and drill floor groups hide with the "Weather deck" layer (as the F&G heatmap does). Built once per
 * plant and kept (re-toggling is instant); raycast off. Drawn on three.js layer HZ_LAYER, which only the
 * main camera enables — the CCTV feeds (scene/CctvRenderer.tsx) don't show the volumes.
 */
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Plant, PlanRect } from '../model/types'
import { useStore } from '../state/store'
import { usePlant } from '../state/plantStore'
import { walkLevels } from './Walk'
import { HAZ_COLOR, hazardAreas, hazardZoneAtLocal, type HazShape, type HazVolume, type HazZone } from '../safety/hazardAreas'

const noPick = () => null
/** three.js layer of the overlay: the main view camera enables it, the CCTV cameras (layer 0 only) don't */
const HZ_LAYER = 12
const onLayer = (o: THREE.Object3D) => o.layers.set(HZ_LAYER)
const ZONES: HazZone[] = [2, 1, 0]
/** fill opacity of the volumes, per zone (overlaps add up — keep them low) */
const FILL: Record<HazZone, number> = { 0: 0.3, 1: 0.17, 2: 0.06 }
const EDGE: Record<HazZone, number> = { 0: 0.85, 1: 0.7, 2: 0.32 }
/** Zone 0 interiors are drawn a little proud of the shell, so the vessel reads red from outside */
const SKIN = 0.08
/** floor plan: texels per metre, sample height above the floor, lift of the plane */
const PX = 8
const SAMPLE_Y = 0.5
const LIFT = 0.05

// ---------------------------------------------------------------- geometry

function shapeGeometry(s: HazShape, grow = 0): THREE.BufferGeometry {
  if (grow) {
    if (s.kind === 'hcyl') s = { ...s, r: s.r + grow, half: s.half + grow }
    else if (s.kind === 'cyl') s = { ...s, r: s.r + grow, y1: s.y1 + grow }
  }
  switch (s.kind) {
    case 'box':
      return new THREE.BoxGeometry(s.x1 - s.x0, s.y1 - s.y0, s.z1 - s.z0).translate((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2)
    case 'cyl':
      return new THREE.CylinderGeometry(s.r, s.r, s.y1 - s.y0, 32, 1).translate(s.x, (s.y0 + s.y1) / 2, s.z)
    case 'sphere':
      return new THREE.SphereGeometry(s.r, 24, 16).translate(s.x, s.y, s.z)
    case 'hcyl':
      // cylinder along local X, turned so local X → (ux, uz): rotationY θ maps X → (cos θ, −sin θ)
      return new THREE.CylinderGeometry(s.r, s.r, s.half * 2, 24, 1)
        .rotateZ(Math.PI / 2)
        .rotateY(Math.atan2(-s.uz, s.ux))
        .translate(s.x, s.y, s.z)
  }
}

interface Group {
  key: string
  /** hidden with the weather deck (weather deck / drill floor) */
  upper: boolean
  zone: HazZone
  fill: THREE.BufferGeometry
  edges: THREE.BufferGeometry
}

interface Floor {
  key: string
  upper: boolean
  tex: THREE.DataTexture
  geo: THREE.PlaneGeometry
  pos: [number, number, number]
}

interface Built {
  groups: Group[]
  floors: Floor[]
  mats: { fill: Record<HazZone, THREE.MeshBasicMaterial>; edge: Record<HazZone, THREE.LineBasicMaterial>; floor: THREE.MeshBasicMaterial[] }
}

const rgb = (hex: string) => {
  const c = new THREE.Color(hex)
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)] as const
}

/** hatched plan of one (level, platform) group: zone per texel, then pattern + boundary lines */
function floorTexture(plant: Plant, y: number, areas: PlanRect[], r: PlanRect): { tex: THREE.DataTexture; nx: number; nz: number } {
  const nx = Math.max(2, Math.min(1024, Math.ceil((r.x1 - r.x0) * PX)))
  const nz = Math.max(2, Math.min(1024, Math.ceil((r.z1 - r.z0) * PX)))
  const sx = (r.x1 - r.x0) / nx
  const sz = (r.z1 - r.z0) / nz
  const grid = new Int8Array(nx * nz).fill(-1)
  for (let iz = 0; iz < nz; iz++) {
    const z = r.z0 + (iz + 0.5) * sz
    for (let ix = 0; ix < nx; ix++) {
      const x = r.x0 + (ix + 0.5) * sx
      if (!areas.some((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1)) continue
      const h = hazardZoneAtLocal(x, y + SAMPLE_Y, z, plant)
      if (h) grid[ix + iz * nx] = h.zone
    }
  }
  const data = new Uint8Array(nx * nz * 4)
  const col = { 0: rgb(HAZ_COLOR[0]), 1: rgb(HAZ_COLOR[1]), 2: rgb(HAZ_COLOR[2]) } as Record<HazZone, readonly [number, number, number]>
  for (let iz = 0; iz < nz; iz++)
    for (let ix = 0; ix < nx; ix++) {
      const z = grid[ix + iz * nx]
      if (z < 0) continue
      const zone = z as HazZone
      const edge =
        (ix > 0 && grid[ix - 1 + iz * nx] !== z) || (ix < nx - 1 && grid[ix + 1 + iz * nx] !== z) || (iz > 0 && grid[ix + (iz - 1) * nx] !== z) || (iz < nz - 1 && grid[ix + (iz + 1) * nx] !== z)
      // hatch: Zone 0 cross-hatch, Zone 1 dense diagonal, Zone 2 sparse diagonal (period in texels)
      const d1 = (ix + iz) % (zone === 2 ? 10 : 6)
      const d2 = (ix - iz + 4096) % 6
      const stripe = zone === 0 ? d1 < 2 || d2 < 2 : d1 < 2
      const a = edge ? 235 : stripe ? (zone === 2 ? 150 : 175) : zone === 2 ? 34 : 52
      // texture row 0 is the +z edge (the plane is rotated −90° about X)
      const o = (ix + (nz - 1 - iz) * nx) * 4
      data[o] = col[zone][0]
      data[o + 1] = col[zone][1]
      data[o + 2] = col[zone][2]
      data[o + 3] = a
    }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return { tex, nx, nz }
}

function build(plant: Plant): Built {
  const levels = walkLevels(plant)
  const vols = hazardAreas(plant)
  const upperLevel = (li: number) => li >= 0 && (levels[li]?.y ?? 0) >= 9.5
  // ---- volumes: merged per (zone, deck group)
  const buckets = new Map<string, { zone: HazZone; upper: boolean; vs: HazVolume[] }>()
  for (const v of vols) {
    const upper = upperLevel(v.level)
    const k = `${v.zone}:${upper ? 'u' : 'l'}`
    const b = buckets.get(k)
    if (b) b.vs.push(v)
    else buckets.set(k, { zone: v.zone, upper, vs: [v] })
  }
  const groups: Group[] = []
  for (const [key, b] of buckets) {
    const parts = b.vs.map((v) => shapeGeometry(v.shape, v.source === 'interior' ? SKIN : 0))
    const edgeParts = parts.map((g) => new THREE.EdgesGeometry(g, 30))
    const fill = mergeGeometries(parts, false)
    const edges = mergeGeometries(edgeParts, false)
    for (const g of [...parts, ...edgeParts]) g.dispose()
    if (fill && edges) groups.push({ key, zone: b.zone, upper: b.upper, fill, edges })
  }
  // draw order: Zone 2 first, Zone 0 last
  groups.sort((a, b) => b.zone - a.zone)

  // ---- hatched floors: one texture per (level, platform) that has floor-touching volumes
  const floors: Floor[] = []
  const rects = new Map<string, { li: number; r: PlanRect }>()
  for (const v of vols) {
    if (v.level < 0) continue
    const lv = levels[v.level]
    if (!lv || v.bb[1] > lv.y + SAMPLE_Y) continue
    const k = `${v.level}:${v.platform}`
    const e = rects.get(k)
    const [x0, , z0, x1, , z1] = v.bb
    if (e) e.r = { x0: Math.min(e.r.x0, x0), x1: Math.max(e.r.x1, x1), z0: Math.min(e.r.z0, z0), z1: Math.max(e.r.z1, z1) }
    else rects.set(k, { li: v.level, r: { x0, x1, z0, z1 } })
  }
  const floorMats: THREE.MeshBasicMaterial[] = []
  for (const [key, { li, r }] of rects) {
    const lv = levels[li]
    // clamp to the level's walkable areas (no hatching over the sea)
    const near = lv.areas.filter((a) => a.x1 > r.x0 && a.x0 < r.x1 && a.z1 > r.z0 && a.z0 < r.z1)
    if (!near.length) continue
    const c: PlanRect = { x0: Math.max(r.x0, Math.min(...near.map((a) => a.x0))), x1: Math.min(r.x1, Math.max(...near.map((a) => a.x1))), z0: Math.max(r.z0, Math.min(...near.map((a) => a.z0))), z1: Math.min(r.z1, Math.max(...near.map((a) => a.z1))) }
    if (c.x1 - c.x0 < 0.5 || c.z1 - c.z0 < 0.5) continue
    const { tex } = floorTexture(plant, lv.y, near, c)
    const geo = new THREE.PlaneGeometry(c.x1 - c.x0, c.z1 - c.z0).rotateX(-Math.PI / 2)
    floors.push({ key, upper: lv.y >= 9.5, tex, geo, pos: [(c.x0 + c.x1) / 2, lv.y + LIFT, (c.z0 + c.z1) / 2] })
  }
  const fill = {} as Record<HazZone, THREE.MeshBasicMaterial>
  const edge = {} as Record<HazZone, THREE.LineBasicMaterial>
  for (const z of ZONES) {
    fill[z] = new THREE.MeshBasicMaterial({ color: HAZ_COLOR[z], transparent: true, opacity: FILL[z], depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    edge[z] = new THREE.LineBasicMaterial({ color: HAZ_COLOR[z], transparent: true, opacity: EDGE[z], depthWrite: false, toneMapped: false })
  }
  for (const f of floors) floorMats.push(new THREE.MeshBasicMaterial({ map: f.tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))
  return { groups, floors, mats: { fill, edge, floor: floorMats } }
}

function dispose(b: Built) {
  for (const g of b.groups) {
    g.fill.dispose()
    g.edges.dispose()
  }
  for (const f of b.floors) {
    f.tex.dispose()
    f.geo.dispose()
  }
  for (const m of [...Object.values(b.mats.fill), ...Object.values(b.mats.edge), ...b.mats.floor]) m.dispose()
}

/** built once per plant and kept while that plant is loaded (re-toggling the layer is instant) */
let cached: { plant: Plant; built: Built } | null = null
function builtFor(plant: Plant): Built {
  if (cached?.plant === plant) return cached.built
  if (cached) dispose(cached.built)
  cached = { plant, built: build(plant) }
  return cached.built
}

// ---------------------------------------------------------------- component

export function HazardAreaOverlay() {
  const on = useStore((s) => s.layers.hazAreas)
  return on ? <Overlay /> : null
}

function Overlay() {
  const plant = usePlant()
  const ceiling = useStore((s) => s.layers.ceiling)
  const built = useMemo(() => builtFor(plant), [plant])
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.layers.enable(HZ_LAYER)
    return () => camera.layers.disable(HZ_LAYER)
  }, [camera])
  useLegend(gl.domElement.parentElement)
  return (
    <group name="hazardous-areas">
      {built.floors.map((f, i) =>
        f.upper && !ceiling ? null : <mesh key={f.key} geometry={f.geo} material={built.mats.floor[i]} position={f.pos} raycast={noPick} renderOrder={2} onUpdate={onLayer} />,
      )}
      {built.groups.map((g) =>
        g.upper && !ceiling ? null : (
          <group key={g.key}>
            <mesh geometry={g.fill} material={built.mats.fill[g.zone]} raycast={noPick} renderOrder={5 + (2 - g.zone)} onUpdate={onLayer} />
            <lineSegments geometry={g.edges} material={built.mats.edge[g.zone]} raycast={noPick} renderOrder={8 + (2 - g.zone)} onUpdate={onLayer} />
          </group>
        ),
      )}
    </group>
  )
}

/** legend over the canvas (plain DOM — drei Html hides itself when its anchor is behind the camera) */
function useLegend(host: HTMLElement | null) {
  useEffect(() => {
    if (!host) return
    const el = document.createElement('div')
    el.className = 'hz-legend'
    el.setAttribute('role', 'note')
    el.setAttribute('aria-label', 'Hazardous-area legend')
    Object.assign(el.style, {
      position: 'absolute',
      zIndex: '10',
      left: '324px',
      bottom: '12px',
      padding: '8px 11px',
      background: 'rgba(16,19,23,0.84)',
      color: '#e8eaec',
      border: '1px solid rgba(255,255,255,0.16)',
      borderRadius: '8px',
      font: '11px/1.45 system-ui, sans-serif',
      pointerEvents: 'none',
      maxWidth: '282px',
    } satisfies Partial<CSSStyleDeclaration>)
    const sw = (z: HazZone | null, pattern: string) =>
      `<i style="display:inline-block;width:14px;height:10px;margin-right:7px;vertical-align:-1px;border:1px solid ${z === null ? 'rgba(255,255,255,0.45)' : HAZ_COLOR[z]};background:${pattern}"></i>`
    const hatch = (z: HazZone, dense: boolean, cross = false) =>
      `repeating-linear-gradient(45deg, ${HAZ_COLOR[z]} 0 2px, ${HAZ_COLOR[z]}${dense ? '55' : '30'} 2px ${dense ? 5 : 7}px)${cross ? `, repeating-linear-gradient(-45deg, ${HAZ_COLOR[z]} 0 2px, transparent 2px 5px)` : ''}`
    el.innerHTML = [
      '<div style="font-weight:600;margin-bottom:3px">Hazardous areas · IEC 60079-10-1 (gas)</div>',
      `<div>${sw(0, hatch(0, true, true))}<b>Zone 0</b>: continuous (vessels, vent tips)</div>`,
      `<div>${sw(1, hatch(1, true))}<b>Zone 1</b>: likely in normal operation</div>`,
      `<div>${sw(2, hatch(2, false))}<b>Zone 2</b>, not likely, short duration</div>`,
      `<div>${sw(null, 'transparent')}Unclassified: safe area</div>`,
      '<div style="opacity:.7;margin-top:3px;font-size:10px">No Zone 3 (dust zones 20/21/22 n/a offshore). Screening extents, API RP 505 / EI 15.</div>',
    ].join('')
    host.appendChild(el)
    // out of the way of the walk-mode minimap and the x-ray / section service legend
    const place = () => {
      const s = useStore.getState()
      el.style.display = s.walk || s.hmi ? 'none' : ''
      el.style.bottom = s.viewMode === 'xray' || s.section.enabled ? '128px' : '12px'
    }
    place()
    const unsub = useStore.subscribe(place)
    return () => {
      unsub()
      el.remove()
    }
  }, [host])
}
