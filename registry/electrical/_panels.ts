// Switchgear / MCC line-up builder shared by the switchgear component and the e-house interior. Fronts face +Z, line-up runs along X.
import * as THREE from 'three'
import type { Kit, MatKey, V3 } from '../lib/kit'
import { paint } from '../lib/materials'
import { gauge } from '../lib/parts'
import { textMaterial } from '../lib/textures'
import { lamp, mccFrontMaterial, mvFrontMaterial, relayFaceMaterial } from './_textures'

export type LineupKind = 'mv' | 'lv' | 'mcc'

export interface LineupOpts {
  kind: LineupKind
  panels: number
  /** line voltage, kV */
  kv: number
  /** floor level the base frame stands on */
  y0?: number
  tag?: string
}

/** Panel width, height and depth for a line-up type and voltage (IEC 62271-200 / IEC 61439 typical). */
export function panelSize(kind: LineupKind, kv: number): V3 {
  if (kind === 'mv') {
    const w = kv > 24 ? 1.0 : kv > 12 ? 0.8 : 0.65
    return [w, kv > 24 ? 2.4 : 2.3, kv > 24 ? 2.3 : kv > 12 ? 1.75 : 1.5] // typical
  }
  return kind === 'mcc' ? [0.6, 2.2, 0.6] : [0.8, 2.2, 0.8] // typical
}

export function lineupWidth(o: LineupOpts) {
  return panelSize(o.kind, o.kv)[0] * o.panels + 0.1
}

const front = new THREE.Quaternion()

