/**
 * Process: SVG mimics of Alpha (wells → manifold → HP / LP separation → export pumps → oil export;
 * gas → scrubber → K-2200 with anti-surge recycle → gas export; blowdown and relief → flare;
 * produced water; utilities) and of WHP-N. Live values from `process` / `result`; ESD / blowdown
 * valve positions from `valves[tag].pos`. Click a machine, a valve or a vessel for its faceplate.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { usePlant } from '../../state/plantStore'
import { fmtClock, type Alarm, type AlarmPriority, type RunState } from '../../sim/types'
import type { Plant, Valve } from '../../model/types'
import { EMPTY_ARR, call, fmt, resetMachine, runOf, sim, startMachine, stopMachine, useS } from './simApi'
import { RunPill, Msg } from './common'
import { pickOf, showIn3D } from './nav'
import { goToMachine } from '../fieldOps'

type Sel = { kind: 'machine' | 'valve' | 'vessel'; tag: string } | null
type Pick = (s: Sel) => void

/** highest-priority standing alarm per tag (for the alarm marks on the mimic) */
function useAlarmMarks() {
  const alarms = useS((s) => s.alarms) ?? EMPTY_ARR
  return useMemo(() => {
    const m = new Map<string, AlarmPriority>()
    for (const a of alarms as Alarm[]) if (a.active && a.state !== 'shelved' && (m.get(a.tag) ?? 9) > a.priority) m.set(a.tag, a.priority)
    return m
  }, [alarms])
}

export function Process() {
  const plant = usePlant()
  const [sel, setSel] = useState<Sel>(null)
  const alpha = plant.deck.site === 'offshoreAlpha' && plant.equipment.some((e) => e.tag === 'V-1100')
  const marks = useAlarmMarks()
  return (
    <div className="h-proc">
      <div className="h-grid">
        {alpha ? (
          <>
            <AlphaMimic plant={plant} pick={setSel} sel={sel} marks={marks} />
            <WhpMimic plant={plant} pick={setSel} sel={sel} marks={marks} />
          </>
        ) : (
          <div className="h-placeholder">No process mimic for {plant.name}: the mimics are drawn for the Alpha field. Use the Machines page for the equipment.</div>
        )}
        <OtherValves plant={plant} pick={setSel} sel={sel} />
      </div>
      <Faceplate sel={sel} close={() => setSel(null)} />
    </div>
  )
}

// ------------------------------------------------------------------ symbols

function Mark({ x, y, p }: { x: number; y: number; p: AlarmPriority | undefined }) {
  if (!p) return null
  if (p === 1) return <path className="alm" d={`M${x},${y - 6} L${x + 6},${y + 5} L${x - 6},${y + 5} Z`} />
  if (p === 2) return <path className="alm2" d={`M${x},${y - 6} L${x + 6},${y} L${x},${y + 6} L${x - 6},${y} Z`} />
  return <rect className="alm3" x={x - 5} y={y - 5} width={10} height={10} />
}

const RS_TXT: Record<RunState, string> = { running: 'RUN', starting: 'STRT', standby: 'STBY', stopped: 'STOP', tripped: 'TRIP' }

function Mach({ tag, x, y, r = 15, pick, sel, marks, label = 'below' }: { tag: string; x: number; y: number; r?: number; pick: Pick; sel: Sel; marks: Map<string, AlarmPriority>; label?: 'below' | 'right' | 'left' }) {
  useS((s) => s.status?.[tag])
  useS((s) => s.machines?.[tag])
  useS((s) => s.t)
  const st = runOf(sim(), tag)
  const on = sel?.tag === tag
  return (
    <g className="click" onClick={() => pick({ kind: 'machine', tag })} data-tag={tag}>
      <title>{`${tag}: ${st}`}</title>
      <circle cx={x} cy={y} r={r} className={`mach ${st}`} style={on ? { stroke: '#fff', strokeWidth: 2.5 } : undefined} />
      <text x={x} y={y + 3} className={`machtxt ${st === 'running' ? '' : st === 'tripped' ? 'trip' : 'off'}`}>
        {RS_TXT[st]}
      </text>
      {label === 'below' ? (
        <text className="tag" x={x} y={y + r + 12} textAnchor="middle">
          {tag}
        </text>
      ) : (
        <text className="tag" x={label === 'right' ? x + r + 5 : x - r - 5} y={y + 4} textAnchor={label === 'right' ? 'start' : 'end'}>
          {tag}
        </text>
      )}
      <Mark x={x + r} y={y - r} p={marks.get(tag)} />
    </g>
  )
}

/** valve travel → symbol state */
function valveLook(v: { pos?: number; cmd?: string; fault?: string } | undefined, normally: 'open' | 'closed') {
  const pos = typeof v?.pos === 'number' ? v.pos : normally === 'open' ? 1 : 0
  const state = v?.fault === 'stuck' ? 'stuck' : pos <= 0.02 ? 'closed' : pos >= 0.98 ? 'open' : 'moving'
  const end = state === 'closed' ? 'closed' : state === 'open' ? 'open' : null
  const offnorm = end !== null && end !== normally
  return { pos, state, offnorm }
}

