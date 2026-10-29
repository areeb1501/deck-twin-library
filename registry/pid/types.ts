// P&ID link for each component: how it is drawn, how it is tagged, and which datasheet fields set its props.

export interface PidEntry {
  /** symbol file in registry/pid/symbols/ (served at /symbols/<file>) */
  symbol: string
  /** where the symbol convention comes from, e.g. "ISO 10628-2 (X 8017)", "ISA 5.1", "PIP PIC001" */
  standard: string
  /** plain description of the drawn symbol, so an agent can match it on a drawing */
  drawn: string
  /** equipment tag prefixes, e.g. ["V", "D"] for vessels, ["P"] for pumps */
  tags?: string[]
  /** ISA 5.1 identification letters for instruments and actuated valves, e.g. ["PT", "PIT"] or ["LV", "PCV"] */
  isa?: string[]
  /** how to tell this apart from look-alikes */
  notes?: string
  /** datasheet the item is specified on, and which of its fields map to which props */
  datasheet?: { form: string; fields: Record<string, string> }
}

export type PidMap = Record<string, PidEntry>

/** Extended P&ID legend: every common symbol, physical or not, linked to a component where one exists. */
export interface LibrarySymbol {
  id: string
  name: string
  category: string
  svg: string
  standard: string
  drawn: string
  meaning: string
  variants?: string[]
  component?: string
  physical: boolean
  tags?: string[]
  isa?: string[]
}

export interface PidLibrary {
  version: 1
  categories: { id: string; title: string }[]
  symbols: LibrarySymbol[]
}
