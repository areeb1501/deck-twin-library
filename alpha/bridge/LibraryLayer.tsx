/**
 * Draws a plant.json in the twin with the registry's own <Plant>. Runs inside the plant root, so selection, framing and
 * the walker see it. After mount it measures every item to size the proxies, tags the meshes for picking, and joins the
 * registry's materials to the section box and x-ray, which are otherwise engine-only.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Plant as RegistryPlant } from '../../registry/assembly/plant'
import type { Issue, PlantSpec } from '../../registry/assembly/spec'
import type { PickData, Plant } from '../src/model/types'
import { EquipmentLayer } from '../src/scene/EquipmentLayer'
import { useImportNotes } from '../src/state/plantFormats'
import { usePlantStore } from '../src/state/plantStore'
import { frameBuilderPlant } from '../src/state/specStore'
import { useStore } from '../src/state/store'
import { sectionPlanes } from '../src/three/materials'
import { applyBounds, libraryComponents } from './load'

const XRAY_OPACITY = 0.18
const eachMaterial = (root: THREE.Object3D, fn: (m: THREE.Material) => void) => {
  const seen = new Set<THREE.Material>()
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material
    if (!m) return
    for (const x of Array.isArray(m) ? m : [m]) {
      if (!seen.has(x)) fn(x)
      seen.add(x)
    }
  })
}

const measured = new WeakSet<object>()
const solidLook = new WeakMap<THREE.Material, { transparent: boolean; opacity: number; depthWrite: boolean }>()

export default function LibraryLayer({ plant }: { plant: Plant }) {
  const spec = plant.custom!.source as PlantSpec
  const components = libraryComponents(spec)
  const night = useStore((s) => s.night)
  const xray = useStore((s) => s.viewMode === 'xray')
  const top = useRef<THREE.Group>(null)
  const inline = useMemo(() => plant.equipment.filter((e) => !spec.items.some((i) => i.tag === e.tag)), [plant, spec])
  const report = useCallback((issues: Issue[]) => useImportNotes.getState().add(issues.filter((i) => i.level === 'warning').map((i) => `${i.where}: ${i.message}`)), [])

  useLayoutEffect(() => {
    const g = top.current
    const drawn = g?.children[0]
    if (!g || !drawn) return
    const [items, ...rest] = drawn.children
    const lines = plant.lines
    for (const c of items.children) c.userData.pick = { tag: c.name, kind: 'equipment' } satisfies PickData
    rest.slice(0, lines.length).forEach((c, i) => (c.userData.pick = { tag: lines[i].tag, kind: 'line' } satisfies PickData))
    g.traverse((o) => (o.userData.noCull = true))
    eachMaterial(items, (m) => (m.clippingPlanes = sectionPlanes))
    for (const c of rest.slice(0, lines.length)) eachMaterial(c, (m) => (m.clippingPlanes = sectionPlanes))
    if (measured.has(spec)) return
    measured.add(spec)
    g.updateWorldMatrix(true, true)
    const toPlant = g.matrixWorld.clone().invert()
    const boxes = new Map(items.children.map((c) => [c.name, new THREE.Box3().setFromObject(c).applyMatrix4(toPlant)]))
    const fitted = applyBounds(plant, boxes)
    usePlantStore.getState().setPlant(fitted)
    setTimeout(() => frameBuilderPlant(fitted), 60)
  }, [spec, plant])

  useEffect(() => {
    const drawn = top.current?.children[0]
    if (!drawn) return
    const lines = drawn.children.slice(1, 1 + plant.lines.length)
    for (const root of [drawn.children[0], ...lines])
      eachMaterial(root, (m) => {
        if (!solidLook.has(m)) solidLook.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite })
        const look = solidLook.get(m)!
        m.transparent = xray || look.transparent
        m.opacity = xray ? Math.min(look.opacity, XRAY_OPACITY) : look.opacity
        m.depthWrite = xray ? false : look.depthWrite
        m.needsUpdate = true
      })
  }, [xray, plant])

  return (
    <group ref={top} userData={{ noBatch: true }}>
      <RegistryPlant spec={spec} components={components} night={night} onReport={report} />
      <EquipmentLayer equipment={inline} />
    </group>
  )
}
