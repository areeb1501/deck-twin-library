/**
 * Shutdown: the USD < PSD < ESD2 < ESD1 < APS hierarchy, the latched shutdowns (reset once the cause
 * has cleared, then restart the platform), guarded manual ESD push-buttons per platform and fire
 * zone, and the cause & effect matrix.
 */
import { useMemo, useState } from 'react'
import { usePlant } from '../../state/plantStore'
import { fireZones } from '../../sim/fg'
import { LOSS_LABEL, SHUTDOWN_LABEL, SHUTDOWN_RANK, fmtClock, type PlatformId, type Shutdown, type ShutdownLevel } from '../../sim/types'
import { EMPTY_ARR, PLATFORMS, call, causeEffect, useS } from './simApi'
import { Box, Msg } from './common'

const LEVELS = Object.keys(SHUTDOWN_LABEL) as ShutdownLevel[]
const WHAT: Record<ShutdownLevel, string> = {
  USD: 'one unit (a machine, a vessel) is stopped and isolated; the rest of the platform keeps producing',
  PSD: 'the process is stopped: wells shut in, process ESD valves closed; utilities, power and safety systems keep running',
  ESD2: 'a fire zone is isolated and blown down to flare; includes PSD',
  ESD1: 'the whole platform is isolated and blown down, non-essential power is shed; includes ESD2 and PSD',
  APS: 'abandon platform: everything is shut down except the emergency systems, muster and evacuate',
}

