/**
 * Equipment knowledge base: what each thing on the plant is, how it is used in oil & gas, what
 * "good" looks like and what goes wrong. Content lives in the knowledge*.ts files next to this one;
 * this module merges it into KNOWLEDGE and resolves any plant tag (equipment, line, valve,
 * instrument) to the best entry via `knowledgeFor`.
 */
import type { Knowledge } from './knowledgeTypes'
import type { Equipment, Instrument, PipeLine, Plant, Valve } from './types'
import { EQUIPMENT_KNOWLEDGE } from './knowledgeEquipment'
import { UTILITY_KNOWLEDGE } from './knowledgeUtilities'
import { LINE_VALVE_KNOWLEDGE } from './knowledgeLinesValves'
import { INSTRUMENT_KNOWLEDGE } from './knowledgeInstruments'

export const KNOWLEDGE: Record<string, Knowledge> = Object.fromEntries(
  [...EQUIPMENT_KNOWLEDGE, ...UTILITY_KNOWLEDGE, ...LINE_VALVE_KNOWLEDGE, ...INSTRUMENT_KNOWLEDGE].map((k) => [k.id, k]),
)

// ───────────────────────────── equipment ─────────────────────────────

type EqKind = Equipment['kind']
const VESSELS: EqKind[] = ['horizontalVessel', 'verticalVessel']

/**
 * Name rules, most specific first. `kinds` limits a rule to those equipment kinds (omit = any kind,
 * including kinds added later). Matched against the lower-cased equipment name.
 */
