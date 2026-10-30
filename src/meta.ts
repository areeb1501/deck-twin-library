// Page title and description: set in the browser on navigation, and read by scripts/prerender.ts for the static HTML.
import { useEffect } from 'react'

export interface PageMeta {
  title: string
  description: string
}

const SITE_TITLE = 'Deck Twin: 3D components for oil & gas digital twins'
const MAX_DESCRIPTION = 155

const plain = (text: string) => text.replace(/`|\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
const clip = (text: string) => (text.length <= MAX_DESCRIPTION ? text : `${text.slice(0, MAX_DESCRIPTION).replace(/\s+\S*$/, '')}…`)

let rendered: PageMeta | null = null

export function takePageMeta() {
  const meta = rendered
  rendered = null
  return meta
}

/** Every page calls this once. A null title means the site's own title. */
export function usePageMeta(title: string | null, description: string) {
  const meta = { title: title ? `${title} | Deck Twin` : SITE_TITLE, description: clip(plain(description)) }
  if (typeof window === 'undefined') rendered = meta
  useEffect(() => {
    document.title = meta.title
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
  }, [meta.title, meta.description])
}
