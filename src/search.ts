// Ranked Cmd+K search over components and docs: tiered match, then whole words, then shorter titles.
export interface SearchDoc {
  title: string
  slug: string
  keys?: string[]
  body?: string[]
}

interface Prepared {
  title: string
  words: string[]
  slug: string
  base: string
  keys: string
  body: string
  abbr: string[]
}

export const norm = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const compact = (s: string) => s.replace(/ /g, '')

export function prepare(d: SearchDoc): Prepared {
  const title = norm(d.title)
  const slug = norm(d.slug)
  const abbr = [...d.title.matchAll(/\(([^)]*)\)/g)].map((m) => norm(m[1])).filter(Boolean)
  return { title, words: title.split(' '), slug, base: norm(d.title.replace(/\s*\([^)]*\)/g, '')), keys: `${title} ${slug} ${norm((d.keys ?? []).join(' '))}`, body: norm((d.body ?? []).join(' ')), abbr }
}

const hasWord = (hay: string, w: string) => ` ${hay} `.includes(` ${w} `)
const startsWord = (hay: string, w: string) => ` ${hay}`.includes(` ${w}`)

export function score(p: Prepared, q: string, qw: string[]): [number, number] | null {
  const qc = compact(q)
  const tier =
    q === p.slug || q === p.title || q === p.base || p.abbr.includes(q) || qc === compact(p.slug) || qc === compact(p.title) || qc === compact(p.base)
      ? 1
      : p.title.startsWith(q)
        ? 2
        : qw.every((w) => p.words.some((t) => t.startsWith(w)))
          ? 3
          : qw.every((w) => (w.length >= 4 ? p.title.includes(w) : startsWord(p.title, w)))
            ? 4
            : qw.every((w) => startsWord(p.keys, w))
              ? 5
              : qw.every((w) => startsWord(p.keys, w) || startsWord(p.body, w))
                ? 6
                : 0
  if (!tier) return null
  const hay = tier <= 4 ? p.title : tier === 5 ? p.keys : `${p.keys} ${p.body}`
  return [tier, qw.filter((w) => !hasWord(hay, w)).length]
}

export function rank<T>(pool: T[], prep: (t: T) => Prepared, title: (t: T) => string, query: string, limit = 40): T[] {
  const q = norm(query)
  if (!q) return pool.slice(0, limit)
  const qw = q.split(' ')
  return pool
    .flatMap((t) => {
      const s = score(prep(t), q, qw)
      return s ? [{ t, s, title: title(t) }] : []
    })
    .sort((a, b) => a.s[0] - b.s[0] || a.s[1] - b.s[1] || a.title.length - b.title.length || a.title.localeCompare(b.title))
    .filter((r, _, all) => r.s[0] < 6 || all[0].s[0] > 4)
    .slice(0, limit)
    .map((r) => r.t)
}

export function highlight(title: string, query: string): [number, number][] {
  const q = norm(query)
  if (!q) return []
  const low = title.toLowerCase()
  const alnum = (c: string | undefined) => !!c && /[a-z0-9]/i.test(c)
  const ranges: [number, number][] = []
  for (const w of new Set(q.split(' '))) {
    let at = -1
    for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + 1)) {
      const prev = low[i - 1]
      if (!alnum(prev) || /\d/.test(prev) !== /\d/.test(w[0])) {
        at = i
        break
      }
      if (at < 0) at = i
    }
    if (at >= 0) ranges.push([at, at + w.length])
  }
  ranges.sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const r of ranges) {
    const last = out[out.length - 1]
    if (last && (r[0] <= last[1] || !/[a-z0-9]/i.test(title.slice(last[1], r[0])))) last[1] = Math.max(last[1], r[1])
    else out.push([...r])
  }
  return out
}
