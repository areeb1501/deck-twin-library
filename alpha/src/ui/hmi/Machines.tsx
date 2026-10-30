/** Machines: every rotating machine — run state, run hours, trip cause, auto-start — with Start / Stop / Reset, the auto-changeover switch and the equipment-reliability mode. */
import { useMemo, useState } from 'react'
import { usePlant } from '../../state/plantStore'
import { platformOfTag } from '../../sim/fg'
import { fmtClock, type Knobs, type MachineSim } from '../../sim/types'
import { EMPTY_OBJ, call, fmt, machinesOf, resetMachine, runOf, sim, startMachine, stopMachine, useS } from './simApi'
import { Box, Msg, RunPill, TagLink } from './common'
import { goToMachine } from '../fieldOps'

const RELIABILITY: [Knobs['reliability'], string][] = [
  ['off', 'Off: no random failures'],
  ['realistic', 'Realistic MTBF'],
  ['training', 'Training: failures × 500'],
]

export function Machines() {
  const plant = usePlant()
  const list = useMemo(() => machinesOf(plant), [plant])
  useS((s) => s.status)
  useS((s) => s.t)
  const machines = (useS((s) => s.machines) ?? EMPTY_OBJ) as Record<string, MachineSim | undefined>
  const knobs = useS((s) => s.knobs)
  const [msg, setMsg] = useState<Record<string, string | null>>({})
  const [top, setTop] = useState<string | null>(null)
  const say = (tag: string, r: string | null, ok: string) => setMsg((m) => ({ ...m, [tag]: r ?? `✓ ${ok}` }))
  const s = sim()
  const tripped = list.filter((e) => runOf(s, e.tag) === 'tripped').length
  const running = list.filter((e) => runOf(s, e.tag) === 'running').length

  return (
    <div className="h-grid">
      <Box title="Machine management">
        <div className="h-row" style={{ gap: 18 }}>
          <label className="h-row" style={{ gap: 6 }}>
            <input type="checkbox" checked={knobs?.autoChangeover ?? false} disabled={knobs?.autoChangeover === undefined} onChange={(e) => setTop(call('setKnob', 'autoChangeover', e.target.checked))} data-knob="autoChangeover" />
            <span>Auto-changeover: the standby machine starts when the duty one trips</span>
          </label>
          <label className="h-row" style={{ gap: 6 }}>
            <span className="dim">Equipment reliability</span>
            <select value={knobs?.reliability ?? 'off'} disabled={knobs?.reliability === undefined} onChange={(e) => setTop(call('setKnob', 'reliability', e.target.value as Knobs['reliability']))} data-knob="reliability">
              {RELIABILITY.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <span className="dim">
            {running} running · {tripped ? <b style={{ color: '#ffd7a0' }}>{tripped} tripped</b> : '0 tripped'} · {list.length} machines
          </span>
        </div>
        <Msg text={top} />
      </Box>
      <Box title="Rotating equipment">
        <table className="h-tbl" data-tbl="machines">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Machine</th>
              <th>Platform</th>
              <th>State</th>
              <th style={{ textAlign: 'right' }}>Run hours</th>
              <th>Trip cause / notes</th>
              <th>Auto-start</th>
              <th style={{ textAlign: 'right' }}>Controls</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const st = runOf(s, e.tag)
              const m = machines[e.tag]
              const notes = [
                m?.tripCause,
                m?.localReset ? 'local reset required' : null,
                typeof m?.repairUntil === 'number' ? `under repair until ${fmtClock(m.repairUntil)}` : null,
                m?.byShutdown ? `stopped by ${m.byShutdown}` : null,
              ].filter(Boolean)
              return (
                <tr key={e.tag} data-machine={e.tag}>
                  <td>
                    <TagLink tag={e.tag} />
                  </td>
                  <td>{e.name}</td>
                  <td className="dim">{platformOfTag(plant, e.tag)}</td>
                  <td>
                    <RunPill st={st} />
                  </td>
                  <td className="num">{fmt(m?.runHours ?? 0, 1)}</td>
                  <td className="wrap" style={{ color: st === 'tripped' ? '#ffd7a0' : undefined }}>
                    {notes.join(' · ') || <span className="faint">-</span>}
                    {msg[e.tag] && <Msg text={msg[e.tag]} />}
                  </td>
                  <td className="dim">{m?.autoStarted ? 'auto-started' : ''}</td>
                  <td className="act">
                    <button onClick={() => say(e.tag, startMachine(e.tag), `${e.tag} start command sent`)} disabled={st === 'running' || st === 'starting' || st === 'tripped'}>
                      Start
                    </button>
                    <button onClick={() => say(e.tag, stopMachine(e.tag), `${e.tag} stop command sent`)} disabled={st !== 'running' && st !== 'starting'}>
                      Stop
                    </button>
                    <button className={st === 'tripped' ? 'warn' : ''} onClick={() => say(e.tag, resetMachine(e.tag), `${e.tag} reset`)} disabled={st !== 'tripped'} data-act="reset">
                      Reset
                    </button>
                    {st === 'tripped' && m?.localReset && (
                      <button onClick={() => goToMachine(e.tag)} title="Machinery-protection trip: it can only be reset at the machine. Closes the console and walks you there.">
                        Go to
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>
    </div>
  )
}
