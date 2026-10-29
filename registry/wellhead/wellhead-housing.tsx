// Surface wellhead without a tree: casing head, casing / tubing head spools, annulus outlet valves, lockdown screws, test ports, top blind or open. API 6A.
import type { Kit } from '../lib/kit'
import { KitMesh, useKit, type GroupProps } from '../lib/mesh'
import { gauge, tagPlate } from '../lib/parts'
import { port, type Port } from '../lib/ports'
import type { Psi } from './_api6a'
import { buildWellhead, wellheadLayout } from './_wellhead'
import { G, bore, flangeAt, joint, needleValve, openFace } from './_wellparts'

export interface WellheadHousingProps {
  pressureRating?: Psi
  /** casing head + spools height, m (< 0.6 compact, ≤ 1.3 two sections, else three) */
  wellheadHeight?: number
  /** tubing head top: blind flange with gauge, or open face ready for a tree / BOP */
  top?: 'blind' | 'open'
  tag?: string
}

export const defaults = { pressureRating: 5000 as Psi, wellheadHeight: 1.1, top: 'blind' as 'blind' | 'open', tag: 'WH-101' }

type P = typeof defaults

export function ports(props: WellheadHousingProps = {}): Port[] {
  const p = { ...defaults, ...props } as P
  const W = wellheadLayout({ psi: p.pressureRating, height: p.wellheadHeight, crossovers: true })
  return W.outlets.map((o) => port(o.id, `${o.id.replace('annulus-', '').toUpperCase()} annulus`, o.face, o.u, o.nps, o.rating, 'utility'))
}

export function WellheadHousing(props: WellheadHousingProps & GroupProps) {
  const { pressureRating, wellheadHeight, top, tag, ...group } = { ...defaults, ...props }
  const p = { pressureRating, wellheadHeight, top, tag } as P
  const data = useKit((k) => build(k, p), Object.values(p))
  return (
    <group {...group}>
      <KitMesh data={data} />
    </group>
  )
}

export default WellheadHousing

function build(k: Kit, p: P) {
  const W = buildWellhead(k, { psi: p.pressureRating, height: p.wellheadHeight, crossovers: true })
  const F = W.F11
  const sp = W.spools[W.spools.length - 1]
  const rb = Math.max(sp.ft.od, sp.fb?.od ?? 0) * 0.36
  bore(k, Math.min(rb * 0.55, 0.16), sp.y0 + 0.05, W.T - G)
  k.at([0, W.T, 0], undefined, () => {
    if (p.top === 'blind') {
      joint(k, F, 0)
      flangeAt(k, F, 0, 1, 'flangeSteel')
      // test / bleed port with needle valve and gauge, lifting eye
      needleValve(k, [0, G + F.t, 0], 'y')
      k.rod('stainless', [0, G + F.t + 0.105, 0], [0, G + F.t + 0.16, 0], 0.008, 8)
      gauge(k, [0, G + F.t + 0.22, 0], 'z', 0.1, 'bar', p.pressureRating >= 10000 ? 1000 : 400)
      k.torus('flangeSteel', 0.05, 0.014, [F.od * 0.3, G + F.t + 0.05, 0], 'z', 8, 20)
      k.box('flangeSteel', [0.06, 0.04, 0.04], [F.od * 0.3, G + F.t + 0.01, 0])
    } else openFace(k, F)
  })
  tagPlate(k, p.tag, [0, (sp.y0 + W.T) / 2, -rb - 0.003], '-z', 0.16)
}