function ValveSym({ tag, x, y, vertical, pick, sel, marks, plant, labelSide = 'below' }: { tag: string; x: number; y: number; vertical?: boolean; pick: Pick; sel: Sel; marks: Map<string, AlarmPriority>; plant: Plant; labelSide?: 'below' | 'above' | 'right' | 'left' }) {
  const v = useS((s) => s.valves?.[tag])
  const def = plant.valves.find((x) => x.tag === tag)
  if (!def) return null
  const { pos, state, offnorm } = valveLook(v, def.normally)
  const on = sel?.tag === tag
  const body = 'M-9,-6 L9,6 L9,-6 L-9,6 Z'
  const lx = labelSide === 'right' ? x + 14 : labelSide === 'left' ? x - 14 : x
  const ly = labelSide === 'above' ? y - 24 : labelSide === 'below' ? y + 19 : y + 4
  const anchor = labelSide === 'right' ? 'start' : labelSide === 'left' ? 'end' : 'middle'
  return (
    <g className="click" onClick={() => pick({ kind: 'valve', tag })} data-tag={tag}>
      <title>{`${tag}: ${state}${typeof v?.pos === 'number' ? ` (${Math.round(pos * 100)} %)` : ''}`}</title>
      <rect x={x - 12} y={y - 18} width={24} height={26} fill="transparent" />
      <g transform={`translate(${x} ${y}) rotate(${vertical ? 90 : 0})`}>
        <path d={body} className={`vbody ${state} ${offnorm ? 'offnorm' : ''}`} style={on ? { stroke: '#fff', strokeWidth: 2.4 } : undefined} />
      </g>
      {/* spring-return actuator */}
      <line x1={x} y1={y} x2={x} y2={y - 11} stroke="#9a9fa4" strokeWidth={1.2} />
      <rect x={x - 5} y={y - 16} width={10} height={5} fill="#3a3d41" stroke="#9a9fa4" strokeWidth={1} />
      <text className="tag" x={lx} y={ly} textAnchor={anchor} style={{ fontSize: 9.5 }}>
        {tag}
      </text>
      <Mark x={x + 11} y={y - 14} p={marks.get(tag)} />
    </g>
  )
}

function Level({ x, y, h, v, w = 12 }: { x: number; y: number; h: number; v: number | undefined; w?: number }) {
  const val = typeof v === 'number' ? Math.max(0, Math.min(100, v)) : 0
  const cls = typeof v !== 'number' ? '' : v < 10 || v > 90 ? 'bad' : v < 25 || v > 75 ? 'abn' : ''
  return (
    <g>
      <rect className="lvl-bg" x={x} y={y} width={w} height={h} />
      {/* normal operating band 25–75 % */}
      <rect className="lvl-band" x={x + 1} y={y + h * 0.25} width={w - 2} height={h * 0.5} />
      <rect className={`lvl-fill ${cls}`} x={x + 2} y={y + h - (h * val) / 100} width={w - 4} height={(h * val) / 100} />
      <line x1={x - 3} x2={x + w + 3} y1={y + h * 0.1} y2={y + h * 0.1} stroke="#e4372c" strokeWidth={1} opacity={0.6} />
      <line x1={x - 3} x2={x + w + 3} y1={y + h * 0.9} y2={y + h * 0.9} stroke="#e4372c" strokeWidth={1} opacity={0.6} />
    </g>
  )
}

function Val({ x, y, v, d = 0, unit, abn, bad, anchor = 'start' }: { x: number; y: number; v: number | undefined; d?: number; unit: string; abn?: boolean; bad?: boolean; anchor?: 'start' | 'middle' | 'end' }) {
  return (
    <text x={x} y={y} className={`val ${bad ? 'bad' : abn ? 'abn' : ''}`} textAnchor={anchor}>
      {fmt(v, d)}
      <tspan className="lbl" dx={3} style={{ fill: '#8d9297', fontSize: 9.5 }}>
        {unit}
      </tspan>
    </text>
  )
}

function VesselBox({ tag, x, y, w, h, rx = 4, pick, sel, marks, children }: { tag: string; x: number; y: number; w: number; h: number; rx?: number; pick: Pick; sel: Sel; marks: Map<string, AlarmPriority>; children?: ReactNode }) {
  const on = sel?.tag === tag
  return (
    <g className="click" onClick={() => pick({ kind: 'vessel', tag })} data-tag={tag}>
      <rect className={rx > 6 ? 'ves' : 'box'} x={x} y={y} width={w} height={h} rx={rx} style={on ? { stroke: '#fff', strokeWidth: 2.2 } : undefined} />
      {children}
      <Mark x={x + w} y={y} p={marks.get(tag)} />
    </g>
  )
}

