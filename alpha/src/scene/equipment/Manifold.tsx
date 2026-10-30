/**
 * Production / test manifold.
 *
 * Local frame: origin = header centre at deck level; headers run along local X at their (y, z) from
 * eq.headers, from x = -length/2 (ellipsoidal weld caps) to the outlet nozzle base at +X (outlets are
 * eq.nozzles, rendered with NozzleNeck).
 * Each well slot i (x = -L/2 + L (i + 0.5) / slots) has a 4" riser coming up through the deck from
 * y = -2.5 at z = zRiser (in front of the headers, +Z side), flanged just above deck, rising to a
 * common run height, then running along -Z over the headers. Above every header a vertical drop
 * carries a gear-operated ball valve (ValveModel) into the header crown. Each riser carries a PG + PT.
 */
import { useMemo } from 'react'
import type { Manifold, Rating } from '../../model/types'
import { flange, pipeOD, valveLength } from '../../model/catalog'
import { dirToLocal, toLocal } from '../../model/geom'
import { NozzleNeck } from '../common/NozzleNeck'
import { Kit } from './machinery/kit'
import { KitMesh } from './machinery/KitMesh'
import { flangedJoint, pipe, pipeFlange, pipeRun, tagPlate, weldCap } from './machinery/parts'
import { ValveModel } from './Valve'
import { InstrumentModel } from './Instrument'

const BRANCH_NPS = 4
const SPOOL = 0.08

interface Layout {
  slotsX: number[]
  zR: number
  yRun: number
  rating: Rating
  drops: { x: number; z: number; yv: number }[]
}

function layout(eq: Manifold): Layout {
  const L = eq.length
  const n = Math.max(1, eq.slots)
  const slotsX = Array.from({ length: n }, (_, i) => -L / 2 + (L * (i + 0.5)) / n)
  const maxOd = Math.max(...eq.headers.map((h) => pipeOD(h.nps)), 0.1)
  const zR = Math.max(...eq.headers.map((h) => h.z), 0) + maxOd / 2 + 0.55
  const rating: Rating = eq.nozzles[0]?.rating ?? 600
  const Lv = valveLength('ball', BRANCH_NPS)
  const fl = flange(BRANCH_NPS, rating).length
  let yRun = 0
  const yv = new Map<number, number>()
  eq.headers.forEach((h, i) => {
    const top = h.y + pipeOD(h.nps) / 2
    const v = top + 0.05 + SPOOL + fl + Lv / 2
    yv.set(i, v)
    yRun = Math.max(yRun, v + Lv / 2 + fl + SPOOL + 0.2)
  })
  const drops: Layout['drops'] = []
  for (const x of slotsX) eq.headers.forEach((h, i) => drops.push({ x, z: h.z, yv: yv.get(i)! }))
  return { slotsX, zR, yRun, rating, drops }
}

