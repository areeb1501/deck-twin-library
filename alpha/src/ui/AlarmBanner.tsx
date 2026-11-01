/**
 * Always-visible alarm banner (top centre, under the toolbar: viewer and walk mode). With nothing to act on
 * it is a quiet "No active alarms" pill. Otherwise it widens to the unacknowledged alarms by priority, the
 * newest highest-priority one, the latched platform shutdowns, Ack and Console. Flashes while an unacknowledged
 * priority-1 alarm exists.
 *
 * Under it runs the alarm line a control room sees (ISA-18.2 style): sim time, priority, tag, condition and zone in
 * the order they came in, the first-out marked, and a click flies to the tag. A general alarm adds the platform
 * announcement. The horn (muted by default) beeps on a new P1 alarm and sounds the PAGA tone of the general alarm:
 * a slow two-tone for gas, a yelp for fire, interrupted for muster, a steady tone for abandon.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { fmtClock, type Alarm, type PlatformId, type PlatformResult, type Shutdown } from '../sim/types'
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

type Ga = PlatformResult['ga']
const GA_RANK: Ga[] = ['normal', 'gas', 'fire', 'muster', 'abandon']
const GA_TEXT: Record<Exclude<Ga, 'normal'>, string> = {
  gas: 'gas detected. Stop hot work, stand by for instructions',
  fire: 'fire confirmed. Stop work, go to your muster station',
  muster: 'muster. Go to your muster station and report to the coxswain',
  abandon: 'abandon platform. Go to the lifeboats',
}

/** the PAGA tone for a general alarm: one oscillator, retuned on a schedule until it is stopped */
function pagaTone(ga: Exclude<Ga, 'normal'>) {
  try {
    audio ??= new AudioContext()
    const ctx = audio
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    g.gain.value = 0.035
    o.type = 'sawtooth'
    o.connect(g).connect(ctx.destination)
    o.start()
    let on = false
    const id = setInterval(() => {
      on = !on
      const t = ctx.currentTime
      if (ga === 'gas') o.frequency.setValueAtTime(on ? 440 : 554, t)
      else if (ga === 'fire') {
        o.frequency.setValueAtTime(600, t)
        o.frequency.linearRampToValueAtTime(1200, t + 0.34)
      } else if (ga === 'muster') {
        o.frequency.setValueAtTime(800, t)
        g.gain.setValueAtTime(on ? 0.035 : 0, t)
      } else o.frequency.setValueAtTime(980, t)
    }, ga === 'gas' ? 900 : ga === 'fire' ? 350 : 700)
    return () => {
      clearInterval(id)
      g.gain.value = 0
      o.stop()
      o.disconnect()
    }
  } catch {
    return () => undefined
  }
}

const bodyOf = (a: Alarm) => (a.text.startsWith(a.tag) ? a.text.slice(a.tag.length).replace(/^[\s—:-]+/, '') : a.text)

/** the alarm line: unacknowledged alarms oldest first, so the first-out stays on top while the rest pile in */
function AlarmLine({ alarms }: { alarms: Alarm[] }) {
  const requestFocus = useStore((s) => s.requestFocus)
  const list = useMemo(() => [...alarms].sort((a, b) => a.raisedAt - b.raisedAt || a.priority - b.priority), [alarms])
  const shown = list.slice(0, 5)
  return (
    <ol className="alarm-line" aria-label="Alarm line, oldest first">
      {shown.map((a, i) => (
        <li key={a.id} className={`p${a.priority}`}>
          <button onClick={() => requestFocus(a.tag)} title={`Fly to ${a.tag}`}>
            <time>{fmtClock(a.raisedAt, false)}</time>
            <span className={`prio p${a.priority}`}>{a.priority}</span>
            <span className="tag">{a.tag}</span>
            <span className="cond">{bodyOf(a)}</span>
            {a.value && <span className="val">{a.value}</span>}
            {a.zone && <span className="zone">{a.zone}</span>}
            {i === 0 && <span className="first">First out</span>}
          </button>
        </li>
      ))}
      {list.length > shown.length && <li className="more">{list.length - shown.length} more on the console</li>}
    </ol>
  )
}