/** Builds the line-up into k: base frame, panels with doors and devices, end covers, arc duct. Returns overall size. */
export function lineup(k: Kit, o: LineupOpts): { w: number; h: number; d: number } {
  const [pw, H, D] = panelSize(o.kind, o.kv)
  const y0 = o.y0 ?? 0
  const n = Math.max(1, Math.round(o.panels))
  const Wt = pw * n
  const body = paint('#cdd1cc', { metalness: 0.25, roughness: 0.45, clearcoat: 0.2, weather: 0 })
  const dark: MatKey = paint('#3c4146', { metalness: 0.3, roughness: 0.5, clearcoat: 0, weather: 0 })
  const yb = y0 + 0.1 // base frame top
  const Hf = H - 0.1
  // base frame (channel) and kick plate
  k.box('structSteelDark', [Wt + 0.1, 0.1, D], [0, y0 + 0.05, -D / 2])
  k.box(dark, [Wt + 0.1, 0.09, 0.006], [0, y0 + 0.05, 0.003])
  // end covers
  for (const s of [-1, 1]) k.box(body, [0.05, H, D], [s * (Wt / 2 + 0.025), y0 + H / 2, -D / 2])
  const yAt = (f: number) => yb + Hf * (1 - f) // canvas fraction from the top -> y

  for (let i = 0; i < n; i++) {
    const xc = -Wt / 2 + pw * (i + 0.5)
    k.box(body, [pw - 0.006, Hf, D - 0.02], [xc, yb + Hf / 2, -D / 2 + 0.01])
    // door hinges on the left jamb
    if (o.kind === 'mv') {
      const incomer = i === 0 || (i === n - 1 && n > 3)
      const busSection = n >= 6 && i === Math.floor(n / 2)
      const name = incomer ? `INCOMER ${i === 0 ? 1 : 2}` : busSection ? 'BUS SECTION' : `FEEDER ${String(i).padStart(2, '0')}`
      k.plane(mvFrontMaterial(name, o.kv, incomer), pw - 0.02, Hf, [xc, yb + Hf / 2, 0.003], front)
      // LV / relay compartment: protection relay IED, ammeter, lamps, selector, MCB window
      const yr = yAt(0.16)
      k.box(dark, [0.2, 0.26, 0.08], [xc - pw * 0.18, yr, 0.04])
      k.plane(relayFaceMaterial(), 0.18, 0.225, [xc - pw * 0.18, yr, 0.0815], front)
      gauge(k, [xc + pw * 0.2, yAt(0.1), 0.003], 'z', 0.08, 'bar', 600)
      const cols = ['green', 'red', 'amber', 'white'] as const
      cols.forEach((c, j) => {
        const lx = xc + pw * 0.08 + j * 0.045
        k.cyl('nut', 0.014, 0.02, [lx, yAt(0.23), 0.012], 'z', 12)
        k.cyl(lamp(c), 0.011, 0.012, [lx, yAt(0.23), 0.026], 'z', 12)
      })
      k.cyl('nut', 0.022, 0.02, [xc + pw * 0.28, yAt(0.23), 0.012], 'z', 14) // local / remote selector
      k.box('rubberBlack', [0.012, 0.05, 0.02], [xc + pw * 0.28, yAt(0.23), 0.03])
      // breaker compartment: viewing window, racking hole, push buttons, position indicator, handle
      k.box('nut', [pw * 0.7, 0.15, 0.012], [xc, yAt(0.6), 0.006])
      k.box('glass', [pw * 0.66, 0.12, 0.006], [xc, yAt(0.6), 0.014])
      k.cyl('rubberBlack', 0.02, 0.02, [xc, yAt(0.5), 0.01], 'z', 14)
      k.cyl(lamp('green'), 0.016, 0.018, [xc - 0.06, yAt(0.45), 0.012], 'z', 14)
      k.cyl('actuatorRed', 0.016, 0.018, [xc + 0.06, yAt(0.45), 0.012], 'z', 14)
      k.rod('stainless', [xc + pw * 0.4, yAt(0.36), 0.04], [xc + pw * 0.4, yAt(0.52), 0.04], 0.012, 8)
      for (const f of [0.37, 0.51]) k.box('stainless', [0.02, 0.02, 0.04], [xc + pw * 0.4, yAt(f), 0.02])
      // cable compartment: bolted cover, voltage presence indicators, interlock
      for (const f of [0.73, 0.98]) for (const s of [-1, 1]) k.hex('nut', 0.022, 0.012, [xc + s * pw * 0.42, yAt(f), 0.009], 'z')
      for (let j = 0; j < 3; j++) k.cyl(lamp('amber'), 0.008, 0.012, [xc - 0.04 + j * 0.04, yAt(0.84), 0.009], 'z', 10)
      for (const f of [0.08, 0.5, 0.86]) k.cyl('nut', 0.012, 0.08, [xc - pw / 2 + 0.02, yAt(f), 0.01], 'y', 8)
    } else {
      const tiers = o.kind === 'mcc' ? 7 : 4
      k.plane(mccFrontMaterial(i + 1, tiers), pw - 0.02, Hf, [xc, yb + Hf / 2, 0.003], front)
      const th = (Hf * (1 - 60 / 736)) / tiers
      for (let t = 0; t < tiers; t++) {
        const yt = yAt(40 / 736) - th * (t + 0.5)
        // rotary isolator: yellow plate, red handle
        k.box('actuatorYellow', [0.07, 0.07, 0.01], [xc - pw * 0.3, yt, 0.008])
        k.cyl('nut', 0.018, 0.02, [xc - pw * 0.3, yt, 0.02], 'z', 12)
        k.box('actuatorRed', [0.018, 0.075, 0.02], [xc - pw * 0.3, yt, 0.035], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), t % 3 === 2 ? Math.PI / 2 : 0))
        const cs = t % 3 === 2 ? (['red', 'amber'] as const) : (['green', 'white'] as const)
        cs.forEach((c, j) => {
          k.cyl('nut', 0.012, 0.016, [xc + pw * 0.08 + j * 0.04, yt - th * 0.18, 0.01], 'z', 10)
          k.cyl(lamp(c), 0.009, 0.01, [xc + pw * 0.08 + j * 0.04, yt - th * 0.18, 0.022], 'z', 10)
        })
        if (o.kind === 'lv' && t === 0) gauge(k, [xc + pw * 0.3, yt, 0.003], 'z', 0.07, 'bar', 600)
        for (const s of [-1, 1]) k.box('stainless', [0.03, 0.012, 0.02], [xc + s * pw * 0.42, yt + th * 0.3, 0.012])
      }
    }
    // rear: bolted cable / busbar compartment covers with warning label (rear access for termination and CT work)
    {
      const zr = -D - 0.003
      const covers = o.kind === 'mv' ? [[0.08, 0.52], [0.56, 0.97]] : [[0.1, 0.95]]
      for (const [f0, f1] of covers) {
        const yc = (yAt(f0) + yAt(f1)) / 2
        const hh = yAt(f0) - yAt(f1)
        k.box(body, [pw - 0.06, hh, 0.006], [xc, yc, zr])
        for (const sy of [-1, 1]) for (const sx of [-1, 0, 1]) k.hex('nut', 0.02, 0.01, [xc + sx * (pw / 2 - 0.06), yc + sy * (hh / 2 - 0.04), zr - 0.006], 'z')
      }
      k.plane(textMaterial('DANGER  HV' , '#f4c414', '#111111', 256, 64), 0.16, 0.04, [xc, yAt(0.3), zr - 0.004], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI))
    }
    if (o.kind === 'mv') {
      // earthing-switch operating socket with mechanical position indicator and padlockable shutter
      k.cyl('nut', 0.022, 0.012, [xc - pw * 0.25, yAt(0.65), 0.006], 'z', 14)
      k.cyl('rubberBlack', 0.012, 0.014, [xc - pw * 0.25, yAt(0.65), 0.008], 'z', 12)
      k.box('actuatorYellow', [0.05, 0.02, 0.006], [xc - pw * 0.25, yAt(0.62), 0.006])
    }
    // top: pressure-relief flap (MV) or ventilation hood
    if (o.kind === 'mv') k.box(body, [pw * 0.8, 0.012, D * 0.4], [xc, yb + Hf + 0.006, -D * 0.3], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.08))
    else k.box(dark, [pw * 0.7, 0.05, D * 0.5], [xc, yb + Hf + 0.025, -D * 0.5])
  }
  // arc-gas exhaust duct (MV) or busbar trunking (LV) along the top rear
  if (o.kind === 'mv') {
    k.box(body, [Wt + 0.1, 0.35, 0.45], [0, yb + Hf + 0.2, -D + 0.23])
  }
  // line-up designation strip
  if (o.tag) {
    const yt = o.kind === 'mv' ? yb + Hf + 0.2 : yb + Hf - 0.06
    const zt = o.kind === 'mv' ? -D + 0.457 : 0.006
    k.plane(textMaterial(o.tag, '#1f4e9a', '#ffffff', 512, 64), Math.min(Wt * 0.5, 1.6), 0.09, [0, yt, zt], front)
  }
  return { w: Wt + 0.1, h: H + (o.kind === 'mv' ? 0.37 : 0.05), d: D }
}