const NAME_RULES: { re: RegExp; id: string; kinds?: EqKind[]; except?: EqKind[] }[] = [
  // unmistakable roles, whatever kind they were modelled as
  { re: /crane/, id: 'crane' },
  { re: /multiphase (flow )?meter|\bmpfm\b/, id: 'mpfm' },
  { re: /temporary refuge|safe haven|muster (station|area)/, id: 'temporary-refuge' },
  { re: /desand|sand (separator|trap|cyclone|catcher)/, id: 'desander' },
  { re: /hydrocyclone|\bde-?oil/, id: 'pw-hydrocyclone' },
  { re: /\bbop\b|blow-?out/, id: 'bop' },
  { re: /drilling|derrick|workover rig/, id: 'drilling-rig' },
  { re: /\bpig\b|pigging|launcher/, id: 'pig-trap' },
  { re: /\bhpu\b|hydraulic power|hydraulic control|wellhead control|well control panel/, id: 'wellhead-hpu' },
  { re: /regenerat|reboiler|still column/, id: 'teg-regen' },
  { re: /contactor|absorber|dehydration column/, id: 'teg-contactor' },
  { re: /methanol|\bmeg\b|hydrate inhib/, id: 'methanol-injection' },
  { re: /hypochlorite|electrochlor/, id: 'hypochlorite' },
  { re: /nitrogen|\bn2\b|n₂/, id: 'nitrogen-package' },
  { re: /\bafff\b|foam/, id: 'afff-foam' },
  { re: /chemical|inhibitor|demulsifier|biocide|antifoam|defoamer|scavenger/, id: 'chem-injection' },
  // air
  { re: /air/, id: 'compressor-instrument-air', kinds: ['compressorPackage'] },
  { re: /air receiver|instrument air|plant air|\bia\b/, id: 'ia-receiver', kinds: VESSELS },
  // utility vessels
  { re: /expansion/, id: 'cm-expansion-drum', kinds: VESSELS },
  { re: /diesel|fuel oil|day tank/, id: 'diesel-day-tank', kinds: VESSELS },
  { re: /potable|fresh ?water|drinking/, id: 'potable-water-tank', kinds: VESSELS },
  { re: /potable|fresh ?water|drinking/, id: 'pump-potable-water', kinds: ['pumpPackage'] },
  // fuel gas
  { re: /fuel gas.*(scrubber|knock|\bko\b|separator|drum|filter)/, id: 'fuel-gas-scrubber', except: ['shellTube'] },
  { re: /fuel gas|superheat/, id: 'hx-fuel-gas-superheater', kinds: ['shellTube'] },
  // flare / drains / produced water
  { re: /flare|vent|\bhp ko\b|\blp ko\b/, id: 'flare-ko-drum', kinds: VESSELS },
  { re: /drain/, id: 'closed-drain-drum', kinds: VESSELS },
  { re: /degass|flotation|\bcfu\b|\bigf\b|skim/, id: 'pw-degasser', kinds: VESSELS },
  // separators
  { re: /test sep|test separator|well test/, id: 'sep-test', kinds: VESSELS },
  { re: /\blp\b.*separator|low.?pressure separator|second.?stage|2nd.?stage|stabili[sz]er/, id: 'sep-lp', kinds: VESSELS },
  { re: /inlet separator|slug catcher|inlet (drum|ko)/, id: 'sep-inlet', kinds: VESSELS },
  { re: /separator|3-?phase|three.?phase|free.?water/, id: 'sep-3phase', kinds: VESSELS },
  { re: /scrubber|knock.?out|\bko\b|suction drum/, id: 'suction-scrubber', kinds: VESSELS },
  // heat exchangers
  { re: /seawater|sea water|cooling medium|\bcm\b/, id: 'hx-cm-seawater-cooler', kinds: ['shellTube'] },
  { re: /after.?cooler|gas cooler|inter.?cooler|interstage|discharge cooler/, id: 'hx-gas-aftercooler', kinds: ['shellTube'] },
  { re: /lube|lubricat|seal oil/, id: 'hx-shell-tube', kinds: ['shellTube'] },
  { re: /crude|oil|condensate/, id: 'hx-crude-cooler', kinds: ['shellTube'] },
  // pumps (order: specific services before the generic oil/export rule)
  { re: /produced water|\bpw\b|water injection|reinjection/, id: 'pump-produced-water', kinds: ['pumpPackage'] },
  { re: /drain/, id: 'pump-closed-drain', kinds: ['pumpPackage'] },
  { re: /cooling medium|\bcm\b|circulat|heating medium/, id: 'pump-cooling-medium', kinds: ['pumpPackage'] },
  { re: /seawater|sea water|lift/, id: 'caisson-seawater-lift', kinds: ['pumpPackage'] },
  { re: /fire ?water|jockey/, id: 'caisson-firewater', kinds: ['pumpPackage'] },
  { re: /export|crude|oil|condensate|transfer|booster|shipping/, id: 'pump-crude-export', kinds: ['pumpPackage'] },
  // modules by name (interior is checked first, see moduleId)
  { re: /\bler\b|equipment room|electrical|switch|\bmcc\b|e&i|substation/, id: 'module-ler', kinds: ['module'] },
  { re: /control room|\bccr\b|control building/, id: 'module-ccr', kinds: ['module'] },
  { re: /generator|emergency power/, id: 'module-emergency-generator', kinds: ['module'] },
  { re: /fire ?water|fire pump/, id: 'module-firewater-pump-house', kinds: ['module'] },
  // anything else that names its role (kinds not known today)
  { re: /turbine|\bgtg\b/, id: 'gtg' },
  { re: /transformer/, id: 'transformer' },
  { re: /manifold/, id: 'manifold' },
  { re: /christmas|xmas|wellhead|\btree\b/, id: 'xmas-tree' },
  { re: /air compressor|instrument air/, id: 'compressor-instrument-air' },
  { re: /compressor/, id: 'compressor-export-gas' },
  { re: /fire ?water.*pump|fire pump/, id: 'caisson-firewater' },
  { re: /seawater.*pump|lift pump/, id: 'caisson-seawater-lift' },
  { re: /pump/, id: 'pump-centrifugal' },
  { re: /separator/, id: 'sep-3phase' },
  { re: /scrubber/, id: 'suction-scrubber' },
  { re: /exchanger|cooler|heater/, id: 'hx-shell-tube' },
  { re: /generator/, id: 'module-emergency-generator' },
  { re: /tank|drum|vessel|receiver/, id: 'vessel-horizontal', except: VESSELS },
  { re: /skid|package|panel|unit/, id: 'chem-skid' },
]

