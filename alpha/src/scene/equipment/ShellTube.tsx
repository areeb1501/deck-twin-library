/**
 * TEMA AES shell & tube exchanger (A: removable channel + flat bolted cover, E: one-pass
 * shell, S: floating head with split backing ring).
 * Local frame: origin on the shell axis at mid tubesheet-to-tubesheet, axis along +X,
 * channel at -X, deck at y = -(elevation + shellOd/2).
 *
 * Inside: real tube count on a 30 deg triangular pitch of 1.25 x OD (one InstancedMesh),
 * pass-partition lane + plate, stationary and floating tubesheets with the actual hole
 * pattern (canvas texture), 25 % cut segmental baffles, tie rods, floating head cover,
 * backing ring and bolting, impingement plate under the shell inlet.
 */
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { ShellTube } from '../../model/types'
import { pipeOD } from '../../model/catalog'
import { paint } from '../../three/materials'
import { NozzleNeck } from '../common/NozzleNeck'
import {
  Instances,
  Parts,
  PartMeshes,
  V,
  T,
  addNozzlePads,
  addSaddle,
  basisM,
  box,
  boxAt,
  clamp,
  dishedShell,
  headProfile,
  hexNut,
  lathe,
  liftingLug,
  localNozzles,
  ring,
  rod,
  seamRing,
  segmentPlate,
  toX,
  tubesheetMaterial,
  vesselProjector,
  type Prof,
} from './vesselParts'

/** Triangular-pitch tube layout (y, z), nearest-to-centre first, optional pass lane at y = 0. */
export function tubeLayout(count: number, od: number, otlR: number, passLane: boolean) {
  const p = 1.25 * od
  const rowH = (p * Math.sqrt(3)) / 2
  const lane = passLane ? 0.75 * p : 0
  const lim = otlR - od / 2
  const pts: [number, number][] = []
  const nRows = Math.ceil(lim / rowH) + 1
  const nCols = Math.ceil(lim / p) + 1
  for (let kk = 0; kk <= nRows; kk++) {
    for (const s of [-1, 1]) {
      if (!passLane && kk === 0 && s < 0) continue
      const y = passLane ? s * (lane + kk * rowH) : s * kk * rowH
      const off = (kk % 2) * (p / 2)
      for (let j = -nCols; j <= nCols; j++) {
        const z = j * p + off
        if (y * y + z * z <= lim * lim) pts.push([y, z])
      }
    }
  }
  pts.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]))
  const capacity = pts.length
  const tubes = pts.slice(0, count)
  const bundleR = tubes.reduce((m, [y, z]) => Math.max(m, Math.hypot(y, z)), 0) + od / 2
  return { tubes, capacity, bundleR }
}

function disc(R: number, Rtex: number, x: number, facing: 1 | -1) {
  const g = new THREE.CircleGeometry(R, 96)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / (2 * Rtex) + 0.5
    uv.setXY(i, facing < 0 ? u : 1 - u, pos.getY(i) / (2 * Rtex) + 0.5)
  }
  g.rotateY(facing < 0 ? -Math.PI / 2 : Math.PI / 2)
  g.translate(x, 0, 0)
  return g
}