export function AlarmBanner() {
  const alarms = (useS((s) => s.alarms) ?? EMPTY_ARR) as Alarm[]
  const shutdowns = (useS((s) => s.shutdowns) ?? EMPTY_ARR) as Shutdown[]
  const platforms = useS((s) => s.result?.platforms)
  const hmi = useStore((s) => s.hmi)
  const setHmi = useStore((s) => s.setHmi)
  const [horn, setHorn] = useState(false)
  const seen = useRef<Set<string> | null>(null)
  const gaNow = PLATFORMS.reduce<{ p: PlatformId; ga: Ga } | null>((top, p: PlatformId) => {
    const ga = platforms?.[p]?.ga ?? 'normal'
    return GA_RANK.indexOf(ga) > GA_RANK.indexOf(top?.ga ?? 'normal') ? { p, ga } : top
  }, null)
  const ga = gaNow?.ga

  // the PAGA tone follows the worst general alarm while the horn is on
  useEffect(() => {
    if (!horn || !ga || ga === 'normal' || hmi) return
    return pagaTone(ga)
  }, [horn, ga, hmi])

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
    return [`${p.toUpperCase()}: ${level} ${awaiting ? 'reset · restart' : 'latched'}`]
  })

  if (hmi) return null
  const hornBtn = (
    <button
      className={`horn ${horn ? 'on' : ''}`}
      onClick={() => {
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
      }}
      aria-label={horn ? 'Horn on' : 'Horn muted'}
      title={horn ? 'Horn on: priority-1 alarms and the general alarm sound (click to mute)' : 'Horn muted (click to sound priority-1 alarms and the general alarm)'}
    >
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d="M2.5 6h2.5L8.5 3v10L5 10H2.5Z" />
        {horn ? <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" /> : <path d="m11 6 4 4m0-4-4 4" />}
      </svg>
    </button>
  )
  if (!top && !sd.length)
    return (
      <div className="alarm-banner clear" role="status" aria-live="polite" data-banner="clear">
        <span className="ab-dot" />
        <span className="txt">No active alarms</span>
        <button className="ab-link" onClick={() => setHmi('alarms')} title="Open the control-room console on the alarm list">
          Console
        </button>
        {hornBtn}
      </div>
    )
  return (
    <div className="alarm-stack">
    <div className={`alarm-banner ${top ? `p${top.priority}` : 'sd-only'} ${p1 ? 'flash' : ''}`} role="status" aria-live="polite" data-banner={p1 ? 'p1' : un.length ? 'unack' : 'clear'}>
      {un.length > 0 && (
        <span className="counts" title="Unacknowledged alarms by priority">
          {counts.map((n, i) =>
            n ? (
              <span key={i} className="cnt">
                <span className={`prio p${i + 1}`}>{i + 1}</span>
                {n}
              </span>
            ) : null,
          )}
        </span>
      )}
      <span className="txt">
        {top ? (
          <>
            <span className="mono">{top.tag}</span>
            {bodyOf(top)}
            {top.value ? ` · ${top.value}` : ''}
          </>
        ) : (
          <span className="dim">All alarms acknowledged</span>
        )}
      </span>
      {sd.map((t) => (
        <span key={t} className="sd">
          {t}
        </span>
      ))}
      {top && (
        <button className="ab-ack" onClick={() => call('ackAlarm', top.id)} title="Acknowledge the alarm shown">
          Ack
        </button>
      )}
      <button className="ab-link" onClick={() => setHmi('alarms')} title="Open the control-room console on the alarm list">
        Console
      </button>
      {hornBtn}
    </div>
    {gaNow && ga && ga !== 'normal' && (
      <p className={`alarm-ga ${ga}`} role="alert">
        <b>General alarm, {gaNow.p}:</b> {GA_TEXT[ga]}
      </p>
    )}
    {un.length > 0 && <AlarmLine alarms={un} />}
    </div>
  )
}
