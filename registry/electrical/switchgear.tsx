// MV metal-clad switchgear, LV switchboard or MCC line-up on a plinth over a cable trench. IEC 62271-200, IEC 61439.
import { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { checkerPlate, tagPlate } from '../lib/parts'
import { earthBoss } from './_parts'
import { lineup, panelSize, type LineupKind } from './_panels'

export interface SwitchgearProps {
  kind?: LineupKind
  /** number of panels / sections */
  panels?: number
  /** line voltage, kV */
  kv?: number
  /** concrete plinth with cable trench and operator mat */
  plinth?: boolean
  tag?: string
}

export const defaults = {
  kind: 'mv' as LineupKind,
  panels: 8,
  kv: 11,
  plinth: true,
  tag: 'SWBD-8801',
}

export function Switchgear(props: SwitchgearProps & GroupProps) {
  const { kind, panels, kv, plinth, tag, ...group } = { ...defaults, ...props }
  const data = useKit((k) => build(k, { kind, panels, kv, plinth, tag }), [kind, panels, kv, plinth, tag])
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default Switchgear

function build(k: Kit, p: typeof defaults) {
  const [pw, , D] = panelSize(p.kind, p.kv)
  const n = Math.max(1, Math.min(30, Math.round(p.panels)))
  const W = pw * n + 0.1
  const aisle = p.kind === 'mv' ? 1.2 : 0.9 // operator mat / withdrawal space shown
  const hp = p.plinth ? 0.3 : 0
  const z0 = p.plinth ? (D + 0.4 - aisle) / 2 : D / 2 // line-up front, footprint centred
  if (p.plinth) {
    const Wp = W + 0.6
    const zr = z0 - D - 0.2 // rear trench centre
    // plinth under the line-up and the operating aisle
    k.box('concrete', [Wp, hp, D + aisle], [0, hp / 2, z0 + (aisle - D) / 2])
    // rear cable trench: floor, walls, checker-plate covers on a steel kerb
    k.box('concrete', [Wp, 0.06, 0.4], [0, 0.03, zr])
    k.box('concrete', [Wp, hp, 0.1], [0, hp / 2, zr - 0.15])
    for (const s of [-1, 1]) k.box('concrete', [0.1, hp, 0.2], [s * (Wp / 2 - 0.05), hp / 2, zr + 0.05])
    k.box('structSteelDark', [Wp - 0.2, 0.02, 0.03], [0, hp - 0.01, z0 - D - 0.015])
    checkerPlate(k, [0, hp, zr - 0.025], Wp - 0.2, 0.15)
    // insulating rubber mat (IEC 61111) with ribs
    k.box('rubberBlack', [W, 0.008, aisle - 0.2], [0, hp + 0.004, z0 + 0.1 + (aisle - 0.2) / 2])
    for (let i = 0; i < 12; i++) k.box('rubberBlack', [W, 0.004, 0.006], [0, hp + 0.01, z0 + 0.13 + (i * (aisle - 0.26)) / 11])
    // cables rising from the trench into the rear of each panel
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + 0.05 + pw * (i + 0.5)
      for (let c = 0; c < 3; c++) k.spline('cable', [[x - 0.08 + c * 0.08, 0.08, zr - 0.05], [x - 0.08 + c * 0.08, hp * 0.6, z0 - D - 0.05], [x - 0.08 + c * 0.08, hp + 0.15, z0 - D + 0.1]], 0.022, 8, 12)
    }
    // main earth bar along the plinth front with a boss at each end
    k.box('copper', [W, 0.04, 0.006], [0, hp * 0.5, z0 + aisle + 0.003])
    for (const s of [-1, 1]) earthBoss(k, [s * (W / 2 - 0.1), hp * 0.5, z0 + aisle + 0.006], 'z')
  }
  k.at([0, 0, z0], undefined, () => lineup(k, { kind: p.kind, panels: n, kv: p.kv, y0: hp, tag: p.tag }))
  tagPlate(k, p.tag, [W / 2 + 0.051, hp + 1.6, z0 - D / 2], 'x', 0.18)
}