/** off-page connector (ISA-5.1 style arrow pentagon) */
function Conn({ x, y, text, dir = 'right' }: { x: number; y: number; text: string; dir?: 'right' | 'left' }) {
  const d = dir === 'right' ? `M${x},${y - 7} H${x + 14} L${x + 21},${y} L${x + 14},${y + 7} H${x} Z` : `M${x},${y - 7} H${x - 14} L${x - 21},${y} L${x - 14},${y + 7} H${x} Z`
  return (
    <g>
      <path d={d} fill="#33363a" stroke="#8a8f94" />
      <text x={dir === 'right' ? x + 26 : x - 26} y={y + 3.5} textAnchor={dir === 'right' ? 'start' : 'end'}>
        {text}
      </text>
    </g>
  )
}

// ------------------------------------------------------------------ Alpha

const ALPHA_WELLS = ['XT-110', 'XT-120', 'XT-130', 'XT-140', 'XT-150']
const WHP_WELLS = ['XT-N101', 'XT-N102', 'XT-N103', 'XT-N104', 'XT-N105', 'XT-N106']
/** ESD / blowdown valves drawn on a mimic (the rest are listed under it) */
const ON_MIMIC = new Set(['ESDV-1001', 'ESDV-2101', 'ESDV-2301', 'BDV-2201', 'ESDV-1601', 'ESDV-8101', 'ESDV-8102', 'ESDV-5301', 'ESDV-N2003', 'DV-N2851'])

