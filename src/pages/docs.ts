export { DOCS } from './docList'

const files = import.meta.glob<string>('../../docs/*.md', { query: '?raw', import: 'default', eager: true })

export const docSource = (slug: string) => files[`../../docs/${slug}.md`] ?? ''
