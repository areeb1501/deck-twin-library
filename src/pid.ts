import type { PidEntry, PidLibrary, PidMap } from '../registry/pid/types'
import data from '../registry/pid/pid.json'

const urls = import.meta.glob<string>('../registry/pid/symbols/*.svg', { eager: true, query: '?url', import: 'default' })
const libUrls = import.meta.glob<string>('../registry/pid/library/*.svg', { eager: true, query: '?url', import: 'default' })
const libs = import.meta.glob<PidLibrary>('../registry/pid/library.json', { eager: true, import: 'default' })

export const PID = data as PidMap
export const LIBRARY: PidLibrary = Object.values(libs)[0] ?? { version: 1, categories: [], symbols: [] }

export const symbolUrl = (e?: PidEntry) => (e ? urls[`../registry/pid/symbols/${e.symbol}`] : undefined)
export const librarySymbolUrl = (svg: string) => libUrls[`../registry/pid/library/${svg}`]