function buildManifold(eq: Manifold, lay: Layout) {
  const k = new Kit()
  const L = eq.length
  const { zR, yRun, rating } = lay
  const bOd = pipeOD(BRANCH_NPS)
  const Lv = valveLength('ball', BRANCH_NPS)
  const fl = flange(BRANCH_NPS, rating).length
  const nozLocal = eq.nozzles.map((n) => ({ base: toLocal(eq, n.base), dir: dirToLocal(eq, n.dir) }))

  // ---------------------------------------------------------------- headers
  for (const h of eq.headers) {
    const od = pipeOD(h.nps)
    const out = nozLocal.find((n) => n.dir[0] > 0.7 && Math.abs(n.base[1] - h.y) < od && Math.abs(n.base[2] - h.z) < od)
    const inl = nozLocal.find((n) => n.dir[0] < -0.7 && Math.abs(n.base[1] - h.y) < od && Math.abs(n.base[2] - h.z) < od)
    const x1 = out ? out.base[0] + 0.04 : L / 2
    const x0 = inl ? inl.base[0] - 0.04 : -L / 2
    pipe(k, [x0, h.y, h.z], [x1, h.y, h.z], h.nps, 'pipePaint', 36)
    if (!inl) weldCap(k, h.nps, [x0, h.y, h.z], '-x')
    // girth welds every slot pitch
    for (const x of lay.slotsX) k.torus('flangeSteel', od / 2, 0.004, [x - (L / lay.slotsX.length) / 2, h.y, h.z], 'x', 6, 36)
    // supports: shoe + stanchion + base plate at both ends and the middle
    for (const sx of [x0 + 0.35, (x0 + x1) / 2 + L / (2 * lay.slotsX.length), x1 - 0.45]) {
      const yb = h.y - od / 2
      k.box('structSteel', [0.25, 0.02, od * 0.7], [sx, yb - 0.01, h.z])
      k.box('structSteel', [0.012, 0.08, od * 0.6], [sx, yb - 0.06, h.z])
      k.box('structSteel', [0.2, yb - 0.12, 0.2], [sx, (yb - 0.1) / 2, h.z])
      k.box('structSteel', [0.35, 0.02, 0.35], [sx, 0.01, h.z])
      for (const dx of [-0.13, 0.13]) for (const dz of [-0.13, 0.13]) k.hex('nut', 0.03, 0.02, [sx + dx, 0.03, h.z + dz])
      // U-bolt
      k.torus('boltXylan', od / 2 + 0.01, 0.008, [sx, h.y, h.z], 'x', 6, 24, Math.PI)
    }
  }

  // ---------------------------------------------------------------- risers, runs, drops
  const zMin = Math.min(...eq.headers.map((h) => h.z))
  const dropTop = (yv: number) => yv + Lv / 2 + fl
  for (const x of lay.slotsX) {
    // below-deck riser with deck penetration sleeve and doubler
    pipe(k, [x, -2.5, zR], [x, 0.25, zR], BRANCH_NPS)
    k.cyl('deckPlate', bOd / 2 + 0.05, 0.12, [x, 0.02, zR], 'y', 24)
    k.box('deckPlate', [0.45, 0.012, 0.45], [x, 0.006, zR])
    flangedJoint(k, BRANCH_NPS, lay.rating, [x, 0.35, zR], 'y')
    // riser + run + farthest drop as one bent pipe
    const farYv = lay.drops.find((d) => d.x === x && d.z === zMin)!.yv
    pipeRun(k, [[x, 0.35, zR], [x, yRun, zR], [x, yRun, zMin], [x, dropTop(farYv) + 0.002, zMin]], BRANCH_NPS)
    // the other drops: tee boss on the run + straight drop
    for (const d of lay.drops.filter((d) => d.x === x)) {
      if (d.z !== zMin) {
        k.cyl('pipePaint', bOd / 2 * 1.08, bOd * 1.3, [x, yRun, d.z], 'z', 20)
        pipe(k, [x, yRun, d.z], [x, dropTop(d.yv) + 0.002, d.z], BRANCH_NPS)
      }
      // flanges mating the valve ends (valve flow axis is vertical, raised faces at yv ± Lv/2)
      pipeFlange(k, BRANCH_NPS, lay.rating, [x, d.yv + Lv / 2, d.z], '-y', true)
      pipeFlange(k, BRANCH_NPS, lay.rating, [x, d.yv - Lv / 2, d.z], 'y', true)
      const h = eq.headers.find((hh) => hh.z === d.z)!
      const top = h.y + pipeOD(h.nps) / 2
      pipe(k, [x, top - 0.02, d.z], [x, d.yv - Lv / 2 - fl + 0.002, d.z], BRANCH_NPS)
      // sweepolet saddle on header crown
      k.cyl('pipePaint', bOd / 2 * 1.35, 0.06, [x, top + 0.005, d.z], 'y', 24, bOd / 2 * 1.05)
    }
    // riser guide clamp
    k.torus('boltXylan', bOd / 2 + 0.008, 0.007, [x, 1.0, zR], 'y', 6, 20)
  }
  // riser guide beam on two columns
  const xa = lay.slotsX[0] - 0.4
  const xb = lay.slotsX[lay.slotsX.length - 1] + 0.4
  const zb = zR - bOd / 2 - 0.07
  k.box('structSteelDark', [xb - xa + 0.2, 0.12, 0.08], [(xa + xb) / 2, 1.0, zb])
  for (const xx of [xa, xb]) {
    k.box('structSteelDark', [0.12, 1.0, 0.12], [xx, 0.5, zb])
    k.box('structSteelDark', [0.3, 0.02, 0.3], [xx, 0.01, zb])
  }
  for (const x of lay.slotsX) k.box('structSteelDark', [0.05, 0.08, zR - zb], [x, 1.0, (zR + zb) / 2])
  // run support on a portal over the headers
  const zf = zMin - 0.35
  k.box('structSteelDark', [0.12, 0.12, zR - zf + 0.2], [xa, yRun - bOd / 2 - 0.07, (zR + zf) / 2])
  k.box('structSteelDark', [0.12, 0.12, zR - zf + 0.2], [xb, yRun - bOd / 2 - 0.07, (zR + zf) / 2])
  for (const xx of [xa, xb]) for (const zz of [zf, zR + 0.15]) {
    k.box('structSteelDark', [0.12, yRun - bOd / 2 - 0.13, 0.12], [xx, (yRun - bOd / 2 - 0.13) / 2, zz])
    k.box('structSteelDark', [0.3, 0.02, 0.3], [xx, 0.01, zz])
  }
  k.box('structSteelDark', [xb - xa, 0.12, 0.1], [(xa + xb) / 2, yRun - bOd / 2 - 0.07, (zR + zMin) / 2])
  tagPlate(k, eq.tag, [xa - 0.07, 0.8, zb], 'z', 0.25)
  return k.build()
}

export function ManifoldModel({ eq }: { eq: Manifold }) {
  const lay = useMemo(() => layout(eq), [eq])
  const built = useMemo(() => buildManifold(eq, lay), [eq, lay])
  const bOd = pipeOD(BRANCH_NPS)
  return (
    <group>
      <KitMesh data={built} />
      {lay.drops.map((d, i) => (
        // flow axis X -> -Y (inlet on top), stem towards +Z (operator side)
        <group key={i} position={[d.x, d.yv, d.z]} rotation-y={-Math.PI / 2}>
          <group rotation-z={-Math.PI / 2}>
            <ValveModel type="ball" nps={BRANCH_NPS} rating={lay.rating} actuator="gear" open={i % 3 !== 1} />
          </group>
        </group>
      ))}
      {lay.slotsX.map((x) => (
        <group key={x}>
          {/* PG + PT on the +X side of the riser; dial / LCD face +Z (operator side) */}
          <group position={[x + bOd / 2, 0.8, lay.zR]} rotation-z={-Math.PI / 2}>
            <InstrumentModel type="PG" hostOd={bOd} />
          </group>
          <group position={[x + bOd / 2, 1.45, lay.zR]} rotation-z={-Math.PI / 2}>
            <InstrumentModel type="PT" hostOd={bOd} />
          </group>
        </group>
      ))}
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}

