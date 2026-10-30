/**
 * F&G mapping heatmap (layer "fgCoverage"): for every open-area fire zone, the grid cells at the
 * monitored height coloured by how many of the zone's detectors would pick up the reference event:
 * red = none, amber = one, green = two or more (2ooN voting). Flame (geographic) or gas (scenario)
 * mode comes from useFgView. Inhibited and faulted detectors drop out live. Zone outlines and
 * names with the current coverage are drawn on top. One DataTexture per zone, raycast off.
 *
 * Mount inside the deck-local group (next to FireGasOverlay).
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import type { BuiltPiping } from './piping/build'
import { useStore } from '../state/store'
import { usePlant } from '../state/plantStore'
import { useSim } from '../state/sim'
import { coverage, coverageGrid, detectors, fireZones, zoneCentre, type FireZone } from '../sim/fg'
import { keySet, liveOf, useExcludedKey, windKeyOf } from '../sim/fg/live'
import { useFgView } from '../sim/fg/view'

const noPick = () => null
const RGBA: Record<number, [number, number, number, number]> = {
  0: [224, 49, 49, 170],
  1: [255, 176, 32, 160],
  2: [46, 204, 113, 150],
}
/** zones not graded for this mode: uncovered cells in neutral grey instead of red */
const UNGRADED0: [number, number, number, number] = [150, 156, 164, 90]
const LIFT = 0.12

/** write the per-cell counts into the zone's texture (row 0 = +Z edge: the plane is rotated −90° about X) */
function paint(data: Uint8Array, tex: THREE.DataTexture, g: { nx: number; nz: number; counts: Uint8Array }, graded: boolean) {
  for (let iz = 0; iz < g.nz; iz++)
    for (let ix = 0; ix < g.nx; ix++) {
      const c = g.counts[ix + iz * g.nx]
      const o = (ix + (g.nz - 1 - iz) * g.nx) * 4
      const rgba = c === 255 ? null : c === 0 && !graded ? UNGRADED0 : RGBA[Math.min(2, c)]
      data[o] = rgba?.[0] ?? 0
      data[o + 1] = rgba?.[1] ?? 0
      data[o + 2] = rgba?.[2] ?? 0
      data[o + 3] = rgba?.[3] ?? 0
    }
  tex.needsUpdate = true
}

/** zones whose status is not normal, as a stable key */
const zoneAlarmKey = (s: unknown) => {
  const fg = liveOf(s).fg ?? {}
  return Object.values(fg)
    .filter((z) => z.gas !== 'normal' || z.fire !== 'normal' || z.smoke !== 'normal')
    .map((z) => z.zone)
    .sort()
    .join('|')
}

export function FgCoverageOverlay({ built }: { built?: BuiltPiping }) {
  const on = useStore((s) => s.layers.fgCoverage)
  return on ? <Heatmap built={built} /> : null
}

function Heatmap({ built }: { built?: BuiltPiping }) {
  const plant = usePlant()
  const ceiling = useStore((s) => s.layers.ceiling)
  const mode = useFgView((s) => s.mode)
  const level = useFgView((s) => s.level)
  const exKey = useExcludedKey()
  const wKey = useSim(windKeyOf)
  const alarmZones = useSim(zoneAlarmKey)
  const zones = useMemo(() => {
    detectors(plant, built) // prime the cache with the built placements
    return fireZones(plant).filter((z) => z.kind !== 'module')
  }, [plant, built])

  // one texture + plane per zone (geometry fixed per plant)
  const layers = useMemo(
    () =>
      zones.map((z) => {
        const g = coverageGrid(plant, z.id, 'flame')!
        const data = new Uint8Array(g.nx * g.nz * 4)
        const tex = new THREE.DataTexture(data, g.nx, g.nz, THREE.RGBAFormat)
        tex.magFilter = THREE.NearestFilter
        tex.minFilter = THREE.NearestFilter
        tex.colorSpace = THREE.SRGBColorSpace
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
        const geo = new THREE.PlaneGeometry(g.nx * g.cell, g.nz * g.cell).rotateX(-Math.PI / 2)
        const pos = new THREE.Vector3(g.x0 + (g.nx * g.cell) / 2, z.y0 + LIFT, g.z0 + (g.nz * g.cell) / 2)
        const pts: number[] = []
        for (const r of z.rects) {
          const y = z.y0 + LIFT + 0.02
          const c = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]]
          for (let i = 0; i < 4; i++) pts.push(c[i][0], y, c[i][1], c[(i + 1) % 4][0], y, c[(i + 1) % 4][1])
        }
        const outline = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        return { z, tex, data, mat, geo, pos, outline }
      }),
    [plant, zones],
  )
  useEffect(
    () => () => {
      for (const l of layers) {
        l.tex.dispose()
        l.mat.dispose()
        l.geo.dispose()
        l.outline.dispose()
      }
    },
    [layers],
  )

  // recolour on mode / exclusions / wind
  const labels = useMemo(() => {
    const ex = keySet(exKey)
    const [from, speed] = wKey.split('|').map(Number)
    const wind = { from, speed }
    const out: Record<string, string> = {}
    for (const l of layers) {
      const g = coverageGrid(plant, l.z.id, mode, ex, wind)!
      const tg = l.z.targets
      paint(l.data, l.tex, g, mode === 'flame' ? tg.flame1 + tg.flame2 > 0 : tg.gas1 + tg.gas2 > 0)
      const cv = coverage(plant, l.z.id, ex, wind)
      const t = l.z.targets
      const [a, b, ta, tb] = mode === 'flame' ? [cv.flame1, cv.flame2, t.flame1, t.flame2] : [cv.gas1, cv.gas2, t.gas1, t.gas2]
      const pc = (v: number) => `${Math.round(v * 100)}%`
      out[l.z.id] = ta || tb ? `${pc(a)} / ${pc(b)}  (target ${pc(ta)} / ${pc(tb)})` : `${pc(a)} / ${pc(b)}  (not graded)`
    }
    return out
  }, [layers, plant, mode, exKey, wKey])

  const alarms = useMemo(() => keySet(alarmZones), [alarmZones])
  const show = (z: FireZone) => (level === 'all' || z.y0 === level) && (ceiling || z.y0 < 9.45)

  return (
    <group>
      {layers.map((l) => {
        if (!show(l.z)) return null
        const { centre } = zoneCentre(l.z)
        const alarm = alarms.has(l.z.id)
        return (
          <group key={l.z.id}>
            <mesh geometry={l.geo} material={l.mat} position={l.pos} raycast={noPick} renderOrder={3} />
            <lineSegments geometry={l.outline} raycast={noPick} renderOrder={4}>
              <lineBasicMaterial color={alarm ? '#ff4d4d' : '#f2f4f6'} transparent opacity={alarm ? 1 : 0.75} depthWrite={false} />
            </lineSegments>
            <Html position={[centre[0], l.z.y0 + 2.2, centre[2]]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <div style={{ background: 'rgba(16,19,23,0.82)', color: '#e8eaec', border: `1px solid ${alarm ? '#ff4d4d' : 'rgba(255,255,255,0.18)'}`, borderRadius: 6, padding: '3px 7px', font: '11px/1.3 system-ui, sans-serif', whiteSpace: 'nowrap', textAlign: 'center' }}>
                <div style={{ fontWeight: 600 }}>{l.z.name}</div>
                <div style={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                  {mode === 'flame' ? 'flame' : 'gas'} 1oo / 2oo {labels[l.z.id]}
                </div>
              </div>
            </Html>
          </group>
        )
      })}
    </group>
  )
}
