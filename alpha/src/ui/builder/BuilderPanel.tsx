/**
 * Plant builder: edits a PlantSpec (library/spec.ts) — equipment from the component library,
 * nozzle-to-nozzle lines, inline valves and instruments. Every edit recompiles and the viewer
 * shows the result live. Selection is shared with the 3D view.
 */
import { useEffect, useRef, useState } from 'react'
import { useSpecStore, frameBuilderPlant } from '../../state/specStore'
import { useStore } from '../../state/store'
import { LIBRARY_LIST, componentDef, resolveParams } from '../../library/components'
import type { ParamDef } from '../../library/types'
import { NPS_SIZES, SERVICE } from '../../model/catalog'
import type { Equipment, InstrumentType, PipeLine, Service } from '../../model/types'
import { classFor, emptySpec, lineTag, type EndSpec, type EquipmentSpec, type InstrumentSpec, type LineSpec, type PlantSpec, type ValveSpec } from '../../library/spec'
import { separationTrainSpec } from '../../library/examples/separationTrain'
import { VALVE_LABEL } from '../TagTree'
import { Num, Row, Sel, Slider, Txt } from './fields'
import {
  download, encodeEnd, findNozzle, nextLineSeq, nextTag, nozzleOptions, removeEquipment, removeLine, renameEquipment, renameLine, slug, VALVE_PREFIX,
} from './util'

const SERVICES = (Object.keys(SERVICE) as Service[]).map((s) => ({ value: s, label: `${SERVICE[s].code} · ${SERVICE[s].label}` }))
const NPS_OPTS = NPS_SIZES.filter((x) => x >= 1).map((x) => ({ value: x, label: `${x}"` }))
const ROTATIONS = [0, 90, 180, 270].map((r) => ({ value: r, label: `${r}°` }))
const VALVE_TYPES = (Object.keys(VALVE_PREFIX) as ValveSpec['type'][]).map((t) => ({ value: t, label: VALVE_LABEL[t] ?? t }))
const LINE_INSTRUMENTS: InstrumentType[] = ['PT', 'PI', 'PG', 'TT', 'TG', 'FT', 'PDT', 'AT']
const INSTRUMENT_LABEL: Record<string, string> = {
  PT: 'Pressure transmitter', PI: 'Pressure indicator', PG: 'Pressure gauge', TT: 'Temperature transmitter', TG: 'Temperature gauge',
  FT: 'Flow transmitter (orifice)', PDT: 'Differential pressure', AT: 'Analyser', LT: 'Level transmitter', LG: 'Level gauge',
}

/** guess a line's service from the nozzle it starts at */
function guessService(name = ''): Service {
  const n = name.toLowerCase()
  if (n.includes('psv') || n.includes('relief')) return 'flare'
  if (n.includes('gas')) return 'gas'
  if (n.includes('water')) return 'water'
  if (n.includes('channel')) return 'cooling'
  if (n.includes('injection')) return 'chemical'
  if (n.includes('drain')) return 'drain'
  if (n.includes('oil') || n.includes('liquid') || n.includes('discharge') || n.includes('shell')) return 'oil'
  return 'multiphase'
}

export function BuilderPanel() {
  const edit = useSpecStore((s) => s.edit)
  const undo = useSpecStore((s) => s.undo)
  const redo = useSpecStore((s) => s.redo)
  const [connectFrom, setConnectFrom] = useState<{ end: EndSpec; nonce: number } | null>(null)
  const linesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="builder">
      <Header />
      <div className="bf-body">
        <Problems />
        <Section title="Add from library">
          <Palette onAdd={(e) => edit((d) => void d.equipment.push(e))} />
        </Section>
        <EquipmentSection
          onConnect={(end) => {
            setConnectFrom({ end, nonce: Math.random() })
            setTimeout(() => linesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30)
          }}
        />
        <div ref={linesRef}>
          <LinesSection connectFrom={connectFrom} />
        </div>
        <ValvesSection />
        <InstrumentsSection />
      </div>
    </div>
  )
}

function Section({ title, children, extra }: { title: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="bf-sec">
      <h4>
        <span>{title}</span>
        {extra}
      </h4>
      {children}
    </section>
  )
}

