/** "▶ Demo story" launcher for the Asset & economics header (sim/demoStory.ts). */
import { useState } from 'react'
import { STORIES, setAutoCrew, startStory, stopStory, useStory, type StoryId } from '../../sim/demoStory'
import { fmtClock } from '../../sim/types'
import { DGS_PO, previewExpedite, sparesApi, useSpares } from '../../sim/spares'
import { fmtUsd } from '../../sim/assetRisk'
import { useS } from './simApi'
import './story.css'

export function DemoStory() {
  const active = useStory((s) => s.active)
  const note = useStory((s) => s.note)
  const autoCrew = useStory((s) => s.autoCrew)
  const startedAt = useStory((s) => s.startedAt)
  const t = useS((s) => s.t)
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const story = STORIES.find((x) => x.id === active)

  const go = (id: StoryId) => {
    const r = startStory(id)
    setMsg(r)
    if (!r) setOpen(false)
  }

  return (
    <div className="story">
      {story ? (
        <div className="story-chip" title={story.pitch}>
          <span className="story-dot" />
          <b>{story.title}</b>
          <span className="dim mono">+{fmtClock(Math.max(0, (t ?? 0) - startedAt), false)}</span>
          {story.id === 'k2200-dgs' && <DgsChoice />}
          {note && <span className="story-note">{note}</span>}
          {story.tag && (
            <label className="story-crew" title="Walk the story machine's work orders through approve → permit → isolation → work → return to service (isolates only once the parts are kitted)">
              <input type="checkbox" checked={autoCrew} onChange={(e) => setAutoCrew(e.target.checked)} /> auto-crew
            </label>
          )}
          <button onClick={stopStory}>End</button>
        </div>
      ) : (
        <button className="story-go" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          ▶ Demo story
        </button>
      )}
      {open && !story && (
        <div className="story-menu" role="menu">
          {STORIES.map((s) => (
            <button key={s.id} role="menuitem" onClick={() => go(s.id)}>
              <b>{s.title}</b>
              <span>{s.pitch}</span>
            </button>
          ))}
          <p className="story-foot">Sets 60×, random failures off, simulated stock. Deterministic, so it plays the same every time.</p>
          {msg && <div className="h-msg">{msg}</div>}
        </div>
      )}
    </div>
  )
}

/** the compressor story's decision: expedite the cartridge by helicopter, or wait */
function DgsChoice() {
  const po = useSpares((s) => s.orders.find((o) => o.id === DGS_PO))
  const [msg, setMsg] = useState<string | null>(null)
  if (!po) return null
  if (po.mode === 'emergency' || po.mode === 'expedite' || po.stage === 'received') {
    return <span className="story-choice done">{po.stage === 'received' ? 'Cartridge offshore' : `Expedited${po.heli ? ' · helicopter' : ''} · ${po.stage}`}</span>
  }
  const pv = previewExpedite(DGS_PO, true)
  const go = () => {
    const r = sparesApi.expedite(DGS_PO, { heli: true, by: 'Demo story' })
    setMsg(r)
  }
  return (
    <span className="story-choice">
      <button className="warn" onClick={go} disabled={!!pv.why} title={pv.why ?? `Exchange unit from the vendor, helicopter for the last leg: ${fmtUsd(pv.premium + pv.freight)} extra, ≈ ${pv.days.toFixed(0)} d instead of ${pv.days + pv.savedDays > 0 ? (pv.days + pv.savedDays).toFixed(0) : '-'} d`}>
        Expedite by helicopter {pv.why ? '' : `(${fmtUsd(pv.premium + pv.freight)})`}
      </button>
      <span className="dim">or wait</span>
      {msg && <span className="story-err">{msg}</span>}
    </span>
  )
}
