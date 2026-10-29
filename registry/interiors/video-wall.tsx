// Video wall: rows × columns of narrow-bezel LCD or fine-pitch LED tiles on a floor-standing frame with a base cabinet, or wall mounted; optional controller rack.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { Kit } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { frame, furnitureMats, INCH } from './_furniture'
import { ScreenPanels, liveMaterial, screenMaterial, type ScreenKind, type ScreenPlacement } from './_screens'
import { perforatedMaterial } from './_textures'

export interface VideoWallProps {
  rows?: number
  cols?: number
  /** tile diagonal, inches */
  diagonal?: number
  /** LCD bezel-to-bezel, mm (LED tiles are seamless) */
  bezel?: number
  technology?: 'lcd' | 'led'
  mount?: 'floor' | 'wall'
  /** bottom edge of the lowest tile above the floor, m */
  elevation?: number
  /** 19" controller rack beside the wall (wall mount) or behind a glazed door in the base (floor) */
  controller?: boolean
  /** one source stretched across the whole wall instead of one per tile */
  span?: boolean
  /** procedural content, cycled over the tiles (top row first, left to right) */
  content?: ScreenKind[]
  /** live textures per tile (top row first, left to right), or screens[0] across the wall when `span` */
  screens?: (THREE.Texture | null | undefined)[]
  tag?: string
}

export const defaults = {
  rows: 3,
  cols: 4,
  diagonal: 55,
  bezel: 0.88,
  technology: 'lcd' as 'lcd' | 'led',
  mount: 'floor' as 'floor' | 'wall',
  elevation: 0.75,
  controller: true,
  span: false,
  content: ['cctv', 'overview', 'mimic', 'helideck', 'trend', 'fg', 'alarm', 'weather', 'cctv', 'kpi', 'esd', 'cctv'] as ScreenKind[],
  screens: [] as (THREE.Texture | null | undefined)[],
  tag: 'VW-001',
}

type P = Omit<typeof defaults, 'screens'>

export function VideoWall({ screens, ...rest }: VideoWallProps & GroupProps) {
  const { rows, cols, diagonal, bezel, technology, mount, elevation, controller, span, content, tag, ...group } = { ...defaults, ...rest }
  const contentKey = content.join(',')
  const b = useMemo(
    () => build({ rows, cols, diagonal, bezel, technology, mount, elevation, controller, span, content, tag }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, cols, diagonal, bezel, technology, mount, elevation, controller, span, contentKey, tag],
  )
  useEffect(() => () => [b.built.geometry, ...b.spanGeos].forEach((g) => g.dispose()), [b])
  const live = screens?.[0]
  return (
    <group {...group}>
      <KitMesh data={b.built} />
      {span ? (
        b.spanGeos.map((g, i) => <mesh key={i} geometry={g} material={live ? liveMaterial(live) : screenMaterial(content[0] ?? 'overview')} />)
      ) : (
        <ScreenPanels placements={b.placements} screens={screens} />
      )}
    </group>
  )
}

