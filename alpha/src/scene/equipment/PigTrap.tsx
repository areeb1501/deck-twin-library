/**
 * Pig launcher / receiver.
 * Local frame: origin on the barrel axis at mid length, axis along +X, quick-opening
 * closure at the +X end, minor barrel (pipeline side) at -X. `elevation` is the axis
 * height above deck (deck at local y = -elevation), matching model/plant.ts.
 *
 * Outside: major barrel, concentric reducer, minor barrel, hinged clamp-ring closure
 * (hub, domed door, split clamp band with lugs + screw, pressure-warning screw, handle,
 * hinge bracket/pin/arm), pig signaller, pressure gauge on a boss, two adjustable pipe
 * supports with cradles and U-bolts, nameplate.
 * Inside: bi-directional disc/cup pig resting in the major barrel.
 */
import { useMemo } from 'react'
import type { PigTrap } from '../../model/types'
import { pipeOD, pipeWall } from '../../model/catalog'
import { paint } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import {
  Parts,
  PartMeshes,
  UP,
  V,
  T,
  arcTube,
  basisM,
  box,
  boxAt,
  clamp,
  hexNut,
  lathe,
  localNozzles,
  ring,
  rod,
  seamRing,
  toX,
  type Prof,
} from './vesselParts'

export function buildPigTrap(eq: PigTrap) {
  const Rj = pipeOD(eq.majorBarrelNps) / 2
  const wj = pipeWall(eq.majorBarrelNps, '80')
  const Rn = pipeOD(eq.minorBarrelNps) / 2
  const wn = pipeWall(eq.minorBarrelNps, '80')
  const k = clamp(Rj / 0.162, 0.5, 2)
  const yDeck = -eq.elevation
  const p = new Parts()
  const noz = localNozzles(eq)
  const pu = paint('#c4462e', 'internal', { roughness: 0.62, metalness: 0 })

  // ---------------------------------------------------------------- stations
  const endNoz = noz.find((l) => l.dir.x < -0.7)
  const x0 = endNoz ? endNoz.base.x : -eq.length / 2
  const tD = 0.05 * k // door plate
  const dD = 0.06 * k // door dome
  const xc = eq.length / 2 - tD - dD * 0.5 // hub / door interface
  const hubL = 0.16 * k
  const xH0 = xc - hubL
  const minorLen = clamp(0.28 * eq.length, 0.5, 1.6)
  const lr = Math.max(0.15, 1.6 * (Rj - Rn) + 0.12)
  const xr0 = x0 + minorLen
  const xr1 = xr0 + lr
  const Rh = Rj * 1.38 + 0.02

  // ---------------------------------------------------------------- barrels + reducer
  const outer: Prof = [
    [Rn - wn, x0],
    [Rn, x0],
    [Rn, xr0],
    [Rj, xr1],
    [Rj, xH0 + 0.001],
  ]
  p.add('equipmentPaint', toX(lathe(outer, 48, 0, Math.PI * 2, 12)))
  const inner: Prof = [
    [Rn - wn, x0],
    [Rn - wn, xr0],
    [Rj - wj, xr1],
    [Rj - wj, xc],
  ]
  p.add('vesselInner', toX(lathe(inner, 48, 0, Math.PI * 2, 12)))
  p.add('vesselInner', toX(lathe(outer.slice(1), 48, 0, Math.PI * 2, 12)))
  for (const [r, x] of [
    [Rn, xr0],
    [Rj, xr1],
    [Rj, xH0],
  ] as const)
    p.add('equipmentPaint', toX(seamRing(r, x, 0.014, 0.0025, 48)))

  // ---------------------------------------------------------------- quick-opening closure
  // hub
  p.add(
    'equipmentPaint',
    toX(
      lathe(
        [
          [Rj, xH0],
          [Rj + 0.012, xH0 + 0.02],
          [Rh, xH0 + 0.07 * k],
          [Rh, xc],
          [Rj - wj, xc],
        ],
        56,
        0,
        Math.PI * 2,
        25,
      ),
    ),
  )
  // door (flat inner face, domed outside, centre boss)
  {
    const prof: Prof = [
      [0, xc + 0.002],
      [Rh, xc + 0.002],
      [Rh, xc + tD],
    ]
    const a = 0.86 * Rh
    for (let i = 0; i <= 16; i++) {
      const t = (Math.PI / 2) * (i / 16)
      prof.push([a * Math.cos(t), xc + tD + dD * Math.sin(t)])
    }
    p.add('equipmentPaint', toX(lathe(prof, 56, 0, Math.PI * 2, 25)))
    p.add('equipmentPaintDark', toX(ring(0, 0.045 * k, xc + tD + dD - 0.01, xc + tD + dD + 0.035 * k, 24)))
  }
  // split clamp band with lugs at the top
  const gap = 0.16
  const bandR = Rh + 0.026 * k
  p.add('flangeSteel', toX(ring(Rh + 0.0008, bandR, xc - 0.04 * k, xc + tD * 0.8, 56, -Math.PI / 2 + gap, Math.PI * 2 - 2 * gap)))
  const lugZ = Math.sin(gap) * bandR + 0.022 * k
  for (const s of [-1, 1]) {
    p.add('flangeSteel', boxAt(0.07 * k, 0.085 * k, 0.03 * k, xc + tD * 0.4 - 0.02 * k, Rh + 0.035 * k, s * lugZ))
  }
  const yS = Rh + 0.05 * k
  const xS = xc + tD * 0.4 - 0.02 * k
  p.add('stainless', rod(V(xS, yS, -lugZ - 0.07 * k), V(xS, yS, lugZ + 0.04 * k), 0.012 * k, 10))
  p.add('nut', hexNut(V(xS, yS, lugZ + 0.025 * k), V(0, 0, 1), 0.035 * k, 0.022 * k))
  p.add('handwheel', hexNut(V(xS, yS, -lugZ - 0.06 * k), V(0, 0, 1), 0.04 * k, 0.03 * k))
  // T-handle on the clamp screw
  p.add('handwheel', rod(V(xS, yS, -lugZ - 0.08 * k), V(xS, yS, -lugZ - 0.11 * k), 0.012 * k, 8))
  p.add('handwheel', rod(V(xS - 0.16 * k, yS, -lugZ - 0.11 * k), V(xS + 0.16 * k, yS, -lugZ - 0.11 * k), 0.011 * k, 8))
  // pressure-warning (bleed) screw boss through the band
  p.add('brass', rod(V(xS - 0.05 * k, Rh + 0.02 * k, -lugZ - 0.02 * k), V(xS - 0.05 * k, Rh + 0.09 * k, -lugZ - 0.02 * k), 0.012 * k, 6))
  // hinge: bracket on hub, vertical pin, arm to door boss (on -Z side)
  {
    const zP = -(Rh + 0.11 * k)
    const xP = xc + 0.02 * k
    p.add('equipmentPaintDark', box(0.1 * k, 0.16 * k, 0.12 * k, T(xc - 0.05 * k, 0, -(Rh + 0.04 * k))))
    p.add('equipmentPaintDark', rod(V(xP, -0.13 * k, zP), V(xP, 0.13 * k, zP), 0.02 * k, 12))
    for (const y of [-0.1 * k, 0.06 * k]) p.add('equipmentPaintDark', ring(0.02 * k, 0.038 * k, y, y + 0.04 * k, 16), T(xP, 0, zP))
    const xA = xc + tD + dD + 0.06 * k
    p.add('equipmentPaintDark', box(xA - xP, 0.07 * k, 0.03 * k, T((xA + xP) / 2, 0, zP)))
    p.add('equipmentPaintDark', box(0.04 * k, 0.07 * k, -zP, T(xA, 0, zP / 2)))
    p.add('equipmentPaintDark', rod(V(xA, 0, 0), V(xc + tD + dD, 0, 0), 0.03 * k, 12))
  }

  // ---------------------------------------------------------------- pig signaller (minor barrel top)
  const topNoz = noz.filter((l) => l.dir.y > 0.5)
  const freeX = (x: number, lo: number, hi: number) => {
    for (let i = 0; i < 12; i++) {
      if (!topNoz.some((l) => Math.abs(l.base.x - x) < pipeOD(l.n.nps) / 2 + 0.12)) return x
      x = clamp(x + (i % 2 ? -1 : 1) * 0.1 * (i + 1), lo, hi)
    }
    return x
  }
  {
    const xs = freeX(x0 + Math.min(0.35, minorLen * 0.45), x0 + 0.12, xr0 - 0.1)
    const y0 = Rn - 0.01
    p.add('equipmentPaint', rod(V(xs, y0, 0), V(xs, y0 + 0.07, 0), 0.03, 16))
    p.add('flangeSteel', rod(V(xs, y0 + 0.07, 0), V(xs, y0 + 0.095, 0), 0.06, 20))
    p.add('valveBody', rod(V(xs, y0 + 0.095, 0), V(xs, y0 + 0.21, 0), 0.045, 16))
    p.add('valveBody', rod(V(xs, y0 + 0.21, 0), V(xs, y0 + 0.24, 0), 0.03, 12))
    p.add('actuatorRed', box(0.012, 0.07, 0.05, T(xs, y0 + 0.28, 0.0)))
    p.add('stainless', rod(V(xs, y0 + 0.24, 0), V(xs, y0 + 0.25, 0), 0.006, 6))
    p.add('handwheel', rod(V(xs, y0 + 0.15, 0), V(xs, y0 + 0.15, -0.11), 0.008, 8))
  }

  // ---------------------------------------------------------------- pressure gauge (major barrel, near closure)
  {
    const xg = freeX(xH0 - 0.18, xr1 + 0.1, xH0 - 0.08)
    const y0 = Rj - 0.01
    p.add('equipmentPaint', rod(V(xg, y0, 0), V(xg, y0 + 0.06, 0), 0.022, 12))
    p.add('valveBody', box(0.05, 0.05, 0.05, T(xg, y0 + 0.085, 0)))
    p.add('handwheel', rod(V(xg, y0 + 0.085, 0), V(xg, y0 + 0.085, -0.07), 0.006, 6))
    p.add('stainless', rod(V(xg, y0 + 0.11, 0), V(xg, y0 + 0.16, 0), 0.008, 8))
    const c = V(xg, y0 + 0.21, 0)
    const fz = V(0, 0, -1)
    p.add('stainless', ring(0, 0.052, -0.02, 0.02, 24), basisM(c, V(1, 0, 0), fz))
    p.add('nameplate', ring(0, 0.046, 0.02, 0.021, 24), basisM(c, V(1, 0, 0), fz))
    p.add('glass', ring(0, 0.048, 0.022, 0.026, 24), basisM(c, V(1, 0, 0), fz))
    p.add('nut', box(0.003, 0.038, 0.002, basisM(c.clone().add(V(0.008, 0.01, -0.0215)), V(Math.cos(0.7), Math.sin(0.7), 0), V(-Math.sin(0.7), Math.cos(0.7), 0))))
  }

  // ---------------------------------------------------------------- supports
  const botNoz = noz.filter((l) => l.dir.y < -0.5)
  const supportAt = (xs0: number, R: number, lo: number, hi: number) => {
    let xs = xs0
    for (let i = 0; i < 10 && botNoz.some((l) => Math.abs(l.base.x - xs) < pipeOD(l.n.nps) / 2 + 0.2); i++) xs = clamp(xs + (i % 2 ? -1 : 1) * 0.12 * (i + 1), lo, hi)
    const yC = -R - 0.012
    const post = 0.084 * clamp(k, 0.8, 1.4)
    // cradle (120 deg) + plate
    p.add('structSteel', toX(ring(R + 0.0005, R + 0.012, -0.08, 0.08, 32, Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3)), T(xs, 0, 0))
    p.add('structSteel', boxAt(0.2, 0.016, R * 1.9, xs, yC - R * 0.5 - 0.008, 0))
    for (const s of [-1, 1]) p.add('structSteel', boxAt(0.012, R * 0.5, 0.012, xs, yC - R * 0.25, s * R * 0.75))
    // post + base
    const yTopPost = yC - R * 0.5 - 0.016
    p.add('structSteel', rod(V(xs, yDeck + 0.02, 0), V(xs, yTopPost, 0), post, 20))
    p.add('structSteel', boxAt(0.3, 0.02, 0.3, xs, yDeck + 0.01, 0))
    for (const s of [-1, 1]) p.add('structSteel', box(0.012, 0.12, 0.1, basisM(V(xs, yDeck + 0.08, s * (post + 0.05)), V(1, 0, 0), UP)))
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        p.add('nut', rod(V(xs + sx * 0.11, yDeck, sz * 0.11), V(xs + sx * 0.11, yDeck + 0.07, sz * 0.11), 0.008, 6))
        p.add('nut', hexNut(V(xs + sx * 0.11, yDeck + 0.032, sz * 0.11), UP, 0.026, 0.016))
      }
    // U-bolt
    const ru = R + 0.011
    p.add('nut', arcTube(V(xs, 0, 0), V(0, 0, 1), UP, ru, 0, Math.PI, 0.008, 24))
    for (const s of [-1, 1]) {
      p.add('nut', rod(V(xs, 0, s * ru), V(xs, yC - R * 0.5 - 0.04, s * ru), 0.008, 6))
      p.add('nut', hexNut(V(xs, yC - R * 0.5 - 0.028, s * ru), UP, 0.026, 0.016))
    }
  }
  supportAt(x0 + minorLen * 0.5, Rn, x0 + 0.15, xr0 - 0.1)
  supportAt((xr1 + xH0) / 2, Rj, xr1 + 0.1, xH0 - 0.1)

  // ---------------------------------------------------------------- nameplate (-Z side of the major barrel)
  {
    const xn = (xr1 + xH0) / 2 + 0.35
    p.add('equipmentPaint', boxAt(0.03, 0.05, 0.05, xn - 0.08, 0, -Rj - 0.02))
    p.add('equipmentPaint', boxAt(0.03, 0.05, 0.05, xn + 0.08, 0, -Rj - 0.02))
    p.add('nameplate', boxAt(0.24, 0.15, 0.004, xn, 0, -Rj - 0.047))
  }

  // ---------------------------------------------------------------- the pig (bi-di disc pig)
  {
    const RiN = Rn - wn
    const rp = RiN * 1.03
    const lp = 1.7 * (2 * Rn)
    const xp = xc - 0.06 - lp / 2
    const yp = -(Rj - wj - rp) + 0.002
    const M = T(xp, yp, 0)
    const a = -lp / 2
    p.add('internalsSteel', toX(rod(V(0, a + 0.03, 0), V(0, -a - 0.03, 0), rp * 0.32, 20)), M)
    const discs = [0.02, 0.24, 0.5, 0.76, 0.98].map((f) => a + f * lp)
    discs.forEach((y, i) => {
      const isGuide = i === 0 || i === discs.length - 1
      p.add(pu, toX(ring(rp * 0.33, isGuide ? rp * 0.97 : rp, y - 0.012, y + 0.012, 40)), M)
      p.add('internalsSteel', toX(ring(rp * 0.3, rp * 0.6, y + 0.012, y + 0.02, 32)), M)
      p.add('internalsSteel', toX(ring(rp * 0.3, rp * 0.6, y - 0.02, y - 0.012, 32)), M)
    })
    // two sealing cups facing the push direction (-X towards the pipeline)
    for (const y of [a + 0.36 * lp, a + 0.62 * lp]) {
      const cup: Prof = [
        [rp * 0.33, y],
        [rp * 0.98, y - 0.05],
        [rp * 0.98, y - 0.065],
        [rp * 0.9, y - 0.06],
        [rp * 0.33, y - 0.012],
      ]
      p.add(pu, toX(lathe([...cup, cup[0]].reverse(), 40, 0, Math.PI * 2, 20)), M)
    }
    // bolt heads on the end flanges
    for (const y of [discs[0] - 0.02, discs[discs.length - 1] + 0.02]) {
      for (let i = 0; i < 6; i++) {
        const t = (i / 6) * Math.PI * 2
        p.add('nut', toX(hexNut(V(rp * 0.45 * Math.sin(t), y, rp * 0.45 * Math.cos(t)), UP, 0.018, 0.012)), M)
      }
    }
    // nose bumper
    p.add('rubberBlack', toX(lathe([[0, a - 0.06], [rp * 0.18, a - 0.055], [rp * 0.28, a - 0.03], [rp * 0.3, a + 0.03]], 24)), M)
  }
  return p
}

export function PigTrapModel({ eq }: { eq: PigTrap }) {
  const entries = useMemo(() => buildPigTrap(eq).build(), [eq])
  return (
    <group>
      <PartMeshes entries={entries} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}