// ------------------------------------------------------------------ header
function Header() {
  const spec = useSpecStore((s) => s.spec)
  const result = useSpecStore((s) => s.result)
  const canUndo = useSpecStore((s) => s.past.length > 0)
  const canRedo = useSpecStore((s) => s.future.length > 0)
  const { edit, load, undo, redo } = useSpecStore.getState()
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  const onFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text()) as PlantSpec
      if (!Array.isArray(j.equipment) || !Array.isArray(j.lines)) throw new Error('not a PlantSpec (needs "equipment" and "lines" arrays)')
      load({ version: 1, name: j.name ?? f.name, source: j.source, equipment: j.equipment, lines: j.lines, valves: j.valves ?? [], instruments: j.instruments ?? [] })
      setErr(null)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  return (
    <header className="brand">
      <input className="bf-title" value={spec.name} onChange={(e) => edit((d) => void (d.name = e.target.value))} />
      <div className="muted small">
        {spec.equipment.length} equipment · {spec.lines.length} lines · {spec.valves.length} valves · {spec.instruments.length} instruments
        {result.plant && ` · ${result.plant.deck.extent.maxX - result.plant.deck.extent.minX} × ${result.plant.deck.extent.maxZ - result.plant.deck.extent.minZ} m plot`}
      </div>
      <div className="plant-menu">
        <button onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
        <button onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">↷</button>
        <button onClick={() => frameBuilderPlant()} title="Fit the plot in view">Frame</button>
        <button onClick={() => load(emptySpec())} title="Start an empty plant">New</button>
        <button onClick={() => load(structuredClone(separationTrainSpec))} title="Load the example separation train">Example</button>
      </div>
      <div className="plant-menu">
        <button onClick={() => file.current?.click()} title="Load a PlantSpec JSON (e.g. produced from a P&ID)">Import spec…</button>
        <button onClick={() => download(`${slug(spec.name)}.spec.json`, spec)} title="Download the editable PlantSpec">Export spec</button>
        <button onClick={() => download(`${slug(spec.name)}.plant.json`, result.plant)} title="Download the compiled plant (viewer format, Load… in the viewer)">Export plant</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {err && <div className="plant-err">{err}</div>}
    </header>
  )
}