function AlphaMimic({ plant, pick, sel, marks }: { plant: Plant; pick: Pick; sel: Sel; marks: Map<string, AlarmPriority> }) {
  const r = useS((s) => s.result)
  const p = useS((s) => s.process)
  const sp = useS((s) => s.knobs?.hpPressure)
  const sds = useS((s) => s.shutdowns) ?? EMPTY_ARR
  const P = { pick, sel, marks }
  const oilFlow = (r?.oilExport ?? 1) > 1
  const gasFlow = (r?.gasExport ?? 1) > 0.05
  const waterFlow = (r?.water ?? 1) > 1
  const flare = r?.flare ?? 0
  const alphaSd = r?.platforms?.Alpha?.shutdown ?? sds.find((x) => x.platform === 'Alpha')?.level
  const fl = Math.min(34, 6 + flare * 1.4)
  const wellOil = (t: string) => r?.wells?.[t]
  const whpOil = WHP_WELLS.reduce((a, t) => a + (r?.wells?.[t]?.oil ?? 0), 0)
  const hpHigh = typeof p?.hpPressure === 'number' && p.hpPressure > (sp ?? 42) + 2.5
  return (
    <section className="h-box">
      <h3>
        <span>Alpha: production platform</span>
        <span className="grow" />
        {alphaSd && <span style={{ color: '#ffd7a0' }}>{alphaSd} latched</span>}
      </h3>
      <svg className="mimic" viewBox="0 0 1120 600" data-mimic="alpha">
        {/* ---------- flare header and stack */}
        <path className="ln thin" d="M300,24 H1040" />
        <text className="lbl" x={310} y={18}>
          Flare header
        </text>
        <path className="ln thin" d="M404,128 V24" />
        <text x={408} y={52} style={{ fontSize: 9 }}>
          PSV-1101
        </text>
        <rect className="box" x={1032} y={24} width={16} height={120} />
        <path d={`M1040,${24 - fl} C1030,${24 - fl * 0.5} 1032,20 1040,22 C1048,20 1050,${24 - fl * 0.5} 1040,${24 - fl} Z`} fill={flare > 3 ? '#f39c1f' : '#8d9297'} opacity={0.85} />
        <text className="tag" x={1028} y={160} textAnchor="end">
          Flare
        </text>
        <Val x={1028} y={174} v={flare} d={1} unit="MMscfd" anchor="end" abn={flare > 3} bad={flare > 15} />
        <text x={1028} y={188} textAnchor="end">
          relief {fmt(p?.relief, 1)} MMscfd
        </text>

        {/* ---------- wells */}
        <rect className="box" x={16} y={110} width={118} height={170} />
        <text className="lbl" x={22} y={124}>
          Wells (cellar deck)
        </text>
        {ALPHA_WELLS.map((t, i) => {
          const w = wellOil(t)
          return (
            <g key={t} className="click" onClick={() => showIn3D(t)}>
              <circle cx={28} cy={140 + i * 20} r={4} fill={w?.online === false ? 'none' : '#c9ccd0'} stroke="#9a9fa4" />
              <text x={38} y={144 + i * 20} className="tag" style={{ fontSize: 9.5 }}>
                {t}
              </text>
              <text x={128} y={144 + i * 20} className="val" textAnchor="end" style={{ fontSize: 10 }}>
                {fmt(w?.oil)}
              </text>
            </g>
          )
        })}
        <line x1={22} x2={128} y1={240} y2={240} stroke="#43474c" />
        <text x={38} y={256} className="tag" style={{ fontSize: 9.5 }}>
          WHP-N (bridge)
        </text>
        <text x={128} y={270} className="val" textAnchor="end" style={{ fontSize: 10 }}>
          {fmt(whpOil)}
        </text>
        <text x={38} y={270} style={{ fontSize: 9 }}>
          bbl/d
        </text>
        <path className={`ln ${oilFlow ? '' : 'noflow'}`} d="M134,170 H150" />

        {/* ---------- manifold + inlet ESDV */}
        <VesselBox tag="M-1000" x={150} y={130} w={46} h={80} {...P}>
          <text className="tag" x={173} y={124} textAnchor="middle">
            M-1000
          </text>
          <text x={173} y={172} textAnchor="middle" style={{ fontSize: 9 }}>
            manifold
          </text>
        </VesselBox>
        <path className={`ln ${oilFlow ? '' : 'noflow'}`} d="M196,170 H262" />
        <ValveSym tag="ESDV-1001" x={229} y={170} plant={plant} {...P} />

        {/* ---------- HP separator */}
        <VesselBox tag="V-1100" x={262} y={128} w={170} h={84} rx={42} {...P}>
          <text className="tag" x={347} y={152} textAnchor="middle">
            V-1100 HP separator
          </text>
          <Val x={347} y={172} v={p?.hpPressure} d={1} unit="barg" anchor="middle" abn={hpHigh} />
          <text x={347} y={188} textAnchor="middle">
            level {fmt(p?.hpLevel, 1)} % · SP {fmt(sp, 1)} barg
          </text>
          <rect className="box" x={380} y={212} width={24} height={18} />
        </VesselBox>
        <Level x={442} y={128} h={84} v={p?.hpLevel} />
        <text className="lbl" x={436} y={224}>
          LT-1101
        </text>

        {/* ---------- gas train */}
        <path className={`ln gas ${gasFlow ? '' : 'noflow'}`} d="M300,128 V70 H520" />
        <ValveSym tag="ESDV-2101" x={470} y={70} plant={plant} labelSide="above" {...P} />
        <VesselBox tag="V-2100" x={520} y={40} w={28} h={60} rx={12} {...P}>
          <text className="tag" x={534} y={116} textAnchor="middle">
            V-2100
          </text>
        </VesselBox>
        <path className={`ln gas ${gasFlow ? '' : 'noflow'}`} d="M548,70 H600" />
        <Compressor x={600} y={70} {...P} />
        <path className={`ln gas ${gasFlow ? '' : 'noflow'}`} d="M660,70 H850" />
        {/* anti-surge recycle */}
        <path className="ln thin" d="M684,70 V124 H504 V70" strokeDasharray={(p?.recycle ?? 0) > 1 ? undefined : '4 3'} />
        <g transform="translate(594 124)">
          <path d="M-8,-5 L8,5 L8,-5 L-8,5 Z" className={`vbody ${(p?.recycle ?? 0) > 1 ? '' : 'closed'}`} />
        </g>
        <text x={594} y={142} textAnchor="middle" style={{ fontSize: 9 }}>
          FV-2201 anti-surge {fmt(p?.recycle, 0)} %
        </text>
        {/* blowdown */}
        <path className="ln thin" d="M710,70 V24" />
        <ValveSym tag="BDV-2201" x={710} y={46} vertical plant={plant} labelSide="right" {...P} />
        <ValveSym tag="ESDV-2301" x={806} y={70} plant={plant} labelSide="above" {...P} />
        <Conn x={850} y={70} text="Gas export → RP" />
        <Val x={876} y={92} v={r?.gasExport} d={1} unit="MMscfd" />
        {/* fuel gas off-take */}
        <path className="ln thin" d="M750,70 V108 H800" />
        <ValveSym tag="ESDV-5301" x={772} y={108} plant={plant} labelSide="below" {...P} />
        <Conn x={800} y={108} text="Fuel gas / TEG → GT-8100A/B" />
        <text x={826} y={132}>
          fuel gas {fmt(r?.fuelGas, 1)} MMscfd · {fmt(p?.fuelGasPressure, 1)} barg
        </text>

        {/* ---------- oil train */}
        <path className={`ln ${oilFlow ? '' : 'noflow'}`} d="M340,212 V240 H500" />
        <text x={470} y={262} textAnchor="middle" style={{ fontSize: 9 }}>
          LV-1101
        </text>
        <g transform="translate(470 240)">
          <path d="M-8,-5 L8,5 L8,-5 L-8,5 Z" className="vbody" />
        </g>
        <VesselBox tag="V-1300" x={500} y={210} w={130} h={56} rx={28} {...P}>
          <text className="tag" x={565} y={234} textAnchor="middle">
            V-1300 LP separator
          </text>
          <text x={565} y={250} textAnchor="middle">
            level {fmt(p?.lpLevel, 1)} %
          </text>
        </VesselBox>
        <Level x={638} y={210} h={56} v={p?.lpLevel} w={10} />
        <path className={`ln ${oilFlow ? '' : 'noflow'}`} d="M600,266 V300 H676" />
        <VesselBox tag="E-1400" x={606} y={290} w={40} h={20} {...P}>
          <text x={626} y={303} textAnchor="middle" style={{ fontSize: 9 }}>
            E-1400
          </text>
        </VesselBox>
        <path className={`ln ${oilFlow ? '' : 'noflow'}`} d="M676,272 V328 M676,272 H700 M676,328 H700 M732,272 H756 M732,328 H756 M756,272 V328 M756,300 H880" />
        <Mach tag="P-1500A" x={716} y={272} label="right" {...P} />
        <Mach tag="P-1500B" x={716} y={328} label="right" {...P} />
        <ValveSym tag="ESDV-1601" x={820} y={300} plant={plant} labelSide="above" {...P} />
        <Conn x={880} y={300} text="Oil export → RP" />
        <Val x={906} y={322} v={r?.oilExport} unit="bbl/d" />

        {/* ---------- produced water */}
        <path className={`ln ${waterFlow ? '' : 'noflow'}`} d="M392,230 V380 H450 M450,380 V430 M450,380 H454 M450,430 H454 M486,380 H520 M486,430 H520 M520,380 V430 M520,405 H600" />
        <Mach tag="P-4300A" x={470} y={380} label="right" {...P} />
        <Mach tag="P-4300B" x={470} y={430} label="right" {...P} />
        <Conn x={600} y={405} text="Produced water → hydrocyclone, degasser V-4100, overboard" />
        <Val x={626} y={428} v={r?.water} unit="bbl/d" />

        {/* ---------- utilities */}
        <rect className="box" x={16} y={466} width={250} height={124} />
        <text className="lbl" x={24} y={482}>
          Instrument air
        </text>
        <Mach tag="K-4600" x={56} y={530} {...P} />
        <path className="ln thin" d="M71,530 H120" />
        <VesselBox tag="V-4700" x={120} y={510} w={26} h={44} rx={11} {...P} />
        <path className="ln thin" d="M146,530 H170" />
        <text x={176} y={514}>
          IA header
        </text>
        <Val x={176} y={532} v={p?.iaPressure} d={1} unit="barg" abn={(p?.iaPressure ?? 8) < 6} bad={(p?.iaPressure ?? 8) < 5} />
        <text x={176} y={550} style={{ fontSize: 9 }}>
          {(p?.iaPressure ?? 8) < 5 ? 'valves failing to safe' : 'ESDVs fail safe < 5 barg'}
        </text>

        <rect className="box" x={276} y={466} width={290} height={124} />
        <text className="lbl" x={284} y={482}>
          Cooling: seawater & cooling medium
        </text>
        <Mach tag="P-6400A" x={316} y={520} {...P} />
        <Mach tag="P-6400B" x={366} y={520} {...P} />
        <Mach tag="P-6200A" x={436} y={520} {...P} />
        <Mach tag="P-6200B" x={486} y={520} {...P} />
        <text x={284} y={578}>
          CM supply
        </text>
        <Val x={340} y={578} v={p?.cmTemp} d={1} unit="°C" abn={(p?.cmTemp ?? 30) > 45} bad={(p?.cmTemp ?? 30) > 55} />

        <rect className="box" x={576} y={466} width={300} height={124} />
        <text className="lbl" x={584} y={482}>
          Power generation
        </text>
        <ValveSym tag="ESDV-8101" x={612} y={516} plant={plant} {...P} />
        <ValveSym tag="ESDV-8102" x={612} y={566} plant={plant} {...P} />
        <path className="ln thin" d="M588,516 H644 M588,566 H644" />
        <Mach tag="GT-8100A" x={662} y={516} r={14} label="right" {...P} />
        <Mach tag="GT-8100B" x={662} y={566} r={14} label="right" {...P} />
        <text x={756} y={510}>
          generated / available
        </text>
        <text x={756} y={526} className="val">
          {fmt(r?.powerGenerated, 1)} / {(r?.powerAvailable ?? 0) >= 999 ? 'grid' : fmt(r?.powerAvailable, 0)} MW
        </text>
        <text x={756} y={544}>
          demand {fmt(r?.powerDemand, 1)} MW
        </text>
        <text x={756} y={560} className={`val ${typeof p?.busHz === 'number' && Math.abs(p.busHz - 50) > 1 ? 'abn' : ''}`}>
          {fmt(p?.busHz, 2)} Hz
        </text>
        <text x={756} y={578}>
          emerg. gen {p?.emergencyGen ?? '-'}
        </text>

        <rect className="box" x={886} y={466} width={218} height={124} />
        <text className="lbl" x={894} y={482}>
          Firewater
        </text>
        <Mach tag="P-7101A" x={926} y={526} {...P} />
        <Mach tag="P-7101B" x={986} y={526} {...P} />
        <text x={1024} y={514}>
          ring main
        </text>
        <Val x={1024} y={532} v={p?.fwPressure} d={1} unit="barg" abn={typeof p?.fwPressure === 'number' && p.fwPressure < 8} />
      </svg>
    </section>
  )
}

