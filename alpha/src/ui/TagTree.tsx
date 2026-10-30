import { useMemo, useState } from 'react'
import { SYSTEM_LABEL } from '../model/plant'
import { usePlant } from '../state/plantStore'
import { SERVICE } from '../model/catalog'
import type { PickData, SystemId } from '../model/types'
import { useStore } from '../state/store'

type Row = { tag: string; label: string; kind: PickData['kind']; swatch?: string }

const KIND_LABEL: Record<string, string> = {
  horizontalVessel: 'Horizontal vessel',
  verticalVessel: 'Vertical vessel',
  shellTube: 'Shell & tube exchanger',
  pumpPackage: 'Pump package',
  compressorPackage: 'Compressor package',
  pigTrap: 'Pig launcher',
  chemSkid: 'Skid',
  module: 'Module',
  manifold: 'Manifold',
  xmasTree: 'Wellhead / christmas tree',
  gasTurbineGenerator: 'Gas turbine generator',
  caissonPump: 'Caisson pump',
  transformer: 'Power transformer',
  proxy: 'Drilling equipment',
}

export const VALVE_LABEL: Record<string, string> = {
  gate: 'Gate valve',
  globe: 'Globe valve',
  ball: 'Ball valve',
  check: 'Check valve',
  butterfly: 'Butterfly valve',
  control: 'Control valve',
  esdv: 'ESD valve',
  bdv: 'Blowdown valve',
  psv: 'Pressure safety valve',
  needle: 'Needle valve',
}

export const FG_LABEL: Record<string, string> = {
  FD: 'Flame detector (IR3)',
  GD: 'Point gas detector',
  OGD: 'Open-path gas detector',
  HD: 'Heat detector',
  SD: 'Smoke detector',
  MAC: 'Manual call point',
}

export function kindLabel(k: string) {
  return KIND_LABEL[k] ?? k
}

export function TagTree() {
  const plant = usePlant()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({ production: true })
  const selected = useStore((s) => s.selected?.tag)
  const select = useStore((s) => s.select)
  const focus = useStore((s) => s.requestFocus)

  const groups = useMemo(() => {
    const lineSystem = new Map(plant.lines.map((l) => [l.tag, l.system]))
    const out = new Map<SystemId, { equipment: Row[]; lines: Row[]; valves: Row[]; instruments: Row[] }>()
    const g = (s: SystemId) => {
      if (!out.has(s)) out.set(s, { equipment: [], lines: [], valves: [], instruments: [] })
      return out.get(s)!
    }
    for (const e of plant.equipment) g(e.system).equipment.push({ tag: e.tag, label: e.name, kind: 'equipment' })
    for (const l of plant.lines) g(l.system).lines.push({ tag: l.tag, label: SERVICE[l.service].label, kind: 'line', swatch: SERVICE[l.service].flow })
    for (const v of plant.valves) g(lineSystem.get(v.line) ?? 'production').valves.push({ tag: v.tag, label: VALVE_LABEL[v.type], kind: 'valve' })
    for (const i of plant.instruments) {
      const fg = FG_LABEL[i.type]
      const sys = fg ? 'safety' : 'line' in i.on ? lineSystem.get(i.on.line) : plant.equipment.find((e) => e.tag === (i.on as { equipment: string }).equipment)?.system
      g(sys ?? 'production').instruments.push({ tag: i.tag, label: fg ?? `${i.range} ${i.unit}`, kind: 'instrument' })
    }
    return [...out.entries()]
  }, [plant])

  const needle = q.trim().toLowerCase()
  const match = (r: Row) => !needle || r.tag.toLowerCase().includes(needle) || r.label.toLowerCase().includes(needle)

  const pick = (r: Row) => {
    select({ tag: r.tag, kind: r.kind })
    focus(r.tag)
  }

  return (
    <div className="tree">
      <div className="tree-search">
        <input placeholder="Search tags…  (e.g. V-1100, PSV, 10&quot;)" value={q} onChange={(e) => setQ(e.target.value)} spellCheck={false} />
      </div>
      <div className="tree-body">
        {groups.map(([sys, g]) => {
          const sections: [string, Row[]][] = [
            ['Equipment', g.equipment],
            ['Lines', g.lines],
            ['Valves', g.valves],
            ['Instruments', g.instruments],
          ]
          const total = sections.reduce((a, [, r]) => a + r.filter(match).length, 0)
          if (needle && total === 0) return null
          const isOpen = needle ? true : !!open[sys]
          return (
            <div key={sys} className="tree-sys">
              <button className="tree-sys-head" onClick={() => setOpen((o) => ({ ...o, [sys]: !o[sys] }))}>
                <span className={`chev${isOpen ? ' open' : ''}`}>›</span>
                <span>{SYSTEM_LABEL[sys] ?? sys}</span>
                <span className="muted">{total}</span>
              </button>
              {isOpen &&
                sections.map(([name, rows]) => {
                  const r = rows.filter(match)
                  if (!r.length) return null
                  return (
                    <div key={name} className="tree-sec">
                      <div className="tree-sec-head">{name}</div>
                      {r.map((row) => (
                        <button key={row.tag} className={`tree-row${selected === row.tag ? ' is-active' : ''}`} onClick={() => pick(row)} title={row.label}>
                          {row.swatch ? <i className="sw" style={{ background: row.swatch }} /> : <i className={`dot k-${row.kind}`} />}
                          <span className="mono">{row.tag}</span>
                          <span className="muted ell">{row.label}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
      <div className="tree-foot muted">
        {plant.equipment.length} equipment · {plant.lines.length} lines · {plant.valves.length} valves · {plant.instruments.length} instruments
      </div>
    </div>
  )
}
