/**
 * Search on the landing page: the same ranking and results as the site's dialog (src/components/Shell.tsx), opened in place
 * so ⌘K doesn't leave the page. The component index is large, so it's fetched on first use. Picking a hit is a normal link.
 */
import { DOCS } from '../../src/pages/docList'
import { highlight, prepare, rank } from '../../src/search'

interface Hit {
  href: string
  label: string
  hint: string
  thumb: string
  prep: ReturnType<typeof prepare>
}
interface RegistryIndex {
  categories: { id: string; title: string }[]
  items: { name: string; title: string; category: string; description: string; standards: string[]; vendors?: string[]; tags?: string[] }[]
}

const dialog = document.querySelector<HTMLDialogElement>('.search')!
const input = dialog.querySelector('input')!
const list = dialog.querySelector<HTMLElement>('.search-hits')!

let pool: Hit[] = DOCS.map((d) => ({ href: `/docs/${d.slug}`, label: d.title, hint: 'Docs', thumb: '', prep: prepare({ title: d.title, slug: d.slug, keys: ['docs'] }) }))
let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
let hits: Hit[] = []
let active = 0

async function load() {
  if (state === 'loading' || state === 'ready') return
  state = 'loading'
  try {
    const res = await fetch('/r/index.json')
    if (!res.ok) throw new Error(`index ${res.status}`)
    const { categories, items } = (await res.json()) as RegistryIndex
    pool = [
      ...pool,
      ...items.map((i) => ({
        href: `/components/${i.name}`,
        label: i.title,
        hint: categories.find((c) => c.id === i.category)?.title ?? i.category,
        thumb: `/thumbs/${i.name}.webp`,
        prep: prepare({ title: i.title, slug: i.name, keys: [i.category, ...(i.tags ?? []), ...i.standards], body: [i.description, ...(i.vendors ?? [])] }),
      })),
    ]
    state = 'ready'
  } catch {
    state = 'failed'
  }
  render()
}

function label(text: string, q: string) {
  const out = document.createElement('span')
  out.className = 'search-label'
  let at = 0
  for (const [a, b] of highlight(text, q)) {
    const mark = document.createElement('mark')
    mark.textContent = text.slice(a, b)
    out.append(text.slice(at, a), mark)
    at = b
  }
  out.append(text.slice(at))
  return out
}

function row(h: Hit, i: number, q: string) {
  const a = document.createElement('a')
  a.href = h.href
  a.className = 'search-hit'
  a.addEventListener('mousemove', () => select(i))
  let art: HTMLElement
  if (h.thumb) {
    const img = document.createElement('img')
    img.src = h.thumb
    img.alt = ''
    img.addEventListener('error', () => (img.style.visibility = 'hidden'))
    art = img
  } else {
    art = document.createElement('span')
    art.textContent = 'doc'
  }
  art.classList.add('search-art')
  const hint = document.createElement('span')
  hint.className = 'search-hint'
  hint.textContent = h.hint
  a.append(art, label(h.label, q), hint)
  return a
}

function select(i: number) {
  if (i === active) return
  list.children[active]?.classList.remove('on')
  active = i
  list.children[active]?.classList.add('on')
  list.children[active]?.scrollIntoView({ block: 'nearest' })
}

function render() {
  const q = input.value
  hits = rank(pool, (h) => h.prep, (h) => h.label, q)
  active = 0
  list.replaceChildren(...hits.map((h, i) => row(h, i, q)))
  list.children[0]?.classList.add('on')
  if (hits.length) return
  const note = document.createElement('div')
  note.className = 'search-note'
  note.textContent = state === 'failed' ? "Couldn't load the components. Close this and try again." : state === 'ready' ? 'No results.' : 'Loading components'
  list.replaceChildren(note)
}

function open() {
  void load()
  render()
  dialog.showModal()
  input.select()
}

export function initSearch(button: HTMLElement) {
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (dialog.open) dialog.close()
      else open()
    }
  })
  button.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    open()
  })
  // a head start, so the list is usually full by the time the dialog opens
  button.addEventListener('pointerenter', () => void load(), { once: true })
  button.addEventListener('focus', () => void load(), { once: true })
  input.addEventListener('input', render)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      select(Math.min(active + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      select(Math.max(active - 1, 0))
    } else if (e.key === 'Enter' && hits[active]) location.href = hits[active].href
  })
  // the box fills the dialog, so a click that lands on the dialog itself is on the backdrop
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close()
  })
}
