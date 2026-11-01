/**
 * Control-room HMI (DCS operator console): a full-screen overlay opened from the toolbar
 * ("Control room") or by sitting at a console in the CCR / WHP-N local control room. Shown while
 * `useStore.hmi` names a page. ISA-101 style: grey, quiet, colour only when something is abnormal.
 *
 *   Asset & economics · Spares & supply · Live dashboard · Risk & what-if · Response · Scenarios · CCTV & PPE · Inspections · Alerts & assistant ·
 *   Process · Alarms · Shutdown · F&G · Maintenance · Machines · Overview · Trends · Cranes & weather · Handover · Instructor
 *
 * Esc closes. While it is open the walker and the viewer hot-keys ignore the keyboard.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../../state/store'
import { isAlphaField, usePlant } from '../../state/plantStore'
import { fmtClock, type AlarmPriority, type PlatformId } from '../../sim/types'
import { EMPTY_ARR, EMPTY_OBJ, PLATFORMS, call, useS } from './simApi'
import { Overview } from './Overview'
import { Process } from './Process'
import { Alarms } from './Alarms'
import { ShutdownPage } from './Shutdown'
import { FgPage } from './FgPage'
import { Trends } from './Trends'
import { Machines } from './Machines'
import { Instructor } from './Instructor'
import { MaintenancePage } from './Maintenance'
import { HandoverPage } from './Handover'
import { ScenariosPage } from './Scenarios'
import { CranesPanel } from './Cranes'
import { DashboardPage } from './Dashboard'
import { RiskPage } from './RiskPage'
import { CctvPage } from './CctvPage'
import { InspectionPage } from './InspectionPage'
import { AlertsPage } from './AlertsPage'
import { ResponsePage } from './ResponsePage'
import { EconomicsPage } from './EconomicsPage'
import { SparesPage } from './SparesPage'
import { DemoStory } from './DemoStory'
import './hmi.css'

const HMI_PAGES = [
  ['economics', 'Asset & economics'],
  ['spares', 'Spares & supply'],
  ['dashboard', 'Live dashboard'],
  ['risk', 'Risk & what-if'],
  ['response', 'Response'],
  ['scenarios', 'Scenarios'],
  ['cctv', 'CCTV & PPE'],
  ['inspection', 'Inspections'],
  ['alerts', 'Alerts & assistant'],
  ['process', 'Process'],
  ['alarms', 'Alarms'],
  ['shutdown', 'Shutdown'],
  ['fg', 'F&G'],
  ['maintenance', 'Maintenance'],
  ['machines', 'Machines'],
  ['overview', 'Overview'],
  ['trends', 'Trends'],
  ['cranes', 'Cranes & weather'],
  ['handover', 'Handover'],
  ['instructor', 'Instructor'],
] as const

const SPEEDS: [number, string][] = [
  [0, 'Pause'],
  [1, '1×'],
  [5, '5×'],
  [20, '20×'],
  [60, '60×'],
]

/** viewer / walker hot-keys swallowed while the console is open (App.tsx and Walk.tsx listen on window) */
const SWALLOW = new Set(['x', 's', 'c', 'f', 'l', 'g', 'v', 'w', 'a', 'd', 'q', 'e', ' ', '1', '2', '3', '4', '5', '6', '7', '8', '9'])

export function Hmi() {
  const page = useStore((s) => s.hmi)
  useEffect(() => {
    if (!page) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        // a dialog inside the console (e.g. the email draft) closes first
        const modalBg = document.querySelector<HTMLElement>('.hmi .al-modal-bg')
        if (modalBg) return modalBg.click()
        useStore.getState().setHmi(null)
        return
      }
      const field = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      if (!field && !e.metaKey && !e.ctrlKey && SWALLOW.has(e.key.toLowerCase())) e.stopPropagation()
    }
    // capture phase on window: runs before App's / the walker's window listeners
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [page])
  if (!page) return null
  return <Console page={page} />
}

