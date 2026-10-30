/**
 * Corrosion the inspections have found, on the plant (plan 12). Only findings show: nothing is known about an item
 * until a unit has been there. Mounted with the inspection units, so it is off with them.
 *
 * Patchy rust on a found line (graded moderate and up), and round an equipment item's lower shell: a thin skin with
 * holes in it, drawn over the batched plant, so the piping's meshes are never touched. Not pickable.
 */
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { usePlant } from '../state/plantStore'
import { DECK_WORLD_Y } from '../state/store'
import { GRADE_RANK, latestFindings, useCorrosion, type CorrGrade } from '../safety/corrosion'
import { pipeOD } from '../model/catalog'
import { insulationThickness } from './piping/build'
import { footprints } from '../model/footprint'
import type { Plant } from '../model/types'

const noRaycast = () => null
const CAP = 40
const COLOR: Partial<Record<CorrGrade, string>> = { moderate: '#7c4a20', severe: '#5e2c14', critical: '#3f190c' }
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _p = new THREE.Vector3()
const _y = new THREE.Vector3(0, 1, 0)
const _d = new THREE.Vector3()

/** the holes: blotches of a fixed pattern, so a tile looks like scale rather than a painted band */
function blotches() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, 128, 128)
  let seed = 12345
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`
    g.beginPath()
    g.ellipse(r() * 128, r() * 128, 2 + r() * 12, 1 + r() * 7, r() * 3, 0, Math.PI * 2)
    g.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 1.4)
  return t
}

/** a skin (cylinder along +Y, unit size) over the middle of a line's longest run, or round an item's lower shell */
function placement(plant: Plant, tag: string): { pos: THREE.Vector3; dir: THREE.Vector3; r: number; len: number } | null {
  const line = plant.lines.find((l) => l.tag === tag)
  if (line) {
    let best = -1
    let bi = 1
    for (let i = 1; i < line.route.length; i++) {
      const [a, b] = [line.route[i - 1], line.route[i]]
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      if (d > best) {
        best = d
        bi = i
      }
    }
    const [a, b] = [line.route[bi - 1], line.route[bi]]
    return { pos: new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + DECK_WORLD_Y, (a[2] + b[2]) / 2), dir: new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(), r: pipeOD(line.nps) / 2 + (line.insulation ? insulationThickness(line.nps) : 0) + 0.006, len: Math.min(best * 0.6, 1.8) }
  }
  const i = plant.equipment.findIndex((e) => e.tag === tag)
  if (i < 0) return null
  const e = plant.equipment[i]
  const f = footprints([e], 0)[0]
  const r = Math.min(f.x1 - f.x0, f.z1 - f.z0) / 2
  return { pos: new THREE.Vector3((f.x0 + f.x1) / 2, e.position[1] + DECK_WORLD_Y + 0.5, (f.z0 + f.z1) / 2), dir: new THREE.Vector3(0, 1, 0), r: r + 0.02, len: 0.5 }
}

export function CorrosionTint() {
  const plant = usePlant()
  const ref = useRef<THREE.InstancedMesh>(null)
  const findings = useCorrosion((s) => s.findings)
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, alphaMap: blotches(), alphaTest: 0.34, side: THREE.DoubleSide }), [])
  useEffect(
    () => () => {
      geo.dispose()
      mat.alphaMap?.dispose()
      mat.dispose()
    },
    [geo, mat],
  )
  useEffect(() => {
    const m = ref.current
    if (!m) return
    let n = 0
    const c = new THREE.Color()
    for (const f of latestFindings()) {
      if (n >= CAP || GRADE_RANK[f.grade] < GRADE_RANK.moderate) continue
      const at = placement(plant, f.tag)
      if (!at) continue
      _q.setFromUnitVectors(_y, _d.copy(at.dir))
      m.setMatrixAt(n, _m.compose(_p.copy(at.pos), _q, _s.set(at.r, at.len, at.r)))
      m.setColorAt(n, c.set(COLOR[f.grade] ?? '#a56a2a'))
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [plant, findings])
  return <instancedMesh ref={ref} name="overlay-corrosion" args={[geo, mat, CAP]} raycast={noRaycast} frustumCulled={false} />
}