export default VideoWall

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function build(p: P) {
  const k = new Kit()
  const M = furnitureMats()
  const R = clamp(Math.round(p.rows), 1, 6)
  const Cn = clamp(Math.round(p.cols), 1, 10)
  const led = p.technology === 'led'
  const d = clamp(p.diagonal, 20, 98)
  const kk = (d * INCH) / Math.hypot(16, 9)
  const aw = 16 * kk
  const ah = 9 * kk
  const gap = led ? 0.0003 : clamp(p.bezel, 0.4, 6) / 1000
  const pw = aw + gap
  const ph = ah + gap
  const WW = Cn * pw
  const HH = R * ph
  const floor = p.mount === 'floor'
  const D = floor ? 0.6 : 0.12 // overall depth: base cabinet / wall mount
  const zF = D / 2 // screen face plane
  const tileD = led ? 0.06 : 0.085
  const y0 = clamp(p.elevation, floor ? 0.4 : 0.3, 2.5)
  const frameC = paint('#2b2f33', { metalness: 0.35, roughness: 0.5, clearcoat: 0, weather: 0 })
  const housing = paint('#121315', { metalness: 0.2, roughness: 0.45, clearcoat: 0.3, weather: 0 })

  // tiles: thin black housing, seam shadow, screen faces
  const placements: ScreenPlacement[] = []
  const spanGeos: THREE.BufferGeometry[] = []
  for (let r = 0; r < R; r++)
    for (let c = 0; c < Cn; c++) {
      const x = -WW / 2 + (c + 0.5) * pw
      const y = y0 + HH - (r + 0.5) * ph
      k.box(housing, [pw - 0.0002, ph - 0.0002, tileD], [x, y, zF - tileD / 2 - 0.0005])
      if (!led) k.box(M.bezel, [aw * 0.86, ah * 0.86, 0.03], [x, y, zF - tileD - 0.015]) // rear electronics
      const kind = p.content.length ? p.content[(r * Cn + c) % p.content.length] : 'overview'
      placements.push({ pos: [x, y, zF + 0.0004], w: aw, h: ah, kind })
      if (p.span) {
        const g = new THREE.PlaneGeometry(aw, ah)
        const uv = g.getAttribute('uv') as THREE.BufferAttribute
        for (let i = 0; i < uv.count; i++) uv.setXY(i, (c * pw + gap / 2 + uv.getX(i) * aw) / WW, (HH - (r + 1) * ph + gap / 2 + uv.getY(i) * ah) / HH)
        g.translate(x, y, zF + 0.0004)
        spanGeos.push(g)
      }
    }
  // trim around the wall
  const tr = 0.025
  const zt = zF - 0.03
  k.box(frameC, [WW + 2 * tr, tr, 0.06], [0, y0 + HH + tr / 2, zt])
  k.box(frameC, [WW + 2 * tr, tr, 0.06], [0, y0 - tr / 2, zt])
  for (const s of [-1, 1]) k.box(frameC, [tr, HH, 0.06], [s * (WW / 2 + tr / 2), y0 + HH / 2, zt])

  const zMount = zF - tileD - 0.04 // vertical rails behind the tiles
  if (floor) {
    // floor-standing frame: uprights at every column joint, horizontal rails per row, braces to the base, base cabinet
    const yb = y0 - 0.02
    for (let c = 0; c <= Cn; c++) {
      const x = -WW / 2 + c * pw
      k.box(frameC, [0.06, HH + (y0 - yb), 0.04], [x, yb + (HH + y0 - yb) / 2, zMount])
      k.box(frameC, [0.06, 0.04, D - 0.1], [x, y0 + HH - 0.1, zMount - (D - 0.1) / 2 + 0.02])
      k.rod(frameC, [x, y0 + HH - 0.12, zMount - D + 0.15], [x, yb + 0.02, zMount - 0.03], 0.015, 8)
    }
    for (let r = 0; r <= R; r++) k.box(M.alu, [WW, 0.04, 0.03], [0, y0 + r * ph - (r === 0 ? -0.06 : r === R ? 0.06 : 0), zMount - 0.035])
    // pop-out mounts behind each tile
    for (let r = 0; r < R; r++)
      for (let c = 0; c < Cn; c++) {
        const x = -WW / 2 + (c + 0.5) * pw
        const y = y0 + HH - (r + 0.5) * ph
        k.box(M.alu, [0.3, 0.03, zF - tileD - zMount + 0.02], [x, y + ah * 0.3, (zF - tileD + zMount) / 2])
        k.box(M.alu, [0.3, 0.03, zF - tileD - zMount + 0.02], [x, y - ah * 0.3, (zF - tileD + zMount) / 2])
      }
    // base cabinet: carcass, perforated doors, plinth, top
    const bw = WW + 2 * tr
    const bh = yb
    const bz = 0
    k.box(frameC, [bw, bh - 0.08, D - 0.04], [0, 0.08 + (bh - 0.08) / 2, bz])
    k.box('rubberBlack', [bw - 0.06, 0.08, D - 0.1], [0, 0.04, bz])
    k.box(M.housing, [bw + 0.02, 0.025, D], [0, bh + 0.0125, bz])
    const nd = Math.max(2, Math.round(bw / 0.6))
    const dw = bw / nd
    for (let i = 0; i < nd; i++) {
      const x = -bw / 2 + (i + 0.5) * dw
      const glazed = p.controller && i === nd - 1
      const dh = bh - 0.12
      const g = new THREE.PlaneGeometry(dw - 0.08, dh - 0.08)
      const uv = g.getAttribute('uv') as THREE.BufferAttribute
      for (let j = 0; j < uv.count; j++) uv.setXY(j, (uv.getX(j) * (dw - 0.08)) / 0.1, (uv.getY(j) * (dh - 0.08)) / 0.1)
      k.box(frameC, [dw - 0.006, dh, 0.018], [x, 0.1 + dh / 2, bz + D / 2 - 0.02 + 0.009])
      if (glazed) {
        k.box('glass', [dw - 0.08, dh - 0.08, 0.004], [x, 0.1 + dh / 2, bz + D / 2 + 0.0005])
        controllerUnits(k, x, 0.14, dh - 0.1, bz + D / 2 - 0.06, dw - 0.16)
      } else k.add(perforatedMaterial('#25292d'), g, frame([x, 0.1 + dh / 2, bz + D / 2 + 0.0005]))
      k.rbox(M.alu, [0.02, 0.12, 0.012], 0.004, [x + dw / 2 - 0.05, 0.1 + dh / 2, bz + D / 2 + 0.006])
    }
    tagPlate(k, p.tag, [-bw / 2 + 0.25, bh - 0.08, bz + D / 2 + 0.002], 'z', 0.24)
  } else {
    // wall mount: horizontal rails on the wall plane (z = -D/2) with pop-out arms per tile
    const zw = -D / 2
    for (let r = 0; r < R; r++) {
      const y = y0 + HH - (r + 0.5) * ph
      for (const dy of [ah * 0.3, -ah * 0.3]) k.box(M.alu, [WW - 0.1, 0.05, 0.012], [0, y + dy, zw + 0.006])
    }
    for (let r = 0; r < R; r++)
      for (let c = 0; c < Cn; c++) {
        const x = -WW / 2 + (c + 0.5) * pw
        const y = y0 + HH - (r + 0.5) * ph
        for (const dy of [ah * 0.3, -ah * 0.3]) k.box(M.alu, [0.25, 0.03, zF - tileD - zw - 0.012], [x, y + dy, (zF - tileD + zw + 0.012) / 2])
      }
    tagPlate(k, p.tag, [-WW / 2 + 0.15, y0 - 0.06, zF - 0.02], 'z', 0.2)
    if (p.controller) {
      // 19" rack beside the wall
      const x = WW / 2 + 0.5
      const rw = 0.6
      const rd = 0.8
      const rh = 1.2
      k.box(frameC, [rw, rh, rd], [x, rh / 2 + 0.05, zw + rd / 2])
      k.box('rubberBlack', [rw - 0.04, 0.05, rd - 0.04], [x, 0.025, zw + rd / 2])
      k.box('glass', [rw - 0.08, rh - 0.1, 0.004], [x, rh / 2 + 0.05, zw + rd + 0.002])
      controllerUnits(k, x, 0.15, rh - 0.2, zw + rd - 0.04, rw - 0.12)
    }
  }
  const built = k.build()
  return { built, placements, spanGeos }
}

/** Stack of 1U / 2U controller and KVM units with status LEDs, fronts on the plane z. */
function controllerUnits(k: Kit, x: number, y0: number, h: number, z: number, w: number) {
  const M = furnitureMats()
  const U = 0.04445
  let y = y0
  let i = 0
  while (y + U < y0 + h) {
    const u = i % 3 === 0 ? 2 : 1
    if (y + u * U > y0 + h) break
    k.box(i % 2 ? M.housing : M.bezel, [w, u * U - 0.002, 0.4], [x, y + (u * U) / 2, z - 0.2])
    for (let l = 0; l < 4; l++) k.box(l === 3 && i % 4 === 1 ? M.ledAmber : M.ledGreen, [0.006, 0.004, 0.002], [x - w / 2 + 0.04 + l * 0.015, y + (u * U) / 2, z + 0.001])
    if (u === 2) k.box('plasticGrey', [w * 0.5, 0.05, 0.002], [x + w * 0.1, y + U, z + 0.001])
    y += u * U
    i++
  }
}
