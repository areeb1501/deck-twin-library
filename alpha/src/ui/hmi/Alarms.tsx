/**
 * Alarms: the ISA-18.2 alarm list — sortable, filterable by platform / priority / state — with
 * Ack, Ack page, Shelve 15 / 60 min and Unshelve, plus the alarm-system KPIs (rate per 10 min,
 * standing, shelved, flood). A tag click selects the item in 3D and closes the console.
 */
import { useMemo, useState } from 'react'
import { fmtClock, type Alarm, type PlatformId } from '../../sim/types'
import { EMPTY_ARR, call, fmt, useS } from './simApi'
import { Box, Kpi, Msg, Prio, TagLink } from './common'

type SortKey = 'time' | 'prio' | 'tag' | 'state' | 'platform'
const PAGE = 40
const STATE_LABEL: Record<Alarm['state'], string> = { unack: 'UNACK', ack: 'ACK', rtnUnack: 'RTN UNACK', shelved: 'SHELVED' }
const STATE_RANK: Record<Alarm['state'], number> = { unack: 0, rtnUnack: 1, ack: 2, shelved: 3 }

export function Alarms() {
  const alarms = (useS((s) => s.alarms) ?? EMPTY_ARR) as Alarm[]
  const t = useS((s) => s.t) ?? 0
  const rateK = useS((s) => s.kpis?.alarmRate)
  const [plat, setPlat] = useState<'all' | PlatformId>('all')
  const [prio, setPrio] = useState<0 | 1 | 2 | 3>(0)
  const [show, setShow] = useState<'all' | 'unack' | 'active' | 'shelved'>('all')
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: 'time', desc: true })
  const [page, setPage] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)

  const rows = useMemo(() => {
    const f = alarms.filter(
      (a) =>
        (plat === 'all' || a.platform === plat) &&
        (!prio || a.priority === prio) &&
        (show === 'all' || (show === 'unack' ? a.state === 'unack' || a.state === 'rtnUnack' : show === 'active' ? a.active && a.state !== 'shelved' : a.state === 'shelved')),
    )
    const dir = sort.desc ? -1 : 1
    const key = (a: Alarm): number | string =>
      sort.k === 'time' ? a.raisedAt : sort.k === 'prio' ? a.priority : sort.k === 'tag' ? a.tag : sort.k === 'state' ? STATE_RANK[a.state] ?? 9 : a.platform
    return [...f].sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      const c = ka < kb ? -1 : ka > kb ? 1 : 0
      return c * dir || b.raisedAt - a.raisedAt
    })
  }, [alarms, plat, prio, show, sort])

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pg = Math.min(page, pages - 1)
  const view = rows.slice(pg * PAGE, pg * PAGE + PAGE)
  const unackOnPage = view.filter((a) => a.state === 'unack' || a.state === 'rtnUnack')

  const counts = useMemo(() => {
    const standing = alarms.filter((a) => a.active && a.state !== 'shelved').length
    const unack = alarms.filter((a) => a.state === 'unack' || a.state === 'rtnUnack').length
    const shelved = alarms.filter((a) => a.state === 'shelved').length
    const recent = alarms.filter((a) => a.raisedAt >= t - 600).length
    const byP = [1, 2, 3].map((p) => alarms.filter((a) => a.priority === p && a.active && a.state !== 'shelved').length)
    return { standing, unack, shelved, recent, byP }
  }, [alarms, t])
  const rate = typeof rateK === 'number' ? rateK : counts.recent
  const flood = rate >= 10

  const head = (k: SortKey, label: string) => (
    <th className="sort" onClick={() => setSort((s) => ({ k, desc: s.k === k ? !s.desc : k === 'time' }))}>
      {label}
      {sort.k === k ? (sort.desc ? ' ▾' : ' ▴') : ''}
    </th>
  )
  const run = (r: string | null, ok: string) => setMsg(r ?? `✓ ${ok}`)

  return (
    <div className="h-grid">
      <div className="h-filters">
        <label>
          Platform
          <span className="seg2">
            {(['all', 'Alpha', 'WHP-N', 'LQ'] as const).map((p) => (
              <button key={p} className={plat === p ? 'on' : ''} onClick={() => (setPlat(p), setPage(0))}>
                {p === 'all' ? 'All' : p}
              </button>
            ))}
          </span>
        </label>
        <label>
          Priority
          <span className="seg2">
            {([0, 1, 2, 3] as const).map((p) => (
              <button key={p} className={prio === p ? 'on' : ''} onClick={() => (setPrio(p), setPage(0))}>
                {p ? `P${p}` : 'All'}
              </button>
            ))}
          </span>
        </label>
        <label>
          Show
          <span className="seg2">
            {(['all', 'unack', 'active', 'shelved'] as const).map((p) => (
              <button key={p} className={show === p ? 'on' : ''} onClick={() => (setShow(p), setPage(0))}>
                {p === 'all' ? 'All' : p === 'unack' ? 'Unacked' : p === 'active' ? 'Standing' : 'Shelved'}
              </button>
            ))}
          </span>
        </label>
        <span style={{ flex: 1 }} />
        <button onClick={() => (unackOnPage.forEach((a) => call('ackAlarm', a.id)), setMsg(unackOnPage.length ? `✓ Acknowledged ${unackOnPage.length} on this page` : 'Nothing to acknowledge on this page'))} disabled={!unackOnPage.length} data-act="ack-page">
          Ack page ({unackOnPage.length})
        </button>
        <button onClick={() => run(call('ackAll'), 'Acknowledged all')} disabled={!counts.unack}>
          Ack all
        </button>
      </div>

      <Box title={`Alarm list: ${rows.length} of ${alarms.length}`} right={pages > 1 ? <Pager pg={pg} pages={pages} set={setPage} /> : null}>
        {view.length === 0 ? (
          <div className="h-empty">{alarms.length ? 'No alarms match the filter.' : 'No alarms. The plant is in normal operation.'}</div>
        ) : (
          <table className="h-tbl" data-tbl="alarms">
            <thead>
              <tr>
                {head('time', 'Time')}
                {head('prio', 'Pri')}
                {head('tag', 'Tag')}
                <th>Description</th>
                <th>Value</th>
                {head('state', 'State')}
                {head('platform', 'Platform')}
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {view.map((a) => (
                <tr key={a.id} className={`al ${a.state} p${a.priority} ${a.active ? '' : 'inactive'}`} data-alarm={a.id}>
                  <td className="mono">{fmtClock(a.raisedAt)}</td>
                  <td>
                    <Prio p={a.priority} />
                  </td>
                  <td>
                    <TagLink tag={a.tag} />
                  </td>
                  <td className="wrap">
                    {a.text}
                    {a.zone && <span className="dim"> · {a.zone}</span>}
                  </td>
                  <td className="mono">{a.value ?? ''}</td>
                  <td>
                    <span className={`st ${a.state}`}>{STATE_LABEL[a.state] ?? a.state}</span>
                    {a.state === 'shelved' && a.shelvedUntil !== undefined && <span className="dim mono"> → {fmtClock(a.shelvedUntil, false)}</span>}
                    {!a.active && a.state !== 'shelved' && <span className="dim"> · cleared</span>}
                  </td>
                  <td className="dim">{a.platform}</td>
                  <td className="act">
                    {(a.state === 'unack' || a.state === 'rtnUnack') && (
                      <button onClick={() => run(call('ackAlarm', a.id), `Acknowledged ${a.tag}`)} data-act="ack">
                        Ack
                      </button>
                    )}
                    {a.state === 'shelved' ? (
                      <button onClick={() => run(call('unshelve', a.id), `Unshelved ${a.tag}`)} data-act="unshelve">
                        Unshelve
                      </button>
                    ) : (
                      <>
                        <button onClick={() => run(call('shelve', a.id, 15), `Shelved ${a.tag} for 15 min`)} data-act="shelve15" title="Shelve for 15 minutes">
                          Shelve 15
                        </button>
                        <button onClick={() => run(call('shelve', a.id, 60), `Shelved ${a.tag} for 60 min`)} data-act="shelve60" title="Shelve for 60 minutes">
                          60
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Msg text={msg} />
      </Box>

      <Box title="Alarm system performance (ISA-18.2 / EEMUA 191)">
        <div className="h-kpis">
          <Kpi label="Alarm rate" value={fmt(rate)} unit="/ 10 min" abn={rate >= 2} bad={flood} title="Target ≤ 1 per 10 min; ≥ 10 per 10 min is a flood" />
          <Kpi label="Standing alarms" value={String(counts.standing)} abn={counts.standing >= 10} />
          <Kpi label="Unacknowledged" value={String(counts.unack)} abn={counts.unack > 0} />
          <Kpi label="Shelved" value={String(counts.shelved)} abn={counts.shelved > 0} />
          <Kpi label="Standing P1 / P2 / P3" value={counts.byP.join(' / ')} bad={counts.byP[0] > 0} />
          <div className="h-kpi">
            <div className="l">Flood</div>
            <div className="n">
              <span className={`h-flood ${flood ? 'on' : ''}`} data-flood={flood ? 'on' : 'off'}>
                {flood ? 'ALARM FLOOD' : 'no flood'}
              </span>
            </div>
          </div>
        </div>
        <p className="h-note" style={{ marginTop: 6 }}>
          Targets: about one alarm per 10 minutes per operator in steady operation; 10 or more in 10 minutes is a flood, and the operator can no longer respond to each one. Shelve nuisance alarms, then
          fix them; a shelved alarm comes back automatically when its shelf time runs out.
        </p>
      </Box>
    </div>
  )
}

function Pager({ pg, pages, set }: { pg: number; pages: number; set: (n: number) => void }) {
  return (
    <span className="h-row" style={{ gap: 4 }}>
      <button onClick={() => set(Math.max(0, pg - 1))} disabled={pg === 0}>
        ‹
      </button>
      <span className="mono">
        {pg + 1} / {pages}
      </span>
      <button onClick={() => set(Math.min(pages - 1, pg + 1))} disabled={pg >= pages - 1}>
        ›
      </button>
    </span>
  )
}