/** Kinds whose role is fixed by the kind itself — checked before any name rule. */
function fixedKindId(e: Equipment): string | null {
  switch (e.kind) {
    case 'xmasTree':
      return e.wellType === 'waterInjector' || e.wellType === 'suspended' ? 'xmas-tree-injector' : 'xmas-tree'
    case 'gasTurbineGenerator':
      return 'gtg'
    case 'transformer':
      return 'transformer'
    case 'manifold':
      return 'manifold'
    case 'pigTrap':
      return 'pig-trap'
    case 'caissonPump':
      return e.system === 'safety' || /fire/i.test(e.name) || e.driver === 'diesel' ? 'caisson-firewater' : 'caisson-seawater-lift'
    case 'proxy': {
      // role may grow (crane, …) — known roles here, others fall to the name rules
      const role = e.role as string
      if (role === 'bop') return 'bop'
      if (role === 'drillingRig') return 'drilling-rig'
      if (role === 'crane') return 'crane'
      return null
    }
    case 'module':
      if (/temporary refuge|safe haven/i.test(e.name)) return 'temporary-refuge'
      switch (e.interior) {
        case 'switchgear':
          return 'module-ler'
        case 'controlRoom':
          return 'module-ccr'
        case 'generator':
          return 'module-emergency-generator'
        case 'pumpHouse':
          return /fire/i.test(e.name) || e.system === 'safety' ? 'module-firewater-pump-house' : null
        default:
          return null
      }
    default:
      return null
  }
}

/** Generic fallback per kind when no name rule matched. */
const KIND_FALLBACK: Partial<Record<string, string>> = {
  horizontalVessel: 'vessel-horizontal',
  verticalVessel: 'vessel-vertical',
  shellTube: 'hx-shell-tube',
  pumpPackage: 'pump-centrifugal',
  compressorPackage: 'compressor-export-gas',
  chemSkid: 'chem-skid',
  module: 'module-generic',
  caissonPump: 'caisson-seawater-lift',
  manifold: 'manifold',
  xmasTree: 'xmas-tree',
  pigTrap: 'pig-trap',
  gasTurbineGenerator: 'gtg',
  transformer: 'transformer',
}

export function equipmentKnowledgeId(e: Equipment): string | null {
  const fixed = fixedKindId(e)
  if (fixed) return fixed
  const name = (e.name ?? '').toLowerCase()
  const kind = e.kind as EqKind
  for (const r of NAME_RULES) if ((!r.kinds || r.kinds.includes(kind)) && !r.except?.includes(kind) && r.re.test(name)) return r.id
  return KIND_FALLBACK[kind] ?? null
}

// ───────────────────────────── lines ─────────────────────────────

/** ISO line number service codes (SIZE-CODE-SEQ-SPEC-INS) → entry. Checked before `service`. */
const LINE_CODE: Record<string, string> = {
  PM: 'line-multiphase',
  WI: 'line-water-injection',
  WF: 'line-multiphase',
  PO: 'line-oil',
  PC: 'line-oil', // condensate
  PL: 'line-oil',
  PG: 'line-gas',
  GL: 'line-gas', // gas lift
  FG: 'line-fuel-gas',
  FL: 'line-flare',
  HF: 'line-flare',
  LF: 'line-flare',
  VA: 'line-vent',
  VT: 'line-vent',
  SW: 'line-seawater',
  UW: 'line-utility-water',
  WU: 'line-utility-water',
  DW: 'line-potable-water',
  FWP: 'line-potable-water',
  CM: 'line-cooling',
  HM: 'line-cooling',
  FW: 'line-firewater',
  CI: 'line-chemical',
  CH: 'line-chemical',
  MI: 'line-methanol',
  ME: 'line-methanol',
  TG: 'line-teg',
  GY: 'line-teg',
  CD: 'line-closed-drain',
  OD: 'line-open-drain',
  DO: 'line-open-drain',
  IA: 'line-instrument-air',
  PA: 'line-instrument-air',
  NG: 'line-nitrogen',
  NI: 'line-nitrogen',
  N2: 'line-nitrogen',
  DF: 'line-diesel',
  DS: 'line-diesel',
}