function Problems() {
  const r = useSpecStore((s) => s.result)
  const [open, setOpen] = useState(true)
  const n = r.errors.length + r.warnings.length + (r.buildError ? 1 : 0)
  if (!n) return <div className="bf-ok small">✓ Compiles cleanly</div>
  return (
    <div className="bf-problems">
      <button className="bf-prob-head" onClick={() => setOpen(!open)}>
        <span className={`chev ${open ? 'open' : ''}`}>›</span>
        {r.errors.length + (r.buildError ? 1 : 0)} errors · {r.warnings.length} warnings
      </button>
      {open && (
        <ul>
          {r.buildError && <li className="err">Piping engine: {r.buildError} (viewer shows the last good build)</li>}
          {r.errors.map((m) => <li key={m} className="err">{m}</li>)}
          {r.warnings.map((m) => <li key={m} className="warn">{m}</li>)}
        </ul>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ palette
function Palette({ onAdd }: { onAdd: (e: EquipmentSpec) => void }) {
  const spec = useSpecStore((s) => s.spec)
  const cats = [...new Set(LIBRARY_LIST.map((d) => d.category))]
  return (
    <div className="bf-palette">
      {cats.map((c) => (
        <div key={c}>
          <div className="tree-sec-head">{c}</div>
          <div className="quick">
            {LIBRARY_LIST.filter((d) => d.category === c).map((d) => (
              <button
                key={d.kind}
                title={d.blurb}
                onClick={() => {
                  const tag = nextTag(d.tagPrefix, spec)
                  onAdd({ tag, type: d.kind, name: d.label })
                  useStore.getState().select({ tag, kind: 'equipment' })
                  setTimeout(() => useStore.getState().requestFocus(tag), 150)
                }}
              >
                + {d.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ equipment
function useOpenFromSelection(kind: string) {
  const sel = useStore((s) => s.selected)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => {
    if (sel?.kind === kind) setOpen(sel.tag)
  }, [sel, kind])
  return [open, setOpen] as const
}

function pick(tag: string, kind: 'equipment' | 'line' | 'valve' | 'instrument') {
  const s = useStore.getState()
  s.select({ tag, kind })
  s.requestFocus(tag)
}

function EquipmentSection({ onConnect }: { onConnect: (end: EndSpec) => void }) {
  const spec = useSpecStore((s) => s.spec)
  const plant = useSpecStore((s) => s.result.plant)
  const edit = useSpecStore((s) => s.edit)
  const [open, setOpen] = useOpenFromSelection('equipment')
  const auto = spec.equipment.filter((e) => !e.at).length
  return (
    <Section
      title={`Equipment · ${spec.equipment.length}`}
      extra={
        <span className="bf-h-actions">
          {auto > 0 && (
            <button
              title="Pin every auto-placed item at its current position so later edits don't move it"
              onClick={() => edit((d) => d.equipment.forEach((e) => {
                const c = plant.equipment.find((x) => x.tag === e.tag)
                if (!e.at && c) e.at = [c.position[0], c.position[2]]
              }))}
            >
              Freeze layout
            </button>
          )}
          {spec.equipment.length > 0 && auto < spec.equipment.length && (
            <button title="Let the compiler place everything in flow order" onClick={() => edit((d) => d.equipment.forEach((e) => delete e.at))}>
              Auto layout
            </button>
          )}
        </span>
      }
    >
      {!spec.equipment.length && <div className="muted small bf-empty">Add equipment from the library above.</div>}
      {spec.equipment.map((e) => {
        const c = plant.equipment.find((x) => x.tag === e.tag)
        const isOpen = open === e.tag
        return (
          <div key={e.tag} className={`bf-item ${isOpen ? 'open' : ''}`}>
            <button className="tree-row bf-item-head" onClick={() => { setOpen(isOpen ? null : e.tag); pick(e.tag, 'equipment') }}>
              <span className={`chev ${isOpen ? 'open' : ''}`}>›</span>
              <span className="mono">{e.tag}</span>
              <span className="muted ell">{e.name ?? componentDef(e.type).label}</span>
            </button>
            {isOpen && <EquipmentEditor e={e} compiled={c} onConnect={onConnect} />}
          </div>
        )
      })}
    </Section>
  )
}

function EquipmentEditor({ e, compiled, onConnect }: { e: EquipmentSpec; compiled?: Equipment; onConnect: (end: EndSpec) => void }) {
  const spec = useSpecStore((s) => s.spec)
  const edit = useSpecStore((s) => s.edit)
  const def = componentDef(e.type)
  const p = resolveParams(e.type, e.params)
  const upd = (fn: (x: EquipmentSpec, d: PlantSpec) => void) => edit((d) => { const x = d.equipment.find((y) => y.tag === e.tag); if (x) fn(x, d) })
  const pos = compiled ? [compiled.position[0], compiled.position[2]] : [0, 0]
  const usedBy = (nz: string) =>
    spec.lines.find((l) => [l.from, l.to].some((end) => 'equipment' in end && end.equipment === e.tag && end.nozzle === nz))?.tag ??
    spec.instruments.find((i) => 'equipment' in i.on && i.on.equipment === e.tag && i.on.nozzle === nz)?.tag

  return (
    <div className="bf-editor">
      <div className="muted small bf-blurb">{def.label} - {def.blurb}</div>
      <Row label="Tag"><Txt mono value={e.tag} onCommit={(v) => v && !spec.equipment.some((x) => x.tag === v) && edit((d) => renameEquipment(d, e.tag, v))} /></Row>
      <Row label="Name"><Txt value={e.name ?? ''} placeholder={def.label} onCommit={(v) => upd((x) => void (x.name = v || undefined))} /></Row>
      <Row label="Position" hint="Auto: the compiler places it in flow order. Uncheck to pin it.">
        <label className="check">
          <input type="checkbox" checked={!e.at} onChange={(ev) => upd((x) => void (ev.target.checked ? delete x.at : (x.at = [pos[0], pos[1]])))} />
          auto layout
        </label>
      </Row>
      {e.at ? (
        <>
          <Row label="X (east)"><Num value={e.at[0]} step={0.5} unit="m" onCommit={(v) => upd((x) => void (x.at = [v ?? 0, x.at![1]]))} /></Row>
          <Row label="Z (south)"><Num value={e.at[1]} step={0.5} unit="m" onCommit={(v) => upd((x) => void (x.at = [x.at![0], v ?? 0]))} /></Row>
        </>
      ) : (
        <Row label="Placed at"><span className="muted mono small">x {pos[0].toFixed(1)} · z {pos[1].toFixed(1)} m</span></Row>
      )}
      <Row label="Rotation"><Sel value={((e.rotation ?? 0) % 360 + 360) % 360} options={ROTATIONS} onChange={(v) => upd((x) => void (x.rotation = v))} /></Row>
      <div className="bf-subhead">Parameters</div>
      {def.params.filter((pd) => !pd.when || pd.when(p)).map((pd) => (
        <ParamField key={pd.key} def={pd} value={p[pd.key]} onChange={(v) => upd((x) => void (x.params = { ...x.params, [pd.key]: v }))} />
      ))}
      {compiled && compiled.nozzles.length > 0 && (
        <>
          <div className="bf-subhead">Nozzles</div>
          <table className="bf-noz">
            <tbody>
              {compiled.nozzles.map((n) => {
                const u = usedBy(n.id)
                return (
                  <tr key={n.id}>
                    <td className="mono">{n.id}</td>
                    <td>{n.name}<div className="muted small">{n.nps}" · Class {n.rating}</div></td>
                    <td className="r">
                      {u ? <span className="muted small mono ell" title={u}>{u}</span> : (
                        <button className="bf-mini" onClick={() => onConnect({ equipment: e.tag, nozzle: n.id })} title="Start a new line from this nozzle">Connect →</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
      <div className="bf-actions">
        <button onClick={() => edit((d) => {
          const tag = nextTag(def.tagPrefix, d)
          const at: [number, number] | undefined = e.at ? [e.at[0], e.at[1] + 4] : undefined
          d.equipment.push({ ...structuredClone(e), tag, at })
        })}>Duplicate</button>
        <button className="danger" onClick={() => edit((d) => removeEquipment(d, e.tag))}>Delete (and its lines)</button>
      </div>
    </div>
  )
}

function ParamField({ def, value, onChange }: { def: ParamDef; value: unknown; onChange: (v: number | string | boolean) => void }) {
  let ctl: React.ReactNode
  if (def.type === 'bool') ctl = <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
  else if (def.type === 'select') ctl = <Sel value={value as string | number} options={def.options!} onChange={onChange} />
  else ctl = <Num value={Number(value)} min={def.min} max={def.max} step={def.type === 'int' ? 1 : def.step} unit={def.unit} onCommit={(v) => v !== undefined && onChange(def.type === 'int' ? Math.round(v) : v)} />
  return <Row label={def.label}>{ctl}</Row>
}

// ------------------------------------------------------------------ lines
function EndPicker({ value, onChange, options }: { value: EndSpec; onChange: (e: EndSpec) => void; options: { value: string; label: string }[] }) {
  const enc = encodeEnd(value)
  return (
    <span className="bf-end">
      <Sel
        value={enc}
        options={[{ value: 'off', label: 'Off-plant (edge of plot)…' }, ...options]}
        onChange={(v) => {
          if (v === 'off') return onChange({ offPlant: 'off' in value ? '' : 'Off-plant' })
          const [tag, nz] = v.slice(3).split('/')
          onChange({ equipment: tag, nozzle: nz })
        }}
      />
      {'offPlant' in value && <Txt value={value.offPlant} placeholder="Destination, e.g. Flare header" onCommit={(v) => onChange({ ...value, offPlant: v || 'Off-plant' })} />}
    </span>
  )
}

function LinesSection({ connectFrom }: { connectFrom: { end: EndSpec; nonce: number } | null }) {
  const spec = useSpecStore((s) => s.spec)
  const plant = useSpecStore((s) => s.result.plant)
  const edit = useSpecStore((s) => s.edit)
  const [open, setOpen] = useOpenFromSelection('line')
  const opts = nozzleOptions(plant)
  const [from, setFrom] = useState<EndSpec>({ offPlant: 'Off-plant' })
  const [to, setTo] = useState<EndSpec>({ offPlant: 'Off-plant' })
  const [service, setService] = useState<Service>('oil')

  useEffect(() => {
    if (!connectFrom) return
    setFrom(connectFrom.end)
    setService(guessService(findNozzle(plant, connectFrom.end)?.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectFrom])

  const add = () => {
    const na = findNozzle(plant, from)
    const nb = findNozzle(plant, to)
    if (!na && !nb) return
    const nps = na?.nps ?? nb!.nps
    const rating = Math.max(na?.rating ?? 0, nb?.rating ?? 0) || 300
    const tag = lineTag(nps, service, nextLineSeq(spec), classFor(rating))
    edit((d) => void d.lines.push({ tag, service, from, to }))
    setOpen(tag)
    setFrom({ offPlant: 'Off-plant' })
    setTo({ offPlant: 'Off-plant' })
  }
  const bothOff = !('equipment' in from) && !('equipment' in to)

  return (
    <Section title={`Lines · ${spec.lines.length}`}>
      <div className="bf-new">
        <Row label="From"><EndPicker value={from} onChange={(e) => { setFrom(e); setService(guessService(findNozzle(plant, e)?.name)) }} options={opts} /></Row>
        <Row label="To"><EndPicker value={to} onChange={setTo} options={opts} /></Row>
        <Row label="Service"><Sel value={service} options={SERVICES} onChange={setService} /></Row>
        <div className="bf-actions">
          <button className="primary" disabled={bothOff} onClick={add} title={bothOff ? 'Pick at least one equipment nozzle' : 'Route a new line'}>Add line</button>
        </div>
      </div>
      {spec.lines.map((l) => {
        const isOpen = open === l.tag
        const built = plant.lines.find((x) => x.tag === l.tag)
        return (
          <div key={l.tag} className={`bf-item ${isOpen ? 'open' : ''}`}>
            <button className="tree-row bf-item-head" onClick={() => { setOpen(isOpen ? null : l.tag); if (built) pick(l.tag, 'line') }}>
              <span className={`chev ${isOpen ? 'open' : ''}`}>›</span>
              <span className="sw" style={{ background: SERVICE[l.service].flow }} />
              <span className="mono ell">{l.tag}</span>
            </button>
            {isOpen && <LineEditor l={l} built={built} opts={opts} />}
          </div>
        )
      })}
    </Section>
  )
}

function LineEditor({ l, built, opts }: { l: LineSpec; built?: PipeLine; opts: { value: string; label: string }[] }) {
  const spec = useSpecStore((s) => s.spec)
  const edit = useSpecStore((s) => s.edit)
  const upd = (fn: (x: LineSpec) => void) => edit((d) => { const x = d.lines.find((y) => y.tag === l.tag); if (x) fn(x) })
  const seq = l.tag.split('-')[2] ?? String(nextLineSeq(spec))
  const regen = built ? lineTag(built.nps, l.service, seq, built.spec, l.insulation) : undefined
  return (
    <div className="bf-editor">
      <Row label="Line no."><Txt mono value={l.tag} onCommit={(v) => v && !spec.lines.some((x) => x.tag === v) && edit((d) => renameLine(d, l.tag, v))} /></Row>
      {regen && regen !== l.tag && !spec.lines.some((x) => x.tag === regen) && (
        <Row label=""><button className="bf-mini" onClick={() => edit((d) => renameLine(d, l.tag, regen))}>Renumber → {regen}</button></Row>
      )}
      <Row label="From"><EndPicker value={l.from} onChange={(e) => upd((x) => void (x.from = e))} options={opts} /></Row>
      <Row label="To"><EndPicker value={l.to} onChange={(e) => upd((x) => void (x.to = e))} options={opts} /></Row>
      <Row label="Service"><Sel value={l.service} options={SERVICES} onChange={(v) => upd((x) => void (x.service = v))} /></Row>
      <Row label="Size"><Sel value={l.nps ?? 0} options={[{ value: 0, label: `Auto (${built?.nps ?? '?'}")` }, ...NPS_OPTS]} onChange={(v) => upd((x) => void (v ? (x.nps = v) : delete x.nps))} /></Row>
      <Row label="Insulation">
        <Sel value={l.insulation ?? 'N'} options={[{ value: 'N', label: 'None' }, { value: 'H', label: 'H · heat conservation' }, { value: 'P', label: 'P · personnel protection' }, { value: 'C', label: 'C · cold' }]}
          onChange={(v) => upd((x) => void (v === 'N' ? delete x.insulation : (x.insulation = v as LineSpec['insulation'])))} />
      </Row>
      <Row label="Run elevation" hint="Height of the horizontal run above grade. Empty = automatic.">
        <Num value={l.elevation} optional placeholder="auto" step={0.1} min={0.3} max={20} unit="m" onCommit={(v) => upd((x) => void (v === undefined ? delete x.elevation : (x.elevation = v)))} />
      </Row>
      <Row label="Run order"><Sel value={l.order ?? 'xz'} options={[{ value: 'xz', label: 'East–west first' }, { value: 'zx', label: 'North–south first' }]} onChange={(v) => upd((x) => void (x.order = v))} /></Row>
      {built && <Row label="Class / sch."><span className="muted mono small">{built.spec} · Sch {built.schedule} · {built.route.length - 1} legs</span></Row>}
      <div className="bf-actions">
        <button className="danger" onClick={() => edit((d) => removeLine(d, l.tag))}>Delete line</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ valves & instruments
function ValvesSection() {
  const spec = useSpecStore((s) => s.spec)
  const edit = useSpecStore((s) => s.edit)
  const [open, setOpen] = useOpenFromSelection('valve')
  const lineOpts = spec.lines.map((l) => ({ value: l.tag, label: l.tag }))
  const [line, setLine] = useState('')
  const [type, setType] = useState<ValveSpec['type']>('gate')
  const target = spec.lines.some((l) => l.tag === line) ? line : spec.lines[0]?.tag
  return (
    <Section title={`Valves · ${spec.valves.length}`}>
      {spec.lines.length ? (
        <div className="bf-new">
          <Row label="On line"><Sel value={target ?? ''} options={lineOpts} onChange={setLine} /></Row>
          <Row label="Type"><Sel value={type} options={VALVE_TYPES} onChange={setType} /></Row>
          <div className="bf-actions">
            <button className="primary" onClick={() => {
              const tag = nextTag(VALVE_PREFIX[type], spec)
              edit((d) => void d.valves.push({ tag, type, line: target!, at: 0.5, failAction: type === 'esdv' || type === 'control' ? 'FC' : undefined }))
              setOpen(tag)
            }}>Add valve</button>
          </div>
        </div>
      ) : <div className="muted small bf-empty">Add a line first.</div>}
      {spec.valves.map((v) => {
        const isOpen = open === v.tag
        const upd = (fn: (x: ValveSpec) => void) => edit((d) => { const x = d.valves.find((y) => y.tag === v.tag); if (x) fn(x) })
        return (
          <div key={v.tag} className={`bf-item ${isOpen ? 'open' : ''}`}>
            <button className="tree-row bf-item-head" onClick={() => { setOpen(isOpen ? null : v.tag); pick(v.tag, 'valve') }}>
              <span className={`chev ${isOpen ? 'open' : ''}`}>›</span>
              <span className="mono">{v.tag}</span>
              <span className="muted ell">{VALVE_LABEL[v.type]}</span>
            </button>
            {isOpen && (
              <div className="bf-editor">
                <Row label="Tag"><Txt mono value={v.tag} onCommit={(t) => t && upd((x) => void (x.tag = t))} /></Row>
                <Row label="Type"><Sel value={v.type} options={VALVE_TYPES} onChange={(t) => upd((x) => void (x.type = t))} /></Row>
                <Row label="Line"><Sel value={v.line} options={lineOpts} onChange={(t) => upd((x) => void (x.line = t))} /></Row>
                <Row label="Along line"><Slider value={v.at ?? 0.5} onCommit={(t) => upd((x) => void (x.at = t))} /></Row>
                <Row label="Normally"><Sel value={v.normally ?? 'open'} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }]} onChange={(t) => upd((x) => void (x.normally = t))} /></Row>
                <div className="bf-actions"><button className="danger" onClick={() => edit((d) => void (d.valves = d.valves.filter((x) => x.tag !== v.tag)))}>Delete valve</button></div>
              </div>
            )}
          </div>
        )
      })}
    </Section>
  )
}

function InstrumentsSection() {
  const spec = useSpecStore((s) => s.spec)
  const edit = useSpecStore((s) => s.edit)
  const [open, setOpen] = useOpenFromSelection('instrument')
  const lineOpts = spec.lines.map((l) => ({ value: l.tag, label: l.tag }))
  const [line, setLine] = useState('')
  const [type, setType] = useState<InstrumentType>('PT')
  const target = spec.lines.some((l) => l.tag === line) ? line : spec.lines[0]?.tag
  const typeOpts = LINE_INSTRUMENTS.map((t) => ({ value: t, label: `${t} · ${INSTRUMENT_LABEL[t]}` }))
  return (
    <Section title={`Instruments · ${spec.instruments.length}`}>
      {spec.lines.length ? (
        <div className="bf-new">
          <Row label="On line"><Sel value={target ?? ''} options={lineOpts} onChange={setLine} /></Row>
          <Row label="Type"><Sel value={type} options={typeOpts} onChange={setType} /></Row>
          <div className="bf-actions">
            <button className="primary" onClick={() => {
              const tag = nextTag(type, spec)
              edit((d) => void d.instruments.push({ tag, type, on: { line: target!, at: 0.3 } }))
              setOpen(tag)
            }}>Add instrument</button>
          </div>
        </div>
      ) : <div className="muted small bf-empty">Add a line first.</div>}
      {spec.instruments.map((i) => {
        const isOpen = open === i.tag
        const upd = (fn: (x: InstrumentSpec) => void) => edit((d) => { const x = d.instruments.find((y) => y.tag === i.tag); if (x) fn(x) })
        return (
          <div key={i.tag} className={`bf-item ${isOpen ? 'open' : ''}`}>
            <button className="tree-row bf-item-head" onClick={() => { setOpen(isOpen ? null : i.tag); pick(i.tag, 'instrument') }}>
              <span className={`chev ${isOpen ? 'open' : ''}`}>›</span>
              <span className="mono">{i.tag}</span>
              <span className="muted ell">{INSTRUMENT_LABEL[i.type] ?? i.type}</span>
            </button>
            {isOpen && (
              <div className="bf-editor">
                <Row label="Tag"><Txt mono value={i.tag} onCommit={(t) => t && upd((x) => void (x.tag = t))} /></Row>
                {'line' in i.on ? (
                  <>
                    <Row label="Line"><Sel value={i.on.line} options={lineOpts} onChange={(t) => upd((x) => void (x.on = { line: t, at: 'line' in x.on ? x.on.at : 0.3 }))} /></Row>
                    <Row label="Along line"><Slider value={i.on.at ?? 0.3} onCommit={(t) => upd((x) => void ('line' in x.on && (x.on.at = t)))} /></Row>
                  </>
                ) : (
                  <Row label="On nozzle"><span className="mono small">{i.on.equipment}/{i.on.nozzle}</span></Row>
                )}
                <Row label="Range"><Txt value={i.range ?? ''} placeholder="default" onCommit={(t) => upd((x) => void (x.range = t || undefined))} /></Row>
                <Row label="Unit"><Txt value={i.unit ?? ''} placeholder="default" onCommit={(t) => upd((x) => void (x.unit = t || undefined))} /></Row>
                <Row label="Nominal"><Num value={i.nominal} optional placeholder="default" onCommit={(t) => upd((x) => void (t === undefined ? delete x.nominal : (x.nominal = t)))} /></Row>
                <div className="bf-actions"><button className="danger" onClick={() => edit((d) => void (d.instruments = d.instruments.filter((x) => x.tag !== i.tag)))}>Delete instrument</button></div>
              </div>
            )}
          </div>
        )
      })}
    </Section>
  )
}
