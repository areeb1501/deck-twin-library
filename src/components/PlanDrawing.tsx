// The home hero's first frame: the plant as a plan drawing, with real P&ID symbols on the routes <Plant> builds. Prerendered, so it stands without JavaScript or WebGL.
import { PLAN, SHEET } from '../viewer/plan'

const SKIP = new Set(['pipe-rack'])
const QUIET = new Set(['pressure-safety-valve', 'tee'])
const MIN_SYMBOL = 2.6
/** where an end label sits against its line, so neighbours don't collide */
const END_AT: Record<string, { dx?: number; dz?: number; anchor?: 'start' | 'end' }> = {
  'CM SUPPLY': { dx: -0.6, dz: 2.6, anchor: 'end' },
  'CM RETURN': { dx: 0.6, dz: 2.6, anchor: 'start' },
  'CLOSED DRAIN': { dx: 0.7, dz: 3, anchor: 'start' },
  'FLARE HEADER': { dx: -0.6, dz: 2.6, anchor: 'end' },
  'PRODUCED WATER': { dx: 0.7, dz: 0.2, anchor: 'start' },
}

export function PlanDrawing({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={`${SHEET.cx - SHEET.w / 2} ${SHEET.cz - SHEET.h / 2} ${SHEET.w} ${SHEET.h}`} className={className} role="img" aria-label={`Plan drawing of the separation train, ${PLAN.items.length} items joined by ${PLAN.lines.length} lines`}>
      {PLAN.lines.map((l) => (
        <polyline key={l.tag} points={l.path.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="0.16" strokeLinejoin="miter" />
      ))}
      {PLAN.items
        .filter((it) => !SKIP.has(it.component))
        .map((it) => {
          const w = Math.max(it.w, MIN_SYMBOL)
          const d = Math.max(it.d, MIN_SYMBOL)
          return (
            <g key={it.tag}>
              {it.symbol && <image href={it.symbol} x={it.x - w / 2} y={it.z - d / 2} width={w} height={d} preserveAspectRatio="xMidYMid meet" />}
              {!QUIET.has(it.component) && (
                <text x={it.x} y={it.z + d / 2 + 1.5} textAnchor="middle" className="plan-tag">
                  {it.tag}
                </text>
              )}
            </g>
          )
        })}
      {PLAN.ends.map((e) => {
        const at = END_AT[e.label]
        return (
          <text key={e.label} x={e.x + (at?.dx ?? 0)} y={e.z - 0.7 + (at?.dz ?? 0)} textAnchor={at?.anchor ?? (e.x > 0 ? 'end' : 'start')} className="plan-end">
            {e.label}
          </text>
        )
      })}
    </svg>
  )
}