export function ShutdownPage() {
  const shutdowns = (useS((s) => s.shutdowns) ?? EMPTY_ARR) as Shutdown[]
  const platforms = useS((s) => s.result?.platforms)
  const [msg, setMsg] = useState<Record<string, string | null>>({})
  const say = (k: string, r: string | null, ok: string) => setMsg((m) => ({ ...m, [k]: r ?? `✓ ${ok}` }))
  const highest = shutdowns.reduce<ShutdownLevel | null>((h, s) => (!h || SHUTDOWN_RANK[s.level] > SHUTDOWN_RANK[h] ? s.level : h), null)

  return (
    <div className="h-grid">
      <div className="h-grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)' }}>
        <Box title="Shutdown hierarchy — a level includes every level below it">
          <div className="sd-ladder">
            {[...LEVELS].reverse().map((l) => (
              <div key={l} className={highest && SHUTDOWN_RANK[l] <= SHUTDOWN_RANK[highest] ? 'on' : ''}>
                <b>{l}</b>
                <span>
                  <b style={{ fontFamily: 'inherit' }}>{SHUTDOWN_LABEL[l]}</b> — <span className="dim">{WHAT[l]}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="h-note" style={{ marginTop: 6 }}>
            A shutdown latches. Reset is accepted only once its cause has cleared; the plant then stays down until you restart the platform, which re-opens the ESD valves, closes
            blowdown, restarts the machines the shutdown stopped and ramps the wells back.
          </p>
        </Box>

        <Box title={`Latched shutdowns — ${shutdowns.length}`}>
          {shutdowns.length === 0 ? (
            <div className="h-empty">No shutdown latched. All platforms are free to produce.</div>
          ) : (
            <table className="h-tbl" data-tbl="shutdowns">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Platform</th>
                  <th>Cause</th>
                  <th>Since</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...shutdowns]
                  .sort((a, b) => SHUTDOWN_RANK[b.level] - SHUTDOWN_RANK[a.level] || a.at - b.at)
                  .map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="lvl-tag" style={{ borderColor: SHUTDOWN_RANK[s.level] >= 2 ? '#e4372c' : '#f39c1f' }}>
                          {s.level}
                        </span>
                      </td>
                      <td>
                        {s.platform}
                        {s.zone && <span className="dim"> · {s.zone}</span>}
                      </td>
                      <td className="wrap">
                        {s.cause}
                        <div className="dim" style={{ fontSize: 10.5 }}>
                          {s.causeId} · booked to {LOSS_LABEL[s.loss] ?? s.loss}
                        </div>
                      </td>
                      <td className="mono">{fmtClock(s.at)}</td>
                      <td>{s.resetAt !== undefined ? `reset ${fmtClock(s.resetAt, false)} — awaiting restart` : s.resettable ? 'cause cleared — resettable' : 'cause present'}</td>
                      <td className="act">
                        {s.resetAt === undefined && (
                          <button className={s.resettable ? 'warn' : ''} onClick={() => say(s.id, call('resetShutdown', s.id), `Reset ${s.level} ${s.platform}`)} data-act="reset-sd">
                            Reset
                          </button>
                        )}
                        {msg[s.id] && <Msg text={msg[s.id]} />}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          <div className="h-row" style={{ marginTop: 8 }}>
            <span className="dim">Restart platform:</span>
            {PLATFORMS.map((p) => {
              const latched = shutdowns.some((s) => s.platform === p) || !!platforms?.[p]?.shutdown
              return (
                <button key={p} className={latched ? 'warn' : ''} onClick={() => say(`restart-${p}`, call('restart', p), `Restarting ${p}`)} title={`Re-open ESD valves, close blowdown, restart machines and ramp the wells on ${p}`} data-act={`restart-${p}`}>
                  Restart {p}
                </button>
              )
            })}
          </div>
          {PLATFORMS.map((p) => (msg[`restart-${p}`] ? <Msg key={p} text={`${p}: ${msg[`restart-${p}`]}`} /> : null))}
        </Box>
      </div>

      <ManualEsd />
      <CauseEffect />
    </div>
  )
}

function ManualEsd() {
  const plant = usePlant()
  const zones = useMemo(() => fireZones(plant), [plant])
  const [armed, setArmed] = useState<{ level: ShutdownLevel; platform: PlatformId; zone?: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const fire = () => {
    if (!armed) return
    const r = call('initiate', armed.level, armed.platform, armed.zone, 'Manual ESD push-button CCR')
    setMsg(r ?? `✓ Initiated ${armed.level} ${armed.platform}${armed.zone ? ` ${armed.zone}` : ''} from the CCR`)
    setArmed(null)
  }
  const pb = (level: ShutdownLevel, platform: PlatformId, zone?: string, label?: string) => {
    const on = armed?.level === level && armed.platform === platform && armed.zone === zone
    return (
      <button key={`${level}-${zone ?? ''}`} className={`danger pb ${on ? 'armed' : ''}`} onClick={() => (setMsg(null), setArmed(on ? null : { level, platform, zone }))} title={`${SHUTDOWN_LABEL[level]}${zone ? ` — zone ${zone}` : ''}`} data-pb={`${level}-${platform}${zone ? `-${zone}` : ''}`}>
        {label ?? level}
      </button>
    )
  }
  return (
    <Box title="Manual ESD push-buttons (CCR) — lift the cover, then confirm">
      <div className="esd-pb">
        {PLATFORMS.map((p) => (
          <section key={p} className="h-box">
            <h3>
              <span>{p}</span>
            </h3>
            <div className="pbs">
              {pb('PSD', p)}
              {pb('ESD1', p)}
              {pb('APS', p)}
            </div>
            <div className="pbs">
              {zones
                .filter((z) => z.platform === p)
                .map((z) => pb('ESD2', p, z.id, `ESD2 ${z.id}`))}
            </div>
          </section>
        ))}
      </div>
      {armed && (
        <div className="esd-confirm" style={{ marginTop: 8 }}>
          <b>
            Confirm {armed.level} — {SHUTDOWN_LABEL[armed.level]} on {armed.platform}
            {armed.zone ? `, zone ${armed.zone}` : ''}?
          </b>
          <span className="dim">This shuts the plant down and books the loss to control & safety.</span>
          <span style={{ flex: 1 }} />
          <button className="danger armed" onClick={fire} data-act="confirm-esd">
            Initiate {armed.level}
          </button>
          <button onClick={() => setArmed(null)}>Cancel</button>
        </div>
      )}
      <Msg text={msg} />
    </Box>
  )
}

function CauseEffect() {
  const rows = causeEffect()
  return (
    <Box title={`Cause & effect matrix — ${rows.length} causes`}>
      {rows.length === 0 ? (
        <div className="h-empty">The cause & effect matrix (sim/causeEffect.ts) is not loaded yet.</div>
      ) : (
        <table className="h-tbl" data-tbl="ce">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cause</th>
              <th>Initiates</th>
              <th>Scope</th>
              <th>Effects</th>
              <th>Loss booked to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono dim">{r.id}</td>
                <td className="wrap">{r.cause}</td>
                <td>
                  <span className="lvl-tag" style={r.level !== 'alarm' && SHUTDOWN_RANK[r.level] >= 2 ? { borderColor: '#e4372c' } : r.level !== 'alarm' ? { borderColor: '#f39c1f' } : undefined}>
                    {r.level === 'alarm' ? 'alarm' : r.level}
                  </span>
                </td>
                <td className="dim">{r.scope}</td>
                <td>
                  <div className="chips">
                    {(r.effects ?? []).map((e, i) => (
                      <span key={i} className="chip">
                        {e}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="dim">{LOSS_LABEL[r.loss] ?? r.loss}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Box>
  )
}