export function buildShellTube(eq: ShellTube) {
  const L = eq.length
  const Ro = eq.shellOd / 2
  const ws = clamp(eq.shellOd * 0.014, 0.0095, 0.025)
  const Ri = Ro - ws
  const k = clamp(Ro / 0.45, 0.6, 1.8)
  const yDeck = -(eq.elevation + Ro)
  const seg = 72
  const p = new Parts()
  const noz = localNozzles(eq)

  // ---- body flange dimensions (not from the B16.5 table: these are custom girth flanges)
  const Rf = Ro + 0.125 * clamp(k, 0.8, 1.3)
  const tf = clamp(0.1 * eq.shellOd, 0.06, 0.13)
  const hubL = 0.08
  const hubT = 0.022
  const Rbc = Ro + 0.068 * clamp(k, 0.8, 1.3)
  const db = eq.shellOd < 1 ? 0.03 : 0.036
  const nb = Math.max(16, 4 * Math.round((2 * Math.PI * Rbc) / 0.1 / 4))
  const nutH = db
  const nutAF = db * 1.6 + 0.003

  // ---- stations
  const tts = clamp(0.065 * k, 0.05, 0.11)
  const xT1 = -L / 2
  const xT0 = xT1 - tts
  const xC = -L / 2 - eq.channelLength
  const tcov = clamp(0.075 * k, 0.05, 0.12)
  const chNoz = noz.filter((l) => l.base.x < xT0)
  const passLane = chNoz.length >= 2
  const otlR = Ri - 0.1
  const lay = tubeLayout(eq.tubeCount, eq.tubeOd, otlR, passLane)
  const Rfts = clamp(lay.bundleR + 0.035, 0.1, Ri - 0.068)
  const ttf = clamp(0.05 * k, 0.04, 0.09)
  const xF0 = L / 2
  const xF1 = L / 2 + ttf
  const fhDepth = 0.32 * Rfts
  const xR = xF1 + 0.05 + fhDepth + 0.1 // rear shell flange face
  const sc = 0.12
  const xH = xR + tf + sc // shell cover tangent line
  const bi = (2 * Ri) / 4
  const bo = bi + ws

  // ---- girth flange: face at xFace, body extends towards `dir`
  const girth = (xFace: number, dir: 1 | -1) => {
    const prof: Prof =
      dir > 0
        ? [
            [Ri, xFace],
            [Rf, xFace],
            [Rf, xFace + tf],
            [Ro + hubT, xFace + tf],
            [Ro, xFace + tf + hubL],
          ]
        : [
            [Ro, xFace - tf - hubL],
            [Ro + hubT, xFace - tf],
            [Rf, xFace - tf],
            [Rf, xFace],
            [Ri, xFace],
          ]
    p.add('equipmentPaint', toX(lathe(prof, seg, 0, Math.PI * 2, 20)))
    p.add('equipmentPaint', toX(seamRing(Ro, xFace + dir * (tf + hubL), 0.018, 0.0028, seg)))
  }
  const studs = (xa: number, xb: number, r = Rbc, n = nb, d = db, nh = nutH, af = nutAF, mat: 'boltXylan' | 'stainless' = 'boltXylan') => {
    // xa < xb are the flange back faces
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2
      const y = r * Math.sin(a)
      const z = r * Math.cos(a)
      p.add(mat, rod(V(xa - nh - 0.6 * d, y, z), V(xb + nh + 0.6 * d, y, z), d / 2, 8))
      p.add('nut', hexNut(V(xa - nh / 2, y, z), V(1, 0, 0), af, nh))
      p.add('nut', hexNut(V(xb + nh / 2, y, z), V(1, 0, 0), af, nh))
    }
  }

  // ------------------------------------------------------------ channel (A)
  girth(xC, 1)
  girth(xT0, -1)
  p.add('equipmentPaint', toX(lathe([[Ro, xC + tf + hubL - 0.001], [Ro, xT0 - tf - hubL + 0.001]], seg)))
  p.add('equipmentPaint', toX(lathe([[0, xC - tcov], [Rf, xC - tcov], [Rf, xC], [0, xC]], seg, 0, Math.PI * 2, 20)))
  p.add('equipmentPaint', liftingLug(0, 0, 0.8 * k).applyMatrix4(basisM(V(xC - tcov + 0.02, Rf * 0.3, 0), V(0, 1, 0), V(-1, 0, 0))))
  p.add('equipmentPaintDark', rod(V(xC - tcov - 0.12, -Rf * 0.25, 0), V(xC - tcov, -Rf * 0.25, 0), 0.016, 10))
  studs(xC - tcov, xC + tf)
  // stationary tubesheet rim (sandwiched between channel and shell flanges)
  const Rts = Rbc - db / 2 - 0.012
  p.add('flangeSteel', toX(lathe([[Ri, xT0], [Rts, xT0], [Rts, xT1], [Ri, xT1]], seg, 0, Math.PI * 2, 20)))
  studs(xT0 - tf, xT1 + tf)

  // ------------------------------------------------------------ shell (E) + shell cover (S)
  girth(xT1, 1)
  girth(xR, -1)
  p.add('equipmentPaint', toX(lathe([[Ro, xT1 + tf + hubL - 0.001], [Ro, xR - tf - hubL + 0.001]], seg)))
  girth(xR, 1)
  p.add('equipmentPaint', toX(lathe([[Ro, xR + tf + hubL - 0.001], [Ro, xH], ...headProfile(Ro, bo, xH, 1, 28).slice(1)], seg)))
  p.add('equipmentPaint', toX(seamRing(Ro, xH, 0.018, 0.0028, seg)))
  studs(xR - tf, xR + tf)
  // cavity surfaces (BackSide)
  p.add('vesselInner', toX(lathe([[Ri, xC], [Ri, xH], ...headProfile(Ri, bi, xH, 1, 28).slice(1)], seg)))
  p.add('vesselInner', toX(lathe([[Ro, xC], [Ro, xH], ...headProfile(Ro, bo, xH, 1, 28).slice(1)], seg)))

  // ------------------------------------------------------------ supports & fittings
  const sx = L / 2 - clamp(0.2 * L, 0.5, 2.5)
  addSaddle(p, -sx, Ro, yDeck)
  addSaddle(p, sx, Ro, yDeck, { sliding: true })
  const proj = vesselProjector('x', V((xC + xH) / 2, 0, 0), (xH - xC) / 2, Ro, 0)
  addNozzlePads(p, noz, [proj], clamp(ws, 0.01, 0.02))
  const topNoz = noz.filter((l) => l.dir.y > 0.5)
  for (const s of [-1, 1]) {
    let x = s * (L / 2 - 0.55)
    for (let i = 0; i < 6 && topNoz.some((l) => Math.abs(l.base.x - x) < pipeOD(l.n.nps) / 2 + 0.2); i++) x -= s * 0.3
    p.add('equipmentPaint', liftingLug(x, Ro - 0.008, 0.7 * k))
  }
  {
    const n = V(0, -0.2, -1).normalize()
    const xs = -sx + 0.8
    for (const dx of [-0.11, 0.11]) p.add('equipmentPaint', box(0.025, 0.06, 0.01, basisM(V(xs + dx, 0, 0).addScaledVector(n, Ro + 0.026), V(1, 0, 0), n)))
    p.add('equipmentPaint', box(0.34, 0.005, 0.22, basisM(V(xs, 0, 0).addScaledVector(n, Ro + 0.058), V(1, 0, 0), n)))
    p.add('nameplate', box(0.3, 0.003, 0.18, basisM(V(xs, 0, 0).addScaledVector(n, Ro + 0.062), V(1, 0, 0), n)))
  }

  // ------------------------------------------------------------ internals
  if (passLane) p.add('internalsSteel', boxAt(xT0 - xC - 0.002, 0.012, 2 * Ri - 0.004, (xC + xT0) / 2, 0, 0))
  // floating tubesheet, backing ring, floating head cover + bolting
  p.add('internalsSteel', toX(lathe([[Rfts, xF0], [Rfts, xF1]], 64)))
  p.add('internalsSteel', toX(ring(Rfts - 0.02, Rfts + 0.055, xF0 - 0.05, xF0, 64)))
  p.add('internalsSteel', toX(ring(Rfts - 0.03, Rfts + 0.055, xF1, xF1 + 0.05, 64)))
  p.add('internalsSteel', toX(dishedShell(Rfts - 0.008, fhDepth, 0.014, xF1 + 0.05)))
  const nbF = Math.max(12, 4 * Math.round((2 * Math.PI * (Rfts + 0.03)) / 0.085 / 4))
  studs(xF0 - 0.05, xF1 + 0.05, Rfts + 0.03, nbF, 0.02, 0.02, 0.035, 'stainless')
  // baffles (25 % cut, alternating) + tie rods
  const sp = clamp(Ri, 0.3, 0.8)
  const bafX: number[] = []
  for (let x = xT1 + sp; x <= xF0 - 0.25; x += sp) bafX.push(x)
  const cut = Ri - 0.5 * Ri
  bafX.forEach((x, i) => {
    const g = segmentPlate(Ri - 0.004, i % 2 ? -cut : cut, i % 2 ? 'above' : 'below', 0.008)
    p.add('internalsSteel', g, T(x, 0, 0))
  })
  const tieR = lay.bundleR + 0.016
  const tieA = [20, 70, 110, 160, 200, 250, 290, 340].map((d) => (d * Math.PI) / 180)
  const tie: [number, number][] = tieA.map((a) => [tieR * Math.sin(a), tieR * Math.cos(a)])
  const xLast = bafX.length ? bafX[bafX.length - 1] : xF0 - 0.3
  for (const [y, z] of tie) {
    p.add('internalsSteel', rod(V(xT1, y, z), V(xLast + 0.03, y, z), 0.0125, 8))
    p.add('nut', hexNut(V(xLast + 0.02, y, z), V(1, 0, 0), 0.022, 0.012))
  }
  // impingement plate under top shell inlets
  for (const l of noz) {
    if (l.dir.y < 0.7 || l.base.x < xT1 || l.base.x > xF0) continue
    const od = pipeOD(l.n.nps)
    const y = Math.min(Ri - od * 0.6, (Ri + lay.bundleR) / 2)
    p.add('internalsSteel', boxAt(od * 1.4, 0.008, od * 1.4, l.base.x, y, 0))
    for (const s of [-1, 1]) {
      const z = (s * od * 0.6)
      const top = Math.sqrt(Ri * Ri - z * z)
      p.add('internalsSteel', boxAt(0.03, top - y, 0.006, l.base.x, (top + y) / 2, z))
    }
  }

  // tubesheet faces (texture shows the actual hole layout)
  const tsMat = tubesheetMaterial(lay.tubes, eq.tubeOd, Ri, tie, passLane)
  p.add(tsMat, disc(Ri, Ri, xT0 - 0.0006, -1))
  p.add(tsMat, disc(Ri, Ri, xT1 + 0.0006, 1))
  p.add(tsMat, disc(Rfts, Ri, xF0 - 0.0006, -1))
  p.add(tsMat, disc(Rfts, Ri, xF1 + 0.0006, 1))

  // tube bundle
  const tubeLen = xF1 - xT0
  const tubeGeo = new THREE.CylinderGeometry(eq.tubeOd / 2, eq.tubeOd / 2, tubeLen, 10, 1, true)
  tubeGeo.rotateZ(-Math.PI / 2)
  const xm = (xF1 + xT0) / 2
  const tubeMats = lay.tubes.map(([y, z]) => new THREE.Matrix4().makeTranslation(xm, y, z))

  return { parts: p, tubeGeo, tubeMats, tsMat, capacity: lay.capacity }
}

export function ShellTubeModel({ eq }: { eq: ShellTube }) {
  const built = useMemo(() => {
    const b = buildShellTube(eq)
    return { ...b, entries: b.parts.build() }
  }, [eq])
  useEffect(
    () => () => {
      built.tsMat.map?.dispose()
      built.tsMat.dispose()
    },
    [built],
  )
  const tubeMat = useMemo(() => paint('#b4babe', 'internal', { metalness: 0.85, roughness: 0.3 }), [])
  return (
    <group>
      <PartMeshes entries={built.entries} />
      <Instances geometry={built.tubeGeo} material={tubeMat} matrices={built.tubeMats} shadow={false} />
      {eq.nozzles.map((n) => (
        <NozzleNeck key={n.id} eq={eq} nozzle={n} />
      ))}
    </group>
  )
}

