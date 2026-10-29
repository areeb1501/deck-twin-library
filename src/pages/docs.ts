export const DOCS = [
  { slug: 'introduction', title: 'Introduction' },
  { slug: 'installation', title: 'Installation' },
  { slug: 'cli', title: 'CLI' },
  { slug: 'assemble', title: 'Assembling plants' },
  { slug: 'agents', title: 'Agent skill' },
  { slug: 'conventions', title: 'Conventions' },
  { slug: 'standards', title: 'Standards & data' },
  { slug: 'contributing', title: 'Adding a component' },
  { slug: 'research', title: 'Research notes' },
] as const

const files = import.meta.glob<string>('../../docs/*.md', { query: '?raw', import: 'default' })

export const loadDoc = (slug: string) => files[`../../docs/${slug}.md`]?.() ?? Promise.resolve(`# Not found\n\nNo page called “${slug}”.`)