function Console({ page }: { page: string }) {
  const setHmi = useStore((s) => s.setHmi)
  const alpha = isAlphaField(usePlant())
  const pages = HMI_PAGES.filter(([k]) => alpha || k !== 'inspection')
  const cur = pages.some(([k]) => k === page) ? page : 'economics'
  return (
    <div className="hmi" role="dialog" aria-label="Control room console">
      <Header />
      <TabStrip cur={cur}>
        {pages.map(([k, label]) => (
          <button key={k} className={cur === k ? 'on' : ''} onClick={() => setHmi(k)} data-page={k}>
            {label}
            {k === 'alarms' && <AlarmBadge />}
            {k === 'shutdown' && <ShutdownBadge />}
          </button>
        ))}
      </TabStrip>
      <main className="hmi-body" data-hmi-page={cur}>
        {cur === 'economics' && <EconomicsPage headerExtra={<DemoStory />} />}
        {cur === 'spares' && <SparesPage />}
        {cur === 'dashboard' && <DashboardPage />}
        {cur === 'risk' && <RiskPage />}
        {cur === 'cctv' && <CctvPage />}
        {cur === 'inspection' && <InspectionPage />}
        {cur === 'alerts' && <AlertsPage />}
        {cur === 'response' && <ResponsePage />}
        {cur === 'overview' && <Overview />}
        {cur === 'process' && <Process />}
        {cur === 'alarms' && <Alarms />}
        {cur === 'shutdown' && <ShutdownPage />}
        {cur === 'fg' && <FgPage />}
        {cur === 'trends' && <Trends />}
        {cur === 'machines' && <Machines />}
        {cur === 'maintenance' && <MaintenancePage />}
        {cur === 'cranes' && <CranesPanel />}
        {cur === 'handover' && <HandoverPage />}
        {cur === 'instructor' && <Instructor />}
        {cur === 'scenarios' && <ScenariosPage />}
      </main>
    </div>
  )
}

/** the page tabs on one row, with an arrow at each end for what doesn't fit, like a spreadsheet's sheet tabs */
function TabStrip({ cur, children }: { cur: string; children: ReactNode }) {
  const strip = useRef<HTMLElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = () => {
      const left = el.scrollLeft > 1
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }))
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const size = new ResizeObserver(measure)
    size.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      size.disconnect()
    }
  }, [])
  // a page opened from elsewhere in the console may have its tab off to one side
  useEffect(() => {
    strip.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])
  const page = (dir: 1 | -1) => {
    const el = strip.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8 })
  }
  const arrows = more.left || more.right
  return (
    <div className="hmi-tabbar">
      {arrows && (
        <button className="hmi-tabs-arrow left" disabled={!more.left} onClick={() => page(-1)} aria-label="Show the tabs to the left" title="Show the tabs to the left" data-tabs-arrow="left">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
      )}
      <nav className="hmi-tabs" ref={strip}>
        {children}
      </nav>
      {arrows && (
        <button className="hmi-tabs-arrow right" disabled={!more.right} onClick={() => page(1)} aria-label="Show the tabs to the right" title="Show the tabs to the right" data-tabs-arrow="right">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      )}
    </div>
  )
}

function Header() {
  const t = useS((s) => s.t)
  const speed = useS((s) => s.speed)
  const platforms = useS((s) => s.result?.platforms) ?? EMPTY_OBJ
  const shutdowns = useS((s) => s.shutdowns) ?? EMPTY_ARR
  const setHmi = useStore((s) => s.setHmi)
  return (
    <header className="hmi-head">
      <div className="hmi-title">
        Alpha field: DCS
        <small>Central Control Room · operator console</small>
      </div>
      <div className="hmi-clock" title="Simulation clock (session starts D1 06:00)">
        {typeof t === 'number' ? fmtClock(t) : '-'}
      </div>
      <div className="hmi-speed" title="Simulation speed">
        {SPEEDS.map(([v, label]) => (
          <button key={v} className={(speed ?? 1) === v ? 'on' : ''} onClick={() => call('setSpeed', v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="hmi-lamps">
        {PLATFORMS.map((p) => {
          const r = (platforms as Partial<Record<PlatformId, { ga?: string; shutdown?: string | null }>>)[p]
          const sd = r?.shutdown ?? shutdowns.filter((x) => x.platform === p).map((x) => x.level)[0]
          const ga = r?.ga ?? 'normal'
          return (
            <div key={p} className={`hmi-lamp ${ga} ${sd ? 'sd' : ''}`} title={`${p}: general alarm ${ga}${sd ? `, ${sd} latched` : ''}`}>
              <i />
              <b>{p}</b>
              <span className="dim">{ga === 'normal' ? 'GA normal' : ga.toUpperCase()}</span>
              {sd && <span className="mono" style={{ color: '#ffd7a0' }}>{sd}</span>}
            </div>
          )
        })}
      </div>
      <button className="hmi-close" onClick={() => setHmi(null)} title="Close the console (Esc)">
        Close ✕
      </button>
    </header>
  )
}

function AlarmBadge() {
  const alarms = useS((s) => s.alarms) ?? EMPTY_ARR
  const un = alarms.filter((a) => a.state === 'unack' || a.state === 'rtnUnack')
  if (!un.length) return null
  const top = Math.min(...un.map((a) => a.priority ?? 3)) as AlarmPriority
  return <span className={`badge p${top}`}>{un.length}</span>
}
function ShutdownBadge() {
  const sds = useS((s) => s.shutdowns) ?? EMPTY_ARR
  if (!sds.length) return null
  return <span className="badge p2">{sds.length}</span>
}
