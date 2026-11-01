/**
 * Who sees which console tab. Account type (sign-up user, system admin, super admin) decides what someone may do;
 * the console view decides what they see. `database/seed.sql` holds the same lists, and tests/database.test.ts
 * keeps the two equal.
 */
export type ConsoleArea = 'operations' | 'safety' | 'integrity' | 'commercial' | 'admin'

/** tab order. `key` is the store's hmi page and the tab's data-page; `title` is the full name, shown on hover */
export const CONSOLE_PAGES = [
  { key: 'dashboard', label: 'Dashboard', title: 'Field dashboard', area: 'operations' },
  { key: 'overview', label: 'Overview', title: 'Plant overview', area: 'operations' },
  { key: 'process', label: 'Process', title: 'Process graphics', area: 'operations' },
  { key: 'alarms', label: 'Alarms', title: 'Alarm summary', area: 'operations' },
  { key: 'shutdown', label: 'Shutdown', title: 'ESD and shutdown', area: 'operations' },
  { key: 'trends', label: 'Trends', title: 'Historian trends', area: 'operations' },
  { key: 'machines', label: 'Machines', title: 'Rotating equipment', area: 'operations' },
  { key: 'cranes', label: 'Cranes', title: 'Lifting operations and weather', area: 'operations' },
  { key: 'handover', label: 'Handover', title: 'Shift handover', area: 'operations' },
  { key: 'fg', label: 'F&G', title: 'Fire and gas', area: 'safety' },
  { key: 'response', label: 'Response', title: 'Incident response', area: 'safety' },
  { key: 'risk', label: 'Risk', title: 'Risk and what-if', area: 'safety' },
  { key: 'cctv', label: 'CCTV', title: 'CCTV and PPE', area: 'safety' },
  { key: 'alerts', label: 'Alerts', title: 'Alerts and assistant', area: 'safety' },
  { key: 'scenarios', label: 'Scenarios', title: 'Training scenarios', area: 'safety' },
  { key: 'maintenance', label: 'Maintenance', title: 'Maintenance and permits', area: 'integrity' },
  { key: 'inspection', label: 'Inspections', title: 'Inspections and corrosion', area: 'integrity' },
  { key: 'economics', label: 'Economics', title: 'Asset and economics', area: 'commercial' },
  { key: 'spares', label: 'Spares', title: 'Spares and logistics', area: 'commercial' },
  { key: 'instructor', label: 'Instructor', title: 'Instructor station', area: 'admin' },
] as const satisfies readonly { key: string; label: string; title: string; area: ConsoleArea }[]

export type ConsolePage = (typeof CONSOLE_PAGES)[number]['key']
export type ConsoleViewKey = 'all' | 'operations' | 'finance' | 'hse'

export interface ConsoleView {
  key: ConsoleViewKey
  label: string
  description: string
  /** the tab this view opens on */
  home: ConsolePage
  pages: readonly ConsolePage[]
}

export const CONSOLE_VIEWS: readonly ConsoleView[] = [
  { key: 'all', label: 'System admin', description: 'Every tab', home: 'dashboard', pages: CONSOLE_PAGES.map((p) => p.key) },
  {
    key: 'operations',
    label: 'Operator',
    description: 'Control room and HSE manager',
    home: 'dashboard',
    pages: ['dashboard', 'overview', 'process', 'alarms', 'shutdown', 'trends', 'machines', 'cranes', 'handover', 'fg', 'response', 'alerts', 'scenarios', 'maintenance'],
  },
  {
    key: 'finance',
    label: 'Finance',
    description: 'Revenue and finance',
    home: 'economics',
    pages: ['dashboard', 'trends', 'maintenance', 'economics', 'spares'],
  },
  {
    key: 'hse',
    label: 'HSE',
    description: 'Safety and HSE teams',
    home: 'dashboard',
    pages: ['dashboard', 'alarms', 'shutdown', 'handover', 'fg', 'response', 'risk', 'cctv', 'alerts', 'scenarios', 'maintenance', 'inspection'],
  },
]

export const viewOf = (key: string | null | undefined) => CONSOLE_VIEWS.find((v) => v.key === key) ?? CONSOLE_VIEWS[0]

/** the view's tabs in console order */
export const pagesOf = (view: ConsoleView) => CONSOLE_PAGES.filter((p) => view.pages.includes(p.key))
