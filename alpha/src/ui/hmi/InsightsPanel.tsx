/**
 * Insights (sim/insights.ts): the shift headline and the ranked findings, each with the money at stake and
 * a jump to where to act. `InsightsPanel` sits in the console (the 3D view stays clear of KPIs and findings).
 */
import { useMemo, useState } from 'react'
import { AREA_LABEL, useInsights, type Insight, type InsightArea, type InsightKind } from '../../sim/insights'
import { fmtUsd } from '../../sim/assetRisk'
import { useStore } from '../../state/store'
import { fmtClock } from '../../sim/types'
import { pickOf, showIn3D } from './nav'
import './insights.css'

const KIND_LABEL: Record<InsightKind, string> = { act: 'Decide', watch: 'Watch', win: 'Good', info: 'Context' }

function go(x: Insight) {
  const g = x.go
  if (!g) return
  if (g.page && g.page !== useStore.getState().hmi) return useStore.getState().setHmi(g.page)
  const tag = g.tag ?? x.tags[0]
  if (tag && pickOf(tag)) showIn3D(tag)
}

export function InsightsPanel({ max = 8, compact = false }: { max?: number; compact?: boolean }) {
  const list = useInsights((s) => s.list)
  const headline = useInsights((s) => s.headline)
  const [area, setArea] = useState<InsightArea | null>(null)
  const [all, setAll] = useState(false)
  const areas = useMemo(() => [...new Set(list.map((x) => x.area))], [list])
  const shown = useMemo(() => (area ? list.filter((x) => x.area === area) : list), [list, area])
  const counts = useMemo(() => {
    const c: Partial<Record<InsightKind, number>> = {}
    for (const x of list) c[x.kind] = (c[x.kind] ?? 0) + 1
    return c
  }, [list])

  return (
    <section className={`h-box ins ${compact ? 'compact' : ''}`} data-insights="panel">
      <h3>
        <span>Insights: what the data says</span>
        <span className="grow" />
        {(['act', 'watch', 'win'] as InsightKind[]).map((k) =>
          counts[k] ? (
            <span key={k} className={`ins-count k-${k}`}>
              {counts[k]} {KIND_LABEL[k].toLowerCase()}
            </span>
          ) : null,
        )}
        <span className="dim" title="Rules over the simulated plant, finance, condition monitoring, spares and risk; assumed price deck">
          simulated
        </span>
      </h3>
      {headline && <p className="ins-head">{headline}</p>}
      {!compact && areas.length > 1 && (
        <div className="ins-areas">
          <button className={area === null ? 'on' : ''} onClick={() => setArea(null)}>
            All
          </button>
          {areas.map((a) => (
            <button key={a} className={area === a ? 'on' : ''} onClick={() => setArea((x) => (x === a ? null : a))}>
              {AREA_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      {shown.length ? (
        <ol className="ins-list">
          {(all ? shown : shown.slice(0, max)).map((x) => (
            <li key={x.id} className={`ins-item k-${x.kind}`}>
              <div className="ins-tag">
                <span className="ins-kind">{KIND_LABEL[x.kind]}</span>
                <span className="ins-area">{AREA_LABEL[x.area]}</span>
              </div>
              <div className="ins-body">
                <div className="ins-title">{x.title}</div>
                {!compact && <div className="ins-detail">{x.detail}</div>}
              </div>
              <div className="ins-side">
                {x.usdD > 0 && x.area !== 'safety' && (
                  <span className="ins-usd" title="USD per day at stake (assumed price deck)">
                    {fmtUsd(x.usdD)}/d
                  </span>
                )}
                {x.go && (
                  <button onClick={() => go(x)} title={x.go.page ? `Open ${x.go.label}` : 'Show in 3D'}>
                    {x.go.label} →
                  </button>
                )}
                <span className="faint mono" title="First seen (sim clock)">
                  {fmtClock(x.since, false).slice(0, 5)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="h-empty">Nothing stands out: the field is running at potential with no concentrated risk.</div>
      )}
      {!compact && shown.length > max && (
        <button className="link ins-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Show fewer' : `Show all ${shown.length}`}
        </button>
      )}
    </section>
  )
}