function Compressor({ x, y, pick, sel, marks }: { x: number; y: number; pick: Pick; sel: Sel; marks: Map<string, AlarmPriority> }) {
  const tag = 'K-2200'
  useS((s) => s.status?.[tag])
  useS((s) => s.t)
  const p = useS((s) => s.process)
  const st = runOf(sim(), tag)
  const on = sel?.tag === tag
  const sm = p?.surgeMargin
  return (
    <g className="click" onClick={() => pick({ kind: 'machine', tag })} data-tag={tag}>
      <title>{`${tag}: ${st}`}</title>
      <path d={`M${x},${y - 30} L${x + 60},${y - 14} L${x + 60},${y + 14} L${x},${y + 30} Z`} className={`mach ${st}`} style={on ? { stroke: '#fff', strokeWidth: 2.5 } : undefined} />
      <text x={x + 28} y={y + 3} className={`machtxt ${st === 'running' ? '' : st === 'tripped' ? 'trip' : 'off'}`}>
        {RS_TXT[st]}
      </text>
      <text className="tag" x={x + 30} y={y - 36} textAnchor="middle">
        K-2200
      </text>
      <text x={x + 30} y={y + 44} textAnchor="middle" className={`val ${typeof sm === 'number' && sm < 5 ? 'bad' : typeof sm === 'number' && sm < 10 ? 'abn' : ''}`} style={{ fontSize: 10 }}>
        surge margin {fmt(sm, 1)} %
      </text>
      <Mark x={x + 62} y={y - 30} p={marks.get(tag)} />
    </g>
  )
}

