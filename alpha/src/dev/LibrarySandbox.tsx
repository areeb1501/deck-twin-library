/**
 * Component library browser: /?sandbox=library
 * One component at a time with live parameter controls and labelled nozzles — the same factories
 * the plant builder and PlantSpec compiler use. Valves and instruments are listed too.
 */
import { useEffect, useMemo, useState } from 'react'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { SandboxCanvas } from './SandboxCanvas'
import { LIBRARY_LIST, instantiate, resolveParams } from '../library/components'
import type { ParamDef, Params } from '../library/types'
import type { EquipmentKind, InstrumentType, ValveType } from '../model/types'
import { HorizontalVesselModel } from '../scene/equipment/HorizontalVessel'
import { VerticalVesselModel } from '../scene/equipment/VerticalVessel'
import { ShellTubeModel } from '../scene/equipment/ShellTube'
import { PigTrapModel } from '../scene/equipment/PigTrap'
import { PumpPackageModel } from '../scene/equipment/PumpPackage'
import { CompressorPackageModel } from '../scene/equipment/CompressorPackage'
import { ChemSkidModel } from '../scene/equipment/ChemSkid'
import { ModuleModel } from '../scene/equipment/Module'
import { ManifoldModel } from '../scene/equipment/Manifold'
import { ValveModel } from '../scene/equipment/Valve'
import { InstrumentModel } from '../scene/equipment/Instrument'
import { NPS_SIZES, pipeOD } from '../model/catalog'
import { Num, Row, Sel } from '../ui/builder/fields'
import { VALVE_LABEL } from '../ui/TagTree'
import '../app.css'

const mods = import.meta.glob('../scene/equipment/*.tsx', { eager: true }) as Record<string, Record<string, unknown>>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (name: string) => (Object.values(mods).find((m) => m[name])?.[name] ?? (() => null)) as React.ComponentType<{ eq: any }>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODELS: Record<EquipmentKind, React.ComponentType<{ eq: any }>> = {
  xmasTree: byName('XmasTreeModel'),
  gasTurbineGenerator: byName('GasTurbineGeneratorModel'),
  caissonPump: byName('CaissonPumpModel'),
  transformer: byName('TransformerModel'),
  proxy: () => null,
  horizontalVessel: HorizontalVesselModel,
  verticalVessel: VerticalVesselModel,
  shellTube: ShellTubeModel,
  pigTrap: PigTrapModel,
  pumpPackage: PumpPackageModel,
  compressorPackage: CompressorPackageModel,
  chemSkid: ChemSkidModel,
  module: ModuleModel,
  manifold: ManifoldModel,
}
const VALVES: ValveType[] = ['gate', 'globe', 'ball', 'check', 'butterfly', 'control', 'esdv', 'bdv', 'psv', 'needle']
const FG_TYPES: InstrumentType[] = ['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC']
const INSTRUMENTS: InstrumentType[] = ['PT', 'PI', 'PG', 'TT', 'TG', 'LT', 'LG', 'FT', 'PDT', 'AT', 'FD', 'GD', 'OGD', 'HD', 'SD', 'MAC']

type Pick = { k: 'eq'; kind: EquipmentKind } | { k: 'valve'; t: ValveType } | { k: 'inst'; t: InstrumentType }

