// Manual alarm call point (fire, red) or ESD push-button station (yellow): Ex d box with break-glass window and hinged flap, sign plate above, on a post or wall. EN 54-11, ISO 7010.
import * as THREE from 'three'
import { Kit, mat4 } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { tagPlate } from '../lib/parts'
import { ICON, LED_GREEN, canvasMat, cableToDeck, mounted, polePlate, signMat, stopPlug, warnMat, type Mount } from './_fg'

export interface ManualCallPointProps {
  kind?: 'fire' | 'esd'
  mount?: Mount
  /** operating element above the deck, m */
  height?: number
  sign?: boolean
  tag?: string
}

export const defaults = { kind: 'fire' as 'fire' | 'esd', mount: 'pole' as Mount, height: 1.4, sign: true, tag: 'MAC-201' }

export function ManualCallPoint(props: ManualCallPointProps & GroupProps) {
  const { kind, mount, height, sign, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, kind, mount, Math.max(0.8, height), sign, tag), [kind, mount, height, sign, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default ManualCallPoint

function faceMat(kind: 'fire' | 'esd') {
  return canvasMat(`mcp-face-${kind}`, 256, 256, (g) => {
    const body = kind === 'fire' ? '#c22a20' : '#f2c318'
    const ink = kind === 'fire' ? '#c22a20' : '#141414'
    g.fillStyle = body
    g.fillRect(0, 0, 256, 256)
    g.fillStyle = '#f4f2ec'
    g.fillRect(34, 34, 188, 188)
    g.strokeStyle = '#1a1a1a'
    g.lineWidth = 6
    g.strokeRect(46, 46, 164, 164)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    if (kind === 'fire') {
      g.lineWidth = 8
      g.strokeStyle = ink
      g.beginPath()
      g.moveTo(80, 120)
      g.lineTo(128, 74)
      g.lineTo(176, 120)
      g.moveTo(92, 110)
      g.lineTo(92, 170)
      g.lineTo(164, 170)
      g.lineTo(164, 110)
      g.stroke()
      g.fillStyle = ink
      g.beginPath()
      g.arc(128, 140, 16, 0, Math.PI * 2)
      g.fill()
    } else {
      g.fillStyle = '#c22a20'
      g.beginPath()
      g.arc(128, 122, 44, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#141414'
      g.font = 'bold 34px Arial, sans-serif'
      g.fillText('ESD', 128, 122)
    }
    g.fillStyle = '#1a1a1a'
    g.font = 'bold 30px Arial, sans-serif'
    g.fillText('PUSH', 128, 196)
    g.fillStyle = kind === 'fire' ? '#ffffff' : '#141414'
    g.font = 'bold 22px Arial, sans-serif'
    g.fillText(kind === 'fire' ? 'FIRE' : 'SHUTDOWN', 128, 18)
  })
}

function build(k: Kit, kind: 'fire' | 'esd', mount: Mount, height: number, sign: boolean, tag: string) {
  const body = kind === 'fire' ? 'actuatorRed' : 'actuatorYellow'
  const signY = 0.2
  const zf = mounted(k, mount, height, [0.12, 0.24], () => {
    for (const s of [-1, 1]) {
      k.box('stainless', [0.012, 0.09, 0.03], [s * 0.035, 0, 0.015])
      k.box('stainless', [0.03, 0.09, 0.004], [s * 0.035, 0, 0.002])
      for (const y of [-0.03, 0.03]) k.hex('nut', 0.014, 0.006, [s * 0.035 + s * 0.012, y, 0.007], 'z')
    }
    const zb = 0.03 + 0.0325
    k.rbox(body, [0.13, 0.13, 0.065], 0.01, [0, 0, zb])
    // recessed face, break-glass window, hinged flap and test-key hole
    k.add(faceMat(kind), new THREE.PlaneGeometry(0.105, 0.105), mat4([0, 0.006, zb + 0.0328]))
    k.box('glass', [0.09, 0.09, 0.004], [0, 0.006, zb + 0.036])
    k.cyl('stainless', 0.003, 0.09, [0, 0.053, zb + 0.036], 'x', 6)
    k.cyl('nut', 0.006, 0.004, [0, -0.056, zb + 0.0335], 'z', 12)
    k.sphere(LED_GREEN, 0.004, [0.05, -0.056, zb + 0.033], undefined, 8)
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) k.cyl('stainless', 0.004, 0.003, [sx * 0.056, sy * 0.056, zb + 0.033], 'z', 8)
    k.hex('brass', 0.03, 0.02, [0, -0.075, zb], 'y')
    stopPlug(k, [0.035, 0.068, zb], 'y')
    stopPlug(k, [-0.068, -0.03, zb], '-x')
  }, height + (sign ? signY + 0.08 : 0.12))
  // sign plate above on its own standoffs
  if (sign) {
    const y = height + signY
    const mat = kind === 'fire' ? signMat(['FIRE ALARM', 'CALL POINT'], '#c22a20', '#ffffff', ICON.flame) : warnMat(['ESD', 'EMERGENCY SHUTDOWN'])
    let z = 0.02
    if (mount === 'pole') {
      z = polePlate(k, y, 0.16, 0.1) + 0.014
      for (const s of [-1, 1]) k.cyl('stainless', 0.008, 0.014, [s * 0.065, y, z - 0.007], 'z', 8)
    }
    else for (const s of [-1, 1]) k.cyl('stainless', 0.006, 0.02, [s * 0.09, y, 0.01], 'z', 8)
    k.box('stainless', [0.226, 0.116, 0.004], [0, y, z + 0.002])
    k.plane(mat, 0.22, 0.11, [0, y, z + 0.0055])
  }
  tagPlate(k, tag, [0, height - 0.1, zf + 0.001], 'z', 0.11)
  cableToDeck(k, mount, [0, height - 0.085, zf + 0.0625])
}