// ------------------------------------------------------------------ WHP-N

function WhpMimic({ plant, pick, sel, marks }: { plant: Plant; pick: Pick; sel: Sel; marks: Map<string, AlarmPriority> }) {
  const r = useS((s) => s.result)
  const fg = useS((s) => s.fg)
  const P = { pick, sel, marks }
  if (!plant.equipment.some((e) => e.tag === 'M-N200')) return null
  const res = r?.platforms?.['WHP-N']
  const deluge = Object.values(fg ?? {}).some((z) => z && z.deluge && /^N-/.test(z.zone))
  return (
    <section className="h-box">
      <h3>
        <span>WHP-N: wellhead platform</span>
        <span className="grow" />
        {res?.shutdown && <span style={{ color: '#ffd7a0' }}>{res.shutdown} latched</span>}
      </h3>
      <svg className="mimic" viewBox="0 0 1120 230" data-mimic="whp">
        <rect className="box" x={16} y={24} width={140} height={150} />
        <text className="lbl" x={22} y={38}>
          Wells (well bay)
        </text>
        {WHP_WELLS.map((t, i) => {
          const w = r?.wells?.[t]
          if (!plant.equipment.some((e) => e.tag === t)) return null
          return (
            <g key={t} className="click" onClick={() => showIn3D(t)}>
              <circle cx={28} cy={54 + i * 20} r={4} fill={w?.online === false ? 'none' : '#c9ccd0'} stroke="#9a9fa4" />
              <text x={38} y={58 + i * 20} className="tag" style={{ fontSize: 9.5 }}>
                {t}
              </text>
              <text x={150} y={58 + i * 20} className="val" textAnchor="end" style={{ fontSize: 10 }}>
                {w ? fmt(w.oil) : t === 'XT-N106' ? 'inj.' : '-'}
              </text>
            </g>
          )
        })}
        <path className="ln" d="M156,90 H200 M156,160 H200" />
        <VesselBox tag="M-N200" x={200} y={56} w={46} h={70} {...P}>
          <text className="tag" x={223} y={50} textAnchor="middle">
            M-N200
          </text>
        </VesselBox>
        <VesselBox tag="M-N210" x={200} y={142} w={46} h={36} {...P}>
          <text className="tag" x={223} y={196} textAnchor="middle">
            M-N210 test
          </text>
        </VesselBox>
        <path className="ln" d="M246,90 H290" />
        <VesselBox tag="V-N230" x={290} y={66} w={56} h={48} rx={20} {...P}>
          <text className="tag" x={318} y={130} textAnchor="middle">
            V-N230 desander
          </text>
        </VesselBox>
        <path className="ln thin" d="M246,160 H290" />
        <VesselBox tag="V-N240" x={290} y={148} w={56} h={26} {...P}>
          <text x={318} y={165} textAnchor="middle" style={{ fontSize: 9 }}>
            MPFM
          </text>
        </VesselBox>
        <text className="tag" x={318} y={190} textAnchor="middle" style={{ fontSize: 9.5 }}>
          V-N240
        </text>
        <path className="ln" d="M346,90 H520" />
        <path className="ln thin" d="M346,160 H380 V90" />
        <ValveSym tag="ESDV-N2003" x={430} y={90} plant={plant} labelSide="above" {...P} />
        <Conn x={520} y={90} text="North bridge → Alpha M-1000" />
        <Val x={546} y={112} v={res?.oil} unit="bbl/d" />
        <text x={546} y={128}>
          gas {fmt(res?.gas, 1)} MMscfd
        </text>

        <path className="ln thin" d="M700,190 H760 V120" />
        <text x={700} y={204}>
          firewater
        </text>
        <ValveSym tag="DV-N2851" x={760} y={150} vertical plant={plant} labelSide="right" {...P} />
        <path className="ln thin" d="M730,120 H790" strokeDasharray="2 3" />
        <text x={800} y={124} className={deluge ? 'val abn' : ''}>
          {deluge ? 'DELUGE RELEASED: well bay' : 'Well-bay deluge'}
        </text>

        <VesselBox tag="V-N281" x={900} y={40} w={26} h={46} rx={11} {...P}>
          <text className="tag" x={913} y={102} textAnchor="middle">
            V-N281
          </text>
        </VesselBox>
        <text x={913} y={116} textAnchor="middle">
          instr. air
        </text>
        <VesselBox tag="V-N290" x={980} y={46} w={90} h={36} rx={18} {...P}>
          <text className="tag" x={1025} y={102} textAnchor="middle">
            V-N290 vent KO
          </text>
        </VesselBox>
        <text x={900} y={160}>
          GA: {res?.ga ?? '-'} · {res ? (res.online ? 'producing' : 'not producing') : '-'}
        </text>
      </svg>
    </section>
  )
}