export default function LibrarySandbox() {
  const [pick, setPick] = useState<Pick>({ k: 'eq', kind: 'horizontalVessel' })
  const [params, setParams] = useState<Partial<Record<EquipmentKind, Params>>>({})
  const [rot, setRot] = useState(0)
  const [nps, setNps] = useState(6)

  const kind = pick.k === 'eq' ? pick.kind : null
  const p = kind ? resolveParams(kind, params[kind]) : {}
  const eq = useMemo(() => (kind ? instantiate(kind, { tag: 'X-001', at: [0, 0], rotationY: (rot * Math.PI) / 180, params: p }) : null), [kind, JSON.stringify(p), rot]) // eslint-disable-line react-hooks/exhaustive-deps
  const def = kind ? LIBRARY_LIST.find((d) => d.kind === kind)! : null
  const Model = kind ? MODELS[kind] : null
  const cats = [...new Set(LIBRARY_LIST.map((d) => d.category))]
  const span = eq ? Math.max(6, ...eq.nozzles.map((n) => Math.hypot(n.pos[0], n.pos[2]) * 2), 'tt' in eq ? eq.tt + 2 : 0, 'skid' in eq ? eq.skid[0] : 0, 'size' in eq ? eq.size[0] : 0) : 3
  const cam: [number, number, number] = [span * 1.05, span * 0.75, span * 1.35]

  return (
    <div className="app">
      <SandboxCanvas camera={cam} target={[0, 1, 0]}>
        <Fit cam={cam} target={[0, eq ? Math.min(2, eq.position[1]) : 1, 0]} id={pick.k + (kind ?? (pick as { t: string }).t)} />
        {eq && Model && (
          <group position={eq.position} rotation-y={eq.rotationY}>
            <Model eq={eq} />
          </group>
        )}
        {/* a fixed pool of label slots: unmounting drei <Html> mid-render races React's root unmount */}
        {Array.from({ length: 8 }, (_, i) => {
          const n = eq?.nozzles[i]
          return (
            <Html key={i} position={n?.pos ?? [0, -50, 0]} style={{ pointerEvents: 'none', display: n ? 'block' : 'none' }}>
              <div className="noz-chip">{n ? `${n.id} · ${n.name} · ${n.nps}"` : ''}</div>
            </Html>
          )
        })}
        {pick.k === 'valve' && (
          <group position={[0, 1, 0]}>
            <ValveModel type={pick.t} nps={nps} />
          </group>
        )}
        {pick.k === 'inst' && (
          <group position={[0, 1, 0]}>
            <mesh rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[pipeOD(nps) / 2, pipeOD(nps) / 2, 1.6, 24]} />
              <meshStandardMaterial color="#8a8f94" metalness={0.6} roughness={0.4} />
            </mesh>
            {/* fire & gas detectors use the equipment-mount frame (+Y aim, +Z up): stand them upright */}
            <group position={[0, pipeOD(nps) / 2, 0]} rotation-x={FG_TYPES.includes(pick.t) ? -Math.PI / 2 : 0}>
              <InstrumentModel type={pick.t} hostOd={pipeOD(nps)} tag={`${pick.t}-001`} />
            </group>
          </group>
        )}
      </SandboxCanvas>

      <aside className="panel left" style={{ width: 340 }}>
        <header className="brand">
          <div className="brand-title">Component library</div>
          <div className="muted small">Parametric parts used by the plant builder and PlantSpec compiler</div>
        </header>
        <div className="bf-body">
          {cats.map((c) => (
            <div key={c} className="bf-sec">
              <h4>{c}</h4>
              {LIBRARY_LIST.filter((d) => d.category === c).map((d) => (
                <button key={d.kind} className={`tree-row ${kind === d.kind ? 'is-active' : ''}`} onClick={() => setPick({ k: 'eq', kind: d.kind })}>
                  <span className="dot" />
                  <span className="mono">{d.tagPrefix}</span>
                  <span className="ell">{d.label}</span>
                </button>
              ))}
            </div>
          ))}
          <div className="bf-sec">
            <h4>In-line valves</h4>
            {VALVES.map((t) => (
              <button key={t} className={`tree-row ${pick.k === 'valve' && pick.t === t ? 'is-active' : ''}`} onClick={() => setPick({ k: 'valve', t })}>
                <span className="dot k-valve" />
                <span className="mono">{t}</span>
                <span className="ell">{VALVE_LABEL[t]}</span>
              </button>
            ))}
          </div>
          <div className="bf-sec">
            <h4>Instruments</h4>
            {INSTRUMENTS.map((t) => (
              <button key={t} className={`tree-row ${pick.k === 'inst' && pick.t === t ? 'is-active' : ''}`} onClick={() => setPick({ k: 'inst', t })}>
                <span className="dot k-instrument" />
                <span className="mono">{t}</span>
                <span />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <aside className="panel inspector" style={{ top: 12 }}>
        <div className="insp-head">
          <div>
            <div className="insp-tag">{def ? def.label : pick.k === 'valve' ? VALVE_LABEL[pick.t] : `${(pick as { t: string }).t} instrument`}</div>
            {def && <div className="muted small">type: <span className="mono">{def.kind}</span> · tag prefix {def.tagPrefix}</div>}
          </div>
        </div>
        <div className="insp-body bf-editor">
          {def && <div className="muted small bf-blurb">{def.blurb}</div>}
          {def && (
            <>
              <Row label="Rotation"><Sel value={rot} options={[0, 90, 180, 270].map((r) => ({ value: r, label: `${r}°` }))} onChange={setRot} /></Row>
              <div className="bf-subhead">Parameters</div>
              {def.params.filter((pd) => !pd.when || pd.when(p)).map((pd) => (
                <ParamRow key={pd.key} def={pd} value={p[pd.key]} onChange={(v) => setParams((s) => ({ ...s, [kind!]: { ...s[kind!], [pd.key]: v } }))} />
              ))}
              <div className="bf-actions"><button onClick={() => setParams((s) => ({ ...s, [kind!]: {} }))}>Reset to defaults</button></div>
              <div className="bf-subhead">Nozzles (equipment-local ids)</div>
              <table className="bf-noz">
                <tbody>
                  {eq!.nozzles.map((n) => (
                    <tr key={n.id}>
                      <td className="mono">{n.id}</td>
                      <td>{n.name}</td>
                      <td className="r muted small">{n.nps}" · {n.rating}#</td>
                    </tr>
                  ))}
                  {!eq!.nozzles.length && <tr><td colSpan={3} className="muted">No process nozzles</td></tr>}
                </tbody>
              </table>
              <div className="bf-subhead">PlantSpec snippet</div>
              <pre className="mono small bf-pre">{JSON.stringify({ tag: `${def.tagPrefix}-101`, type: def.kind, params: params[kind!] ?? {} }, null, 1)}</pre>
            </>
          )}
          {!def && (
            <Row label="Size"><Sel value={nps} options={NPS_SIZES.filter((x) => x >= 1 && x <= 16).map((x) => ({ value: x, label: `${x}"` }))} onChange={setNps} /></Row>
          )}
          {pick.k === 'valve' && <div className="muted small">Placed on a line in a PlantSpec with <span className="mono">{`{ type: '${pick.t}', line, at }`}</span>. Face-to-face length follows ASME B16.10.</div>}
          {pick.k === 'inst' && <div className="muted small">Placed on a line in a PlantSpec with <span className="mono">{`{ type: '${pick.t}', on: { line, at } }`}</span>.</div>}
        </div>
      </aside>
    </div>
  )
}

/** re-aim the camera when the component changes (remounting the canvas would orphan the Html labels) */
function Fit({ cam, target, id }: { cam: [number, number, number]; target: [number, number, number]; id: string }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (...v: number[]) => void }; update: () => void } | null
  useEffect(() => {
    camera.position.set(...cam)
    controls?.target.set(...target)
    controls?.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, controls])
  return null
}

function ParamRow({ def, value, onChange }: { def: ParamDef; value: unknown; onChange: (v: number | string | boolean) => void }) {
  let ctl: React.ReactNode
  if (def.type === 'bool') ctl = <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
  else if (def.type === 'select') ctl = <Sel value={value as string | number} options={def.options!} onChange={onChange} />
  else ctl = <Num value={Number(value)} min={def.min} max={def.max} step={def.type === 'int' ? 1 : def.step} unit={def.unit} onCommit={(v) => v !== undefined && onChange(def.type === 'int' ? Math.round(v) : v)} />
  return <Row label={def.label}>{ctl}</Row>
}