const LINE_SERVICE: Record<PipeLine['service'], string> = {
  multiphase: 'line-multiphase',
  oil: 'line-oil',
  gas: 'line-gas',
  water: 'line-produced-water',
  flare: 'line-flare',
  cooling: 'line-cooling',
  firewater: 'line-firewater',
  chemical: 'line-chemical',
  drain: 'line-closed-drain',
  instrumentAir: 'line-instrument-air',
}

/** The service code segment of an ISO line number, e.g. 10"-PG-1101-C3A-N → "PG" (null if not that format). */
export function lineCode(tag: string): string | null {
  const m = /^[\d.\s/"″']+(?:in)?-([A-Z][A-Z0-9]{0,3})-/i.exec(tag.trim())
  return m ? m[1].toUpperCase() : null
}

export function lineKnowledgeId(l: PipeLine): string | null {
  const code = lineCode(l.tag)
  if (code === 'PW') return l.system === 'accommodation' ? 'line-potable-water' : 'line-produced-water'
  // a drain line keeps its drain role even when numbered with the fluid code (e.g. a 2" PO scrubber drain)
  if (l.service === 'drain' && code !== 'OD') return 'line-closed-drain'
  if (code && LINE_CODE[code]) return LINE_CODE[code]
  if (l.service === 'water' && l.system === 'accommodation') return 'line-potable-water'
  return LINE_SERVICE[l.service] ?? null
}

// ───────────────────────────── valves ─────────────────────────────

const VALVE_TYPE: Record<Valve['type'], string> = {
  gate: 'valve-gate',
  globe: 'valve-globe',
  ball: 'valve-ball',
  check: 'valve-check',
  butterfly: 'valve-butterfly',
  control: 'valve-control',
  esdv: 'valve-esdv',
  bdv: 'valve-bdv',
  psv: 'valve-psv',
  needle: 'valve-needle',
}

const endText = (e: PipeLine['to']) => ('offDeck' in e ? e.offDeck : '')

export function valveKnowledgeId(v: Valve, line?: PipeLine): string | null {
  const notes = `${v.design?.notes ?? ''} ${line?.design?.notes ?? ''}`.toLowerCase()
  if (v.type === 'control' && /anti-?surge|surge control/.test(notes)) return 'valve-antisurge'
  if (/^(xv|dv|udv|dlv)-/i.test(v.tag) && v.type !== 'check' && v.type !== 'psv' && line && line.service === 'firewater') {
    const deluge = line.sprayNozzles || /deluge|spray|sprinkler/.test(`${notes} ${endText(line.to)}`.toLowerCase())
    if (deluge) return 'valve-deluge'
  }
  if (/^dv-/i.test(v.tag) && line?.service === 'firewater') return 'valve-deluge'
  return VALVE_TYPE[v.type] ?? null
}

// ───────────────────────────── instruments ─────────────────────────────

const INST_TYPE: Record<Instrument['type'], string> = {
  PT: 'inst-pt',
  PI: 'inst-pi',
  PG: 'inst-pg',
  TT: 'inst-tt',
  TG: 'inst-tg',
  LT: 'inst-lt',
  LG: 'inst-lg',
  FT: 'inst-ft-liquid',
  PDT: 'inst-pdt',
  AT: 'inst-at',
  FD: 'inst-fd',
  GD: 'inst-gd',
  OGD: 'inst-ogd',
  HD: 'inst-hd',
  SD: 'inst-sd',
  MAC: 'inst-mac',
}

const isDrilling = (e?: Equipment) => !!e && ((e.kind === 'proxy' && (e.role as string) === 'drillingRig') || /drilling|derrick|mud/i.test(e.name))
const GAS_FLOW_UNIT = /scf|nm³|nm3|sm³|sm3|mmscm|kscm/i

export function instrumentKnowledgeId(i: Instrument, host: { line?: PipeLine; equipment?: Equipment }): string | null {
  const unit = (i.unit ?? '').toLowerCase()
  const { line, equipment } = host
  const airHost = line?.service === 'instrumentAir' || (!!equipment && /air/i.test(equipment.name))

  // drilling instrumentation hung on the rig
  if (isDrilling(equipment)) {
    if (unit === 't' || /hook/.test(unit)) return 'inst-hookload'
    if (i.type === 'PT' || i.type === 'PI') return 'inst-standpipe'
    if (i.type === 'LT' && /m³|m3|bbl/.test(unit)) return 'inst-pit-volume'
  }
  if (i.type === 'FT' && /% ?flow/.test(unit)) return 'inst-flow-out'

  // analysers by what they measure
  if (i.type === 'AT' || i.type === 'GD') {
    if (/h₂s|h2s/.test(unit) || (i.type === 'GD' && /ppm/.test(unit))) return 'inst-at-h2s'
    if (i.type === 'AT') {
      if (/sand/.test(unit)) return 'inst-sand-detector'
      if (/water ?cut|bs&w/.test(unit)) return 'inst-at-watercut'
      if (/oiw|oil/.test(unit)) return 'inst-at-oiw'
      if (/dew/.test(unit)) return airHost ? 'inst-at-air-dewpoint' : 'inst-at-dewpoint'
      if (/gas units|units/.test(unit)) return 'inst-at-mudgas'
      return 'inst-at'
    }
  }

  if (i.type === 'FT') {
    const gasLine = !!line && (line.service === 'gas' || line.service === 'flare' || line.service === 'instrumentAir')
    return gasLine || GAS_FLOW_UNIT.test(unit) ? 'inst-ft-gas' : 'inst-ft-liquid'
  }
  return INST_TYPE[i.type] ?? null
}

// ───────────────────────────── lookup ─────────────────────────────

interface Index {
  eq: Map<string, Equipment>
  line: Map<string, PipeLine>
  valve: Map<string, Valve>
  inst: Map<string, Instrument>
}
const indexCache = new WeakMap<Plant, Index>()

function indexOf(plant: Plant): Index {
  let ix = indexCache.get(plant)
  if (!ix) {
    ix = {
      eq: new Map(plant.equipment.map((e) => [e.tag, e])),
      line: new Map(plant.lines.map((l) => [l.tag, l])),
      valve: new Map(plant.valves.map((v) => [v.tag, v])),
      inst: new Map(plant.instruments.map((i) => [i.tag, i])),
    }
    indexCache.set(plant, ix)
  }
  return ix
}

/** Entry id for any tag in the plant (equipment, line, valve or instrument), or null. */
export function knowledgeIdFor(plant: Plant, tag: string): string | null {
  const ix = indexOf(plant)
  const e = ix.eq.get(tag)
  if (e) return equipmentKnowledgeId(e)
  const l = ix.line.get(tag)
  if (l) return lineKnowledgeId(l)
  const v = ix.valve.get(tag)
  if (v) return valveKnowledgeId(v, ix.line.get(v.line))
  const i = ix.inst.get(tag)
  if (i) {
    const on = i.on
    const host = 'line' in on ? { line: ix.line.get(on.line) } : { equipment: ix.eq.get(on.equipment) }
    return instrumentKnowledgeId(i, host)
  }
  return null
}

/** Knowledge entry for any equipment / line / valve / instrument tag in the plant, or null. */
export function knowledgeFor(plant: Plant, tag: string): Knowledge | null {
  const id = knowledgeIdFor(plant, tag)
  return (id && KNOWLEDGE[id]) || null
}
