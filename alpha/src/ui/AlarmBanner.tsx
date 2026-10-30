/**
 * Always-visible slim alarm banner (top centre, under the toolbar — viewer and walk mode):
 * unacknowledged alarms by priority, the newest highest-priority unacked alarm, Ack, Open console,
 * the latched platform shutdowns, and a horn (muted by default) that beeps on a new P1 alarm.
 * Flashes while an unacknowledged priority-1 alarm exists.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import type { Alarm, PlatformId, Shutdown } from '../sim/types'
import { EMPTY_ARR, PLATFORMS, call, useS } from './hmi/simApi'
import './hmi/hmi.css'

const isUnack = (a: Alarm) => a.state === 'unack' || a.state === 'rtnUnack'

let audio: AudioContext | null = null
function beep() {
  try {
    audio ??= new AudioContext()
    const t = audio.currentTime
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator()
      const g = audio.createGain()
      o.type = 'square'
      o.frequency.value = 880
      g.gain.setValueAtTime(0, t + i * 0.3)
      g.gain.linearRampToValueAtTime(0.06, t + i * 0.3 + 0.01)
      g.gain.setValueAtTime(0.06, t + i * 0.3 + 0.16)
      g.gain.linearRampToValueAtTime(0, t + i * 0.3 + 0.18)
      o.connect(g).connect(audio.destination)
      o.start(t + i * 0.3)
      o.stop(t + i * 0.3 + 0.2)
    }
  } catch {
    /* no audio */
  }
}

export function AlarmBanner() {
  const alarms = (useS((s) => s.alarms) ?? EMPTY_ARR) as Alarm[]
  const shutdowns = (useS((s) => s.shutdowns) ?? EMPTY_ARR) as Shutdown[]
  const platforms = useS((s) => s.result?.platforms)
  const hmi = useStore((s) => s.hmi)
  const setHmi = useStore((s) => s.setHmi)
  const [horn, setHorn] = useState(false)
  const seen = useRef<Set<string> | null>(null)

  const un = useMemo(() => alarms.filter(isUnack), [alarms])
  const counts = [1, 2, 3].map((p) => un.filter((a) => a.priority === p).length)
  const top = useMemo(() => [...un].sort((a, b) => a.priority - b.priority || b.raisedAt - a.raisedAt)[0], [un])
  const p1 = counts[0] > 0

  // horn: beep once per new unacknowledged P1 alarm (alarms present when the page loads don't count)
  useEffect(() => {
    const ids = new Set(alarms.filter((a) => a.priority === 1 && isUnack(a)).map((a) => a.id))
    if (seen.current && horn && [...ids].some((id) => !seen.current!.has(id))) beep()
    seen.current = ids
  }, [alarms, horn])

  const sd = PLATFORMS.flatMap((p: PlatformId) => {
    const own = shutdowns.filter((s) => s.platform === p)
    const level = platforms?.[p]?.shutdown ?? own.reduce<string | null>((h, s) => h ?? s.level, null)
    if (!level) return []
    const awaiting = own.length > 0 && own.every((s) => s.resetAt !== undefined)
    return [`${p.toUpperCase()} — ${level} ${awaiting ? 'reset · restart' : 'latched'}`]
  })

  if (hmi) return null
  return (
    <div className={`alarm-banner ${top ? `p${top.priority}` : ''} ${p1 ? 'flash' : ''}`} role="status" aria-live="polite" data-banner={p1 ? 'p1' : un.length ? 'unack' : 'clear'}>
      <span className="counts" title="Unacknowledged alarms by priority">
        {counts.map((n, i) => (
          <span key={i} className={`cnt ${n ? '' : 'z'}`}>
            <span className={`prio p${i + 1}`}>{i + 1}</span>
            {n}
          </span>
        ))}
      </span>
      <span className="txt">
        {top ? (
          <>
            <span className="mono">{top.tag}</span>
            {top.text.startsWith(top.tag) ? top.text.slice(top.tag.length).replace(/^[\s—:-]+/, '') : top.text}
            {top.value ? ` · ${top.value}` : ''}
          </>
        ) : (
          <span style={{ color: '#8d9297' }}>No unacknowledged alarms</span>
        )}
      </span>
      {sd.map((t) => (
        <span key={t} className="sd">
          {t}
        </span>
      ))}
      <button onClick={() => top && call('ackAlarm', top.id)} disabled={!top} title="Acknowledge the alarm shown">
        Ack
      </button>
      <button onClick={() => setHmi('alarms')} title="Open the control-room console on the alarm list">
        Open console
      </button>
      <button className={`horn ${horn ? 'on' : ''}`} onClick={() => {
          // create / resume the audio context inside the click: browsers keep a context made without a user gesture suspended
          if (!horn) {
            try {
              audio ??= new AudioContext()
              void audio.resume()
            } catch {
              /* no audio */
            }
          }
          setHorn(!horn)
        }} title={horn ? 'Horn on — beeps on a new priority-1 alarm (click to mute)' : 'Horn muted (click to sound on new priority-1 alarms)'}>
        {horn ? 'Horn on' : 'Horn muted'}
      </button>
    </div>
  )
}
