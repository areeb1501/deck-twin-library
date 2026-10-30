/**
 * Guided tour player: the narration card along the bottom of the view — stop title, where you are,
 * what you're looking at, live numbers — with back / play-pause / next, a stop strip to jump around,
 * 1× / 2× speed and exit. The tour itself runs in tour/engine.ts.
 */
import { useEffect } from 'react'
import { useSim } from '../state/sim'
import { exitTour, goTo, next, prev, say, setRate, togglePlay, useTour } from '../tour/engine'

export function TourPlayer() {
  const t = useTour()
  useSim((s) => s.t) // live numbers in the narration
  // Esc leaves the tour (before anything else in the app sees it); space plays / pauses
  useEffect(() => {
    if (!t.on) return
    const key = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        exitTour()
      } else if (e.key === ' ') {
        // not also a click on whatever button has focus (the toolbar's End tour, say)
        e.preventDefault()
        e.stopImmediatePropagation()
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        togglePlay()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [t.on])
  if (!t.on) return null
  const stop = t.stops[t.i]
  if (!stop) return null
  return (
    <div className="tour" role="region" aria-label="Guided tour">
      <div className="tour-head">
        <span className="tour-badge">Guided tour</span>
        <span className="muted small">
          {t.i + 1} / {t.stops.length} · {stop.where}
        </span>
        <button className="icon tour-x" onClick={exitTour} title="Leave the tour (Esc)">
          ×
        </button>
      </div>
      <div className="tour-title">{t.done ? 'Tour complete' : stop.title}</div>
      <p className="tour-say">{say(stop.say)}</p>
      {t.line && !t.done && <p className="tour-line">{t.line}</p>}
      {t.takenOver && (
        <p className="tour-line muted">
          You have the controls — walk and look around. <b>Resume</b> carries on from here.
        </p>
      )}
      <div className="tour-strip">
        {t.stops.map((s, i) => (
          <button key={s.id} className={`tour-dot ${i < t.i || t.done ? 'past' : ''} ${i === t.i && !t.done ? 'on' : ''}`} onClick={() => goTo(i)} title={s.title}>
            {i === t.i && !t.done && <i style={{ width: `${Math.round(t.progress * 100)}%` }} />}
          </button>
        ))}
      </div>
      <div className="tour-ctl">
        <button onClick={prev} disabled={t.i === 0} title="Previous stop">
          ◀ Back
        </button>
        <button className="tour-play" onClick={togglePlay} title="Play / pause (space)">
          {t.done ? 'Restart' : t.playing ? '❚❚ Pause' : t.takenOver ? '▶ Resume' : '▶ Play'}
        </button>
        <button onClick={next} disabled={t.done} title="Next stop">
          Next ▶
        </button>
        <span className="tour-rate seg">
          {([1, 2] as const).map((r) => (
            <button key={r} className={t.rate === r ? 'on' : ''} onClick={() => setRate(r)}>
              {r}×
            </button>
          ))}
        </span>
      </div>
    </div>
  )
}
