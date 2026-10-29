// Process electric heater: horizontal pressure shell on saddles, flanged immersion heater bundle with standoff and Ex d terminal enclosure, inlet/outlet nozzles, thermowells. ASME VIII-1, IEC 60079-1, ASME B16.5.
import * as THREE from 'three'
import { Kit, type MatKey, type V3 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, junctionBox, liftingLug, saddle, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import { nozzleStandout, pipeOD, shellThickness, type Rating } from '../lib/standards'
import { textMaterial } from '../lib/textures'
import { clamp, earthBoss, girthDims, girthFlange, girthStuds, head, openNozzle, seamX, shellX } from './_thermal'

export interface ElectricHeaterProps {
  /** rated power, kW */
  kw?: number
  nps?: number
  rating?: Rating
  /** design pressure, barg */
  pressure?: number
  /** shell bottom above deck, m */
  elevation?: number
  insulated?: boolean
  tag?: string
  paint?: MatKey
}

export const defaults = {
  kw: 600,
  nps: 6,
  rating: 300 as Rating,
  pressure: 30,
  elevation: 0.7,
  insulated: false,
  tag: 'EH-100',
  paint: 'equipmentPaint' as MatKey,
}

type P = typeof defaults

function dims(p: P) {
  // typical: element bundle sized at ~ 4 W/cm² sheath loading, 16 mm elements on a 26 mm pitch
  const D = clamp(Math.round((0.28 + 0.00045 * p.kw) * 20) / 20, 0.3, 1.6)
  const L = clamp(1.6 + p.kw / 220, 2, 9)
  const wall = shellThickness(p.pressure, D)
  const Ro = D / 2 + wall
  const G = girthDims(Ro)
  const yc = p.elevation + Ro
  const hd = D / 4 + wall
  const xF = -L / 2 // shell flange face (heater flange bolts here)
  const tHF = G.tf * 1.1 // heater (bundle) flange thickness
  const standoff = clamp(0.25 + 0.1 * D, 0.3, 0.5)
  const Re = Math.min(G.Rf * 0.92, 0.75) // terminal enclosure radius
  const encL = clamp(0.35 + 0.25 * D, 0.4, 0.8)
  const xE1 = xF - tHF - standoff // enclosure flange face
  const xE0 = xE1 - encL
  const xEnd = L / 2 + hd
  const off = -(xE0 + xEnd) / 2
  const so = nozzleStandout(p.nps, p.rating, p.insulated)
  const xin = xF + G.tf + G.hubL + pipeOD(p.nps) + 0.15
  const xout = L / 2 - pipeOD(p.nps) - 0.2
  return { D, L, wall, Ro, G, yc, hd, xF, tHF, standoff, Re, encL, xE0, xE1, xEnd, off, so, xin, xout }
}

export function ports(props: ElectricHeaterProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const d = dims(p)
  return [
    port('inlet', 'Process inlet', [d.xin + d.off, d.yc + d.Ro + d.so, 0], [0, 1, 0], p.nps, p.rating),
    port('outlet', 'Process outlet', [d.xout + d.off, d.yc + d.Ro + d.so, 0], [0, 1, 0], p.nps, p.rating),
  ]
}

export function ElectricHeater(props: ElectricHeaterProps & GroupProps) {
  const { kw, nps, rating, pressure, elevation, insulated, tag, paint, ...group } = { ...defaults, ...props }
  const p = { kw, nps, rating, pressure, elevation, insulated, tag, paint } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ElectricHeater

function build(k: Kit, p: P) {
  const d = dims(p)
  const { Ro, G, yc, L, xF } = d
  const P = p.paint
  const S: MatKey = p.insulated ? 'insulation' : P
  const encMat: MatKey = 'equipmentPaintDark'
  k.at([d.off, 0, 0], undefined, () => {
    k.at([0, yc, 0], undefined, () => {
      // shell with welded head at the far end, body flange at the heater end
      girthFlange(k, P, xF, Ro, G, 1)
      shellX(k, S, Ro, xF + G.tf + G.hubL - 0.001, L / 2)
      head(k, S, Ro, d.hd, L / 2, 1)
      seamX(k, P, Ro, L / 2)
      // heater flange (tubesheet carrying the elements) bolted to the shell flange
      k.cyl(P, G.Rf, d.tHF, [xF - d.tHF / 2 - 0.002, 0, 0], 'x', 64)
      k.cyl('gasket', G.Rf - 0.03, 0.004, [xF - 0.002, 0, 0], 'x', 48)
      girthStuds(k, xF - d.tHF - 0.004, xF + G.tf, G)
      // standoff (thermal break) to the terminal enclosure, with cooling fins
      const Rs = Math.min(Ro * 0.55, 0.3)
      k.cyl(P, Rs, d.standoff, [xF - d.tHF - d.standoff / 2, 0, 0], 'x', 32)
      for (let i = 1; i < 5; i++) k.cyl(P, Rs + 0.04, 0.008, [xF - d.tHF - (d.standoff * i) / 5, 0, 0], 'x', 32)
      // auxiliary Ex d box for the over-temperature sensors, on the standoff
      const xa = xF - d.tHF - d.standoff * 0.5
      k.rbox(encMat, [0.18, 0.16, 0.16], 0.015, [xa, Rs + 0.12, 0])
      k.cyl(encMat, 0.03, 0.06, [xa, Rs + 0.02, 0], 'y', 10)
      k.cyl('brass', 0.015, 0.05, [xa + 0.11, Rs + 0.12, 0], 'x', 10)
      // Ex d terminal enclosure: flanged body and heavy bolted cover
      const { Re, xE0, xE1, encL } = d
      k.cyl(encMat, Re, encL - 0.08, [xE0 + 0.04 + (encL - 0.08) / 2, 0, 0], 'x', 48)
      k.cyl(encMat, Re + 0.05, 0.05, [xE1 - 0.025, 0, 0], 'x', 48)
      k.cyl(encMat, Re + 0.05, 0.05, [xE0 + 0.065, 0, 0], 'x', 48)
      k.lathe(encMat, [[0, xE0 - 0.02], [Re * 0.6, xE0 - 0.015], [Re + 0.05, xE0 + 0.04]], [0, 0, 0], 'x', 48)
      const nb = Math.max(12, Math.round((2 * Math.PI * (Re + 0.025)) / 0.09))
      k.boltCircle('stainless', 'nut', nb, Re + 0.025, [xE0 + 0.01, 0, 0], 'x', 0.016, 0.1, [0.012], Math.PI / nb)
      // cable glands on the underside, earth stud, element thermocouple heads, warning label
      for (let i = 0; i < 3; i++) {
        const x = xE0 + encL * (0.3 + i * 0.2)
        k.cyl('brass', 0.03, 0.08, [x, -Re - 0.03, 0], 'y', 12)
        k.spline('cable', [[x, -Re - 0.07, 0], [x, -Re - 0.3, 0.05], [x + 0.05, -yc + 0.05, 0.2]], 0.022, 8, 16)
      }
      earthBoss(k, [xE0 + encL * 0.5, -Re * 0.4, Re * 0.92], 'z')
      for (const a of [0.5, -0.5]) {
        const c: V3 = [xF - d.tHF - 0.03, Math.cos(a) * (G.Rf * 0.7), Math.sin(a) * (G.Rf * 0.7)]
        k.cyl('stainless', 0.012, 0.12, [c[0] - 0.06, c[1], c[2]], 'x', 8)
        k.cyl('stainless', 0.035, 0.06, [c[0] - 0.15, c[1], c[2]], 'x', 12)
      }
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2)
      k.plane(textMaterial('Ex d IIB T3  DO NOT OPEN WHEN ENERGIZED', '#f2c200', '#111111', 1024, 96), Re * 1.3, 0.09, [xE0 - 0.022, Re * 0.4, 0], q)
      liftingLug(k, [xE0 + encL / 2, Re - 0.005, 0], 'x', 0.7, encMat)
    })
    // nozzles: inlet / outlet on top, vent, drain, PSV, thermowells
    const nz = (x: number, a: number, nps: number, standout: number, blind = false) => {
      const dir: V3 = [0, Math.cos(a), Math.sin(a)]
      return openNozzle(k, { base: [x, yc + Ro * dir[1], Ro * dir[2]], dir, nps, rating: p.rating, standout, pad: pipeOD(nps) * 1.8, mat: P, blind, shellR: Ro })
    }
    nz(d.xin, 0, p.nps, d.so)
    nz(d.xout, 0, p.nps, d.so)
    nz(L / 2 - 0.25, 0.7, 2, 0.2, true) // vent
    nz((d.xin + d.xout) / 2, Math.PI, 2, Math.min(0.25, p.elevation - 0.15), true) // drain
    nz((d.xin + d.xout) / 2 + 0.4, 0, 3, nozzleStandout(3, p.rating), true) // PSV
    for (const x of [d.xout + pipeOD(p.nps) * 0.7 + 0.12, (d.xin + d.xout) / 2 - 0.4]) {
      const a = 0.9
      const n: V3 = [0, Math.cos(a), Math.sin(a)]
      k.pipe('stainless', [x, yc + Ro * n[1] - 0.01, Ro * n[2]], [x, yc + (Ro + 0.12) * n[1], (Ro + 0.12) * n[2]], 0.034, 0.004)
      k.cyl('stainless', 0.045, 0.08, [x, yc + (Ro + 0.16) * n[1], (Ro + 0.16) * n[2]], n, 14)
    }
    {
      const a = 0.45
      const x = d.xout - pipeOD(p.nps) * 0.6 - 0.18
      const n: V3 = [0, Math.cos(a), Math.sin(a)]
      k.pipe('stainless', [x, yc + (Ro - 0.01) * n[1], (Ro - 0.01) * n[2]], [x, yc + (Ro + 0.16) * n[1], (Ro + 0.16) * n[2]], 0.027, 0.004)
      k.box('valveBody', [0.05, 0.05, 0.05], [x, yc + (Ro + 0.09) * n[1], (Ro + 0.09) * n[2]])
      gauge(k, [x, yc + (Ro + 0.2) * n[1], (Ro + 0.2) * n[2]], n, 0.1, 'bar', 60)
    }
    // saddles: fixed at the flange end, sliding at the head end
    const sx0 = xF + G.tf + G.hubL + Math.max(0.35, L * 0.18)
    const sx1 = L / 2 - Math.max(0.3, L * 0.15)
    k.at([0, yc, 0], undefined, () => {
      saddle(k, sx0, Ro, -yc, { mat: P })
      saddle(k, sx1, Ro, -yc, { mat: P, sliding: true })
    })
    for (const x of [sx0 + 0.3, sx1 - 0.3]) liftingLug(k, [x, yc + Ro - 0.01, 0], 'x', clamp(Ro / 0.4, 0.7, 1.2), P)
    const a = -0.3
    const nrm: V3 = [0, Math.sin(a), Math.cos(a)]
    tagPlate(k, p.tag, [(sx0 + sx1) / 2, yc + Ro * nrm[1] + 0.005 * nrm[1], Ro * nrm[2] + 0.005], nrm, 0.3)
    // local control junction box on a stand by the enclosure
    const xj = d.xE0 + 0.1
    k.box('galvanised', [0.06, 1.1, 0.06], [xj, 0.55, -Ro - 0.5])
    k.box('galvanised', [0.35, 0.02, 0.35], [xj, 0.01, -Ro - 0.5])
    junctionBox(k, [xj, 1.0, -Ro - 0.47], 'z', [0.35, 0.4, 0.18])
  })
}
