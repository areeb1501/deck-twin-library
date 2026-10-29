// Aspirating smoke detector (ASD) for E-houses, LERs and switchrooms: wall-mounted detector unit with status display, red ABS sampling pipe network with labelled sampling holes, wall clips, sockets and drilled end caps, exhaust and field cable. EN 54-20, NFPA 72, BS 5839-1.
import * as THREE from 'three'
import { Kit, mat4, type V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { canvasMat, cableToDeck, stopPlug } from './_fg'

export interface AspiratingSmokeDetectorProps {
  /** detector unit centre above the floor, m */
  height?: number
  /** sampling pipe height under the ceiling, m */
  pipeHeight?: number
  /** horizontal pipe run per branch, m */
  length?: number
  /** sampling hole spacing, m */
  spacing?: number
  /** 1: one run to +X; 2: runs to +X and -X */
  branches?: number
  tag?: string
}

export const defaults = { height: 1.5, pipeHeight: 3, length: 8, spacing: 2, branches: 1, tag: 'ASD-9101' }

const PIPE = paint('#c22a1f', { metalness: 0.05, roughness: 0.38, clearcoat: 0.4 })
const CASE = paint('#e7e7e2', { metalness: 0.05, roughness: 0.5 })
const OD = 0.025 // ABS sampling pipe, m
const WALL = 0.002
const RB = 0.06 // swept bend radius, m
const W = 0.35 // typical industrial ASD unit
const HU = 0.225 // typical
const DU = 0.13 // typical
const ZP = DU / 2 // pipe centreline off the wall, m

export function AspiratingSmokeDetector(props: AspiratingSmokeDetectorProps & GroupProps) {
  const { height, pipeHeight, length, spacing, branches, tag, ...group } = { ...defaults, ...props }
  const h = Math.max(0.8, height)
  const c = Math.max(h + HU / 2 + 0.3, pipeHeight)
  const data = useKit((k) => build(k, h, c, Math.max(0.5, length), Math.max(0.3, spacing), branches >= 2 ? 2 : 1, tag), [h, c, length, spacing, branches, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default AspiratingSmokeDetector

function panelMat() {
  return canvasMat('asd-panel', 512, 320, (g) => {
    g.fillStyle = '#2b2f33'
    g.fillRect(0, 0, 512, 320)
    g.fillStyle = '#e7e7e2'
    g.font = 'bold 26px Arial, sans-serif'
    g.textBaseline = 'middle'
    g.fillText('ASPIRATING SMOKE DETECTOR', 24, 30)
    const leds: [string, string][] = [['FIRE 2', '#ff3b30'], ['FIRE 1', '#ff3b30'], ['ACTION', '#ffae1a'], ['ALERT', '#ffae1a'], ['FAULT', '#ffae1a'], ['POWER', '#2bff6e']]
    leds.forEach(([t, col], i) => {
      const y = 78 + i * 38
      g.fillStyle = i === 5 ? col : '#4a4f55'
      g.beginPath()
      g.arc(40, y, 10, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#d6d6d0'
      g.font = '20px Arial, sans-serif'
      g.fillText(t, 62, y)
    })
    // smoke level bar graph with alarm thresholds
    for (let i = 0; i < 20; i++) {
      g.fillStyle = i < 3 ? '#2bff6e' : '#3a3f45'
      g.fillRect(200 + i * 14, 270 - i * 8, 10, 12 + i * 8)
    }
    g.fillStyle = '#d6d6d0'
    g.font = '18px Arial, sans-serif'
    g.fillText('SMOKE  %obs/m', 200, 300)
    g.fillText('AIRFLOW  OK', 380, 300)
  }, { emissive: 0.3 })
}

function labelMat() {
  return canvasMat('asd-hole', 64, 256, (g) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, 64, 256)
    g.fillStyle = '#c22a1f'
    g.fillRect(0, 0, 64, 14)
    g.fillRect(0, 242, 64, 14)
    g.translate(32, 128)
    g.rotate(Math.PI / 2)
    g.font = 'bold 26px Arial, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('SAMPLING HOLE', 0, 0)
  })
}

/** Wall clip: stand-off saddle from the wall (z = 0) to a pipe at (p) running along `along`. */
function clip(k: Kit, p: V3, along: 'x' | 'y') {
  const zb = p[2] - OD / 2 - 0.004
  k.box('plasticGrey', along === 'x' ? [0.03, 0.03, zb] : [0.03, 0.03, zb], [p[0], p[1], zb / 2])
  k.torus('plasticGrey', OD / 2 + 0.0025, 0.003, p, along, 6, 20)
  k.cyl('nut', 0.005, 0.004, [p[0], p[1], zb + 0.0005], 'z', 8)
}

function socket(k: Kit, p: V3, axis: 'x' | 'y') {
  k.cyl(PIPE, OD / 2 + 0.003, 0.05, p, axis, 24)
}

function build(k: Kit, h: number, c: number, L: number, s: number, branches: number, tag: string) {
  // detector unit: wall bracket, case, front cover with display, inlets on top, exhaust under
  k.box('stainless', [W - 0.04, HU + 0.06, 0.006], [0, h, 0.003])
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.hex('nut', 0.016, 0.007, [sx * (W / 2 - 0.035), h + sy * (HU / 2 + 0.018), 0.0095], 'z')
  k.rbox(CASE, [W, HU, DU - 0.02], 0.012, [0, h, 0.006 + (DU - 0.02) / 2])
  k.rbox(CASE, [W - 0.01, HU - 0.01, 0.02], 0.008, [0, h, DU - 0.004])
  k.add(panelMat(), new THREE.PlaneGeometry(0.2, 0.125), mat4([-0.05, h + 0.02, DU + 0.0065]))
  k.box('glass', [0.21, 0.135, 0.002], [-0.05, h + 0.02, DU + 0.007])
  for (let i = 0; i < 4; i++) k.cyl('nut', 0.005, 0.004, [(i < 2 ? -1 : 1) * (W / 2 - 0.02), h + (i % 2 ? 1 : -1) * (HU / 2 - 0.02), DU + 0.007], 'z', 10)
  tagPlate(k, tag, [0.11, h + 0.06, DU + 0.0065], 'z', 0.09)
  k.box('nameplate', [0.08, 0.04, 0.002], [0.11, h - 0.04, DU + 0.006])
  const inlets = [-0.12, -0.04, 0.04, 0.12]
  const used = branches === 2 ? [0.12, -0.12] : [0.12]
  const yt = h + HU / 2
  for (const x of inlets) {
    k.cyl(CASE, OD / 2 + 0.006, 0.02, [x, yt + 0.01, ZP], 'y', 20)
    if (!used.includes(x)) k.cyl('rubberBlack', OD / 2 + 0.002, 0.012, [x, yt + 0.026, ZP], 'y', 16)
  }
  // exhaust port: short open pipe stub pointing down
  k.cyl(CASE, OD / 2 + 0.006, 0.02, [0.1, h - HU / 2 - 0.01, ZP], 'y', 20)
  k.pipe(PIPE, [0.1, h - HU / 2 - 0.005, ZP], [0.1, h - HU / 2 - 0.12, ZP], OD, WALL, 24)
  // field cable entry
  k.hex('brass', 0.026, 0.014, [-0.1, h - HU / 2 - 0.007, ZP], 'y')
  stopPlug(k, [-0.04, h - HU / 2 - 0.004, ZP], '-y', 0.024)
  cableToDeck(k, 'wall', [-0.1, h - HU / 2 - 0.014, ZP])

  const lab = labelMat()
  for (const x0 of used) {
    const dir = x0 > 0 ? 1 : -1
    const yb = c - RB
    // riser to the ceiling run, swept bend, horizontal run with sockets every 3 m
    k.pipe(PIPE, [x0, yt + 0.005, ZP], [x0, yb, ZP], OD, WALL, 24)
    socket(k, [x0, yt + 0.045, ZP], 'y')
    k.bend(PIPE, [x0, yb, ZP], [0, 1, 0], [dir, 0, 0], RB, OD, Math.PI / 2, WALL)
    for (let y = yt + 0.4; y < yb - 0.1; y += 1.5) clip(k, [x0, y, ZP], 'y')
    const xs = x0 + dir * RB
    const xe = xs + dir * L
    k.pipe(PIPE, [xs, c, ZP], [xe, c, ZP], OD, WALL, 24)
    for (let d = 3; d < L - 0.1; d += 3) socket(k, [xs + dir * d, c, ZP], 'x')
    for (let d = 0.75; d < L - 0.1; d += 1.5) clip(k, [xs + dir * d, c, ZP], 'x')
    // sampling holes on the underside, each with a wrap-round label
    for (let d = s; d < L - 0.05; d += s) {
      const x = xs + dir * d
      k.disc('pipeBore', 0.0018, [x, c - OD / 2 - 0.0002, ZP], '-y', 10)
      k.add(lab, new THREE.CylinderGeometry(OD / 2 + 0.0004, OD / 2 + 0.0004, 0.06, 24, 1, true, -1.3, 2.6), mat4([x + dir * 0.04, c, ZP], 'x'))
    }
    // drilled end cap
    k.cyl(PIPE, OD / 2 + 0.003, 0.03, [xe + dir * 0.01, c, ZP], 'x', 24)
    k.disc(PIPE, OD / 2 + 0.003, [xe + dir * 0.025, c, ZP], dir > 0 ? 'x' : '-x', 24)
    k.disc('pipeBore', 0.003, [xe + dir * 0.0252, c, ZP], dir > 0 ? 'x' : '-x', 12)
  }
}