// ------------------------------------------------------------------ valves not on a mimic

function OtherValves({ plant, pick, sel }: { plant: Plant; pick: Pick; sel: Sel }) {
  const valves = useS((s) => s.valves)
  const list = plant.valves.filter((v) => (v.type === 'esdv' || v.type === 'bdv') && !ON_MIMIC.has(v.tag))
  if (!list.length) return null
  return (
    <section className="h-box">
      <h3>
        <span>Other ESD / blowdown valves</span>
      </h3>
      <table className="h-tbl">
        <tbody>
          {list.map((v) => {
            const { pos, state } = valveLook(valves?.[v.tag], v.normally)
            return (
              <tr key={v.tag} onClick={() => pick({ kind: 'valve', tag: v.tag })} style={{ cursor: 'pointer', background: sel?.tag === v.tag ? 'rgba(255,255,255,0.05)' : undefined }}>
                <td className="mono">{v.tag}</td>
                <td className="dim">{v.line}</td>
                <td>{state}</td>
                <td className="num">{Math.round(pos * 100)} %</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

// ------------------------------------------------------------------ faceplates

function Faceplate({ sel, close }: { sel: Sel; close: () => void }) {
  if (!sel) return <aside className="faceplate h-note">Select equipment for its faceplate.</aside>
  if (sel.kind === 'machine') return <MachineFace key={sel.tag} tag={sel.tag} close={close} />
  if (sel.kind === 'valve') return <ValveFace key={sel.tag} tag={sel.tag} close={close} />
  return <VesselFace key={sel.tag} tag={sel.tag} close={close} />
}

function FaceHead({ tag, sub, close }: { tag: string; sub: string; close: () => void }) {
  return (
    <>
      <div className="h-row" style={{ justifyContent: 'space-between' }}>
        <h4>{tag}</h4>
        <button onClick={close} title="Close faceplate">
          ✕
        </button>
      </div>
      <div className="sub">{sub}</div>
    </>
  )
}

export function MachineFace({ tag, close }: { tag: string; close?: () => void }) {
  const plant = usePlant()
  useS((s) => s.status?.[tag])
  useS((s) => s.t)
  const m = useS((s) => s.machines?.[tag])
  const [msg, setMsg] = useState<string | null>(null)
  const st = runOf(sim(), tag)
  const e = plant.equipment.find((x) => x.tag === tag)
  const act = (f: () => string | null, ok: string) => setMsg(f() ?? `✓ ${ok}`)
  return (
    <aside className="faceplate" data-face={tag}>
      <FaceHead tag={tag} sub={e?.name ?? 'Machine'} close={close ?? (() => {})} />
      <dl>
        <dt>State</dt>
        <dd>
          <RunPill st={st} />
        </dd>
        <dt>Run hours</dt>
        <dd>{fmt(m?.runHours ?? 0, 1)} h</dd>
        {m?.tripCause && (
          <>
            <dt>Trip cause</dt>
            <dd style={{ color: '#ffd7a0' }}>{m.tripCause}</dd>
          </>
        )}
        {m?.localReset && (
          <>
            <dt>Reset</dt>
            <dd>local reset required</dd>
          </>
        )}
        {typeof m?.repairUntil === 'number' && (
          <>
            <dt>Under repair until</dt>
            <dd>{fmtClock(m.repairUntil)}</dd>
          </>
        )}
        {m?.byShutdown && (
          <>
            <dt>Stopped by</dt>
            <dd>{m.byShutdown}</dd>
          </>
        )}
        {m?.autoStarted && (
          <>
            <dt>Auto-start</dt>
            <dd>started as standby</dd>
          </>
        )}
        {st === 'starting' && typeof m?.startDoneAt === 'number' && (
          <>
            <dt>Start sequence</dt>
            <dd>until {fmtClock(m.startDoneAt, false)}</dd>
          </>
        )}
      </dl>
      <div className="btns">
        <button onClick={() => act(() => startMachine(tag), 'Start command sent')} disabled={st === 'running' || st === 'starting' || st === 'tripped'}>
          Start
        </button>
        <button onClick={() => act(() => stopMachine(tag), 'Stop command sent')} disabled={st !== 'running' && st !== 'starting'}>
          Stop
        </button>
        <button className={st === 'tripped' ? 'warn' : ''} onClick={() => act(() => resetMachine(tag), 'Reset: machine available')} disabled={st !== 'tripped'}>
          Reset
        </button>
        {st === 'tripped' && m?.localReset && (
          <button onClick={() => goToMachine(tag)} title="Machinery-protection trip: it can only be reset at the machine. Closes the console and walks you there.">
            Go to machine (local reset)
          </button>
        )}
        {pickOf(tag) && <button onClick={() => showIn3D(tag)}>Show in 3D</button>}
      </div>
      <Msg text={msg} />
    </aside>
  )
}

const VALVE_KIND = (v: Valve) => (v.type === 'bdv' ? 'Blowdown valve' : v.failAction === 'FO' ? 'Deluge valve (fail open)' : 'Emergency shutdown valve')

function ValveFace({ tag, close }: { tag: string; close: () => void }) {
  const plant = usePlant()
  const v = useS((s) => s.valves?.[tag])
  const [msg, setMsg] = useState<string | null>(null)
  const def = plant.valves.find((x) => x.tag === tag)
  if (!def) return null
  const { pos, state } = valveLook(v, def.normally)
  const cmd = (c: 'open' | 'closed') => {
    const r = call('setValve', tag, c, 'CCR')
    setMsg(r ?? (v?.fault === 'stuck' ? `Command ${c} sent: valve is reported STUCK, travel will not follow` : `✓ ${c === 'open' ? 'Open' : 'Close'} command sent`))
  }
  return (
    <aside className="faceplate" data-face={tag}>
      <FaceHead tag={tag} sub={VALVE_KIND(def)} close={close} />
      <div className="bar">
        <i style={{ width: `${Math.round(pos * 100)}%` }} />
      </div>
      <dl>
        <dt>Position</dt>
        <dd>
          {Math.round(pos * 100)} % · {state}
        </dd>
        <dt>Command</dt>
        <dd>{v?.cmd ?? def.normally}</dd>
        <dt>Normal position</dt>
        <dd>{def.normally}</dd>
        <dt>Fail action</dt>
        <dd>{def.failAction ?? '-'}</dd>
        <dt>Stroke time</dt>
        <dd>{typeof v?.stroke === 'number' ? `${fmt(v.stroke, 0)} s` : '-'}</dd>
        {v?.fault && (
          <>
            <dt>Fault</dt>
            <dd style={{ color: '#ffd7a0' }}>{v.fault}</dd>
          </>
        )}
        {v?.by && (
          <>
            <dt>Last moved by</dt>
            <dd>{v.by}</dd>
          </>
        )}
        <dt>Line</dt>
        <dd className="wrap" style={{ fontSize: 10.5 }}>
          {def.line}
        </dd>
      </dl>
      <div className="btns">
        <button onClick={() => cmd('open')} disabled={v?.cmd === 'open'}>
          Open
        </button>
        <button onClick={() => cmd('closed')} disabled={v?.cmd === 'closed'}>
          Close
        </button>
        <button onClick={() => showIn3D(tag)}>Show in 3D</button>
      </div>
      <Msg text={msg} />
    </aside>
  )
}

function VesselFace({ tag, close }: { tag: string; close: () => void }) {
  const plant = usePlant()
  const p = useS((s) => s.process)
  const sp = useS((s) => s.knobs?.hpPressure)
  const e = plant.equipment.find((x) => x.tag === tag)
  return (
    <aside className="faceplate" data-face={tag}>
      <FaceHead tag={tag} sub={e?.name ?? tag} close={close} />
      {tag === 'V-1100' && (
        <dl>
          <dt>Level LT-1101</dt>
          <dd>{fmt(p?.hpLevel, 1)} %</dd>
          <dt>Pressure PT-1101</dt>
          <dd>{fmt(p?.hpPressure, 1)} barg</dd>
          <dt>Pressure setpoint</dt>
          <dd>{fmt(sp, 1)} barg</dd>
          <dt>Relief PSV-1101</dt>
          <dd>{fmt(p?.relief, 1)} MMscfd</dd>
          <dt>Level control</dt>
          <dd>LV-1101 to V-1300</dd>
        </dl>
      )}
      {tag === 'V-1300' && (
        <dl>
          <dt>Level LT-1301</dt>
          <dd>{fmt(p?.lpLevel, 1)} %</dd>
        </dl>
      )}
      {tag === 'V-4700' && (
        <dl>
          <dt>IA header</dt>
          <dd>{fmt(p?.iaPressure, 1)} barg</dd>
        </dl>
      )}
      <div className="btns">{pickOf(tag) && <button onClick={() => showIn3D(tag)}>Show in 3D</button>}</div>
    </aside>
  )
}
