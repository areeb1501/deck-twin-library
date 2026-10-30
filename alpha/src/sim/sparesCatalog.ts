/**
 * Spare-parts catalogue and seed stock for the spares & supply simulation (plan 13 A). SIMULATED: a plausible
 * offshore materials dataset (material numbers, vendors, prices, lead times), shaped like an SAP MM / Maximo
 * material master so an export could replace it.
 *
 * The catalogue is built from the loaded plant: every failure mode (`CLASS_DATA[cls].failures`, exact wording)
 * of every monitored machine (`machineTags`) maps to at least one part, and every machine has a PM kit
 * (`usedFor: 'PM'`). Parts written for the Alpha field keep only the tags present in the plant; anything left
 * uncovered (builder plants) gets a generic class-level part, so the WO gate and `coverFor` always resolve.
 *
 * Interchangeability groups follow the service: P-1500A/B share a seal cartridge, GT-8100A/B a fuel-nozzle set …
 */
import type { Plant } from '../model/types'
import * as A from './alpha'
import type { SparePart, StockLevel } from './assetTypes'
import { machineTags } from './maintenance'

/** the K-2200 dry-gas-seal story: the part, and the standard PO already open at the start of the session */
export const DGS_PART = 'MAT-K2200-DGS'
export const DGS_PO = 'PO-45000001'
/** real days the standard DGS order has been open when the session starts (180-day lead → ETA ≈ 128 d) */
export const DGS_PO_AGE_DAYS = 52

type Mach = { tag: string; cls: A.MachineClass }
type Fits = string[] | ((m: Mach) => boolean) | { inst: string[] } | { valves: string }
interface Spec extends Omit<SparePart, 'fits'> {
  fits: Fits
  seed: [offshore: number, base: number]
}

const cls = (...c: A.MachineClass[]) => (m: Mach) => c.includes(m.cls)
const P1500 = ['P-1500A', 'P-1500B']
const P4300 = ['P-4300A', 'P-4300B']
const PW310 = ['P-W310A', 'P-W310B']
const UTIL_PUMPS = ['P-4500', 'P-6200A', 'P-6200B', 'P-9340']
const SW_LIFT = ['P-6400A', 'P-6400B', 'P-W300A', 'P-W300B']
const FW_PUMPS = ['P-7101A', 'P-7101B']
const GT = ['GT-8100A', 'GT-8100B']

// prettier-ignore
const SPECS: Spec[] = [
  // ---------------------------------------------------------------- pumps
  { id: 'MAT-P1500-SEAL', name: 'Mechanical seal cartridge, API 682 dual — crude export pumps', short: 'P-1500 seal cartridge', category: 'rotating', criticality: 'A', uom: 'ea', unitCost: 32000, kg: 45, fits: P1500, usedFor: ['Mechanical seal leak'], perJob: 1, rop: 1, max: 2, vendor: 'John Crane (simulated)', leadDays: 84, expediteDays: 21, expeditePremium: 0.35, seed: [1, 1] },
  { id: 'MAT-P1500-BRG', name: 'Bearing set, radial + thrust — crude export pumps', short: 'P-1500 bearing set', category: 'rotating', criticality: 'B', uom: 'set', unitCost: 7400, kg: 18, fits: P1500, usedFor: ['High bearing temperature', 'High vibration'], perJob: 1, rop: 1, max: 3, vendor: 'SKF (simulated)', leadDays: 56, expediteDays: 10, expeditePremium: 0.3, seed: [2, 1] },
  { id: 'MAT-P4300-SEAL', name: 'Mechanical seal cartridge — produced water pumps', short: 'P-4300 seal cartridge', category: 'rotating', criticality: 'B', uom: 'ea', unitCost: 14500, kg: 30, fits: P4300, usedFor: ['Mechanical seal leak'], perJob: 1, rop: 1, max: 2, vendor: 'Flowserve (simulated)', leadDays: 70, expediteDays: 18, expeditePremium: 0.35, seed: [1, 1] },
  { id: 'MAT-PW310-SEAL', name: 'Mechanical seal cartridge, high pressure — water injection pumps', short: 'WI pump seal', category: 'rotating', criticality: 'B', uom: 'ea', unitCost: 38000, kg: 55, fits: PW310, usedFor: ['Mechanical seal leak'], perJob: 1, rop: 1, max: 2, vendor: 'John Crane (simulated)', leadDays: 98, expediteDays: 28, expeditePremium: 0.4, seed: [1, 1] },
  { id: 'MAT-PW310-BRG', name: 'Bearing & balance-drum set — water injection pumps', short: 'WI pump bearings', category: 'rotating', criticality: 'B', uom: 'set', unitCost: 21000, kg: 40, fits: PW310, usedFor: ['High bearing temperature', 'High vibration'], perJob: 1, rop: 1, max: 2, vendor: 'Sulzer (simulated)', leadDays: 84, expediteDays: 21, expeditePremium: 0.35, seed: [1, 1] },
  { id: 'MAT-PMP-SEAL', name: 'Mechanical seal cartridge, single — utility pumps', short: 'utility pump seal', category: 'rotating', criticality: 'C', uom: 'ea', unitCost: 5200, kg: 15, fits: UTIL_PUMPS, usedFor: ['Mechanical seal leak'], perJob: 1, rop: 1, max: 3, vendor: 'Flowserve (simulated)', leadDays: 42, expediteDays: 7, expeditePremium: 0.25, seed: [2, 1] },
  { id: 'MAT-PMP-BRG', name: 'Bearing set — produced water & utility pumps', short: 'pump bearing set', category: 'rotating', criticality: 'C', uom: 'set', unitCost: 2400, kg: 8, fits: [...P4300, ...UTIL_PUMPS], usedFor: ['High bearing temperature', 'High vibration'], perJob: 1, rop: 2, max: 5, vendor: 'SKF (simulated)', leadDays: 35, expediteDays: 7, expeditePremium: 0.25, seed: [3, 2] },
  { id: 'MAT-MTR-BRG', name: 'Motor bearing set & coupling insert — LV / HV motors', short: 'motor bearing kit', category: 'electrical', criticality: 'B', uom: 'kit', unitCost: 3900, kg: 22, fits: cls('pump', 'ia'), usedFor: ['Motor overload'], perJob: 1, rop: 2, max: 4, vendor: 'ABB (simulated)', leadDays: 42, expediteDays: 10, expeditePremium: 0.3, seed: [2, 2] },
  { id: 'MAT-PMP-PM', name: 'Pump PM kit — lube oil, coupling insert, gaskets', short: 'pump PM kit', category: 'rotating', criticality: 'C', uom: 'kit', unitCost: 650, kg: 25, fits: cls('pump'), usedFor: ['PM'], perJob: 1, rop: 4, max: 12, vendor: 'Offshore supply base stores', leadDays: 21, expediteDays: 5, expeditePremium: 0.2, seed: [8, 6] },
  // ---------------------------------------------------------------- caisson pumps
  { id: 'MAT-CAIS-BRG', name: 'Line-shaft bearing & wear-ring set — caisson pumps', short: 'caisson bearing set', category: 'rotating', criticality: 'B', uom: 'set', unitCost: 9800, kg: 60, fits: cls('caisson'), usedFor: ['High vibration'], perJob: 1, rop: 1, max: 3, vendor: 'Framo (simulated)', leadDays: 63, expediteDays: 14, expeditePremium: 0.3, seed: [2, 1] },
  { id: 'MAT-CAIS-MTR', name: 'Submersible motor, rewound exchange unit — seawater lift pumps', short: 'caisson motor', category: 'electrical', criticality: 'B', uom: 'ea', unitCost: 145000, kg: 1350, fits: SW_LIFT, usedFor: ['Motor winding temperature high'], perJob: 1, rop: 0, max: 1, vendor: 'Framo (simulated)', leadDays: 150, expediteDays: 30, expeditePremium: 0.4, seed: [0, 1] },
  { id: 'MAT-FWP-DSL', name: 'Diesel driver overhaul kit, cooling & injectors — firewater pumps', short: 'firewater diesel kit', category: 'rotating', criticality: 'A', uom: 'kit', unitCost: 12500, kg: 70, fits: FW_PUMPS, usedFor: ['Motor winding temperature high'], perJob: 1, rop: 1, max: 2, vendor: 'Caterpillar (simulated)', leadDays: 60, expediteDays: 10, expeditePremium: 0.3, seed: [1, 1] },
  { id: 'MAT-CAIS-BOWL', name: 'Pump bowl assembly, impellers + bowls — caisson pumps', short: 'caisson bowl assembly', category: 'rotating', criticality: 'B', uom: 'ea', unitCost: 26000, kg: 420, fits: cls('caisson'), usedFor: ['Low discharge pressure'], perJob: 1, rop: 2, max: 3, vendor: 'Framo (simulated)', leadDays: 120, expediteDays: 35, expeditePremium: 0.35, seed: [1, 0] },
  { id: 'MAT-CAIS-PM', name: 'Caisson pump PM kit — insulation-test consumables, column fasteners, anodes', short: 'caisson PM kit', category: 'rotating', criticality: 'C', uom: 'kit', unitCost: 900, kg: 30, fits: cls('caisson'), usedFor: ['PM'], perJob: 1, rop: 2, max: 6, vendor: 'Offshore supply base stores', leadDays: 28, expediteDays: 7, expeditePremium: 0.2, seed: [4, 2] },
  // ---------------------------------------------------------------- export compressor K-2200
  { id: DGS_PART, name: 'Dry gas seal cartridge, tandem — K-2200 export compressor', short: 'DGS cartridge', category: 'rotating', criticality: 'A', uom: 'ea', unitCost: 185000, kg: 140, fits: [A.TAGS.compressor], usedFor: ['Dry gas seal leakage high'], perJob: 1, rop: 0, max: 1, vendor: 'Flowserve DGS (simulated)', leadDays: 180, expediteDays: 14, expeditePremium: 0.45, seed: [0, 0] },
  { id: 'MAT-K2200-BRG', name: 'Tilting-pad journal & thrust bearing set — K-2200', short: 'K-2200 bearing set', category: 'rotating', criticality: 'A', uom: 'set', unitCost: 46000, kg: 60, fits: [A.TAGS.compressor], usedFor: ['High vibration (bearing)'], perJob: 1, rop: 0, max: 1, vendor: 'Kingsbury (simulated)', leadDays: 120, expediteDays: 28, expeditePremium: 0.35, seed: [1, 0] },
  { id: 'MAT-K2200-LOP', name: 'Lube oil pump & filter elements — K-2200 lube system', short: 'K-2200 lube pump', category: 'rotating', criticality: 'B', uom: 'kit', unitCost: 15500, kg: 85, fits: [A.TAGS.compressor], usedFor: ['Lube oil pressure low'], perJob: 1, rop: 1, max: 2, vendor: 'Siemens Energy (simulated)', leadDays: 60, expediteDays: 14, expeditePremium: 0.3, seed: [1, 1] },
  { id: 'MAT-K2200-VSD', name: 'VSD power module, IGBT stack — K-2200 drive', short: 'VSD power module', category: 'electrical', criticality: 'A', uom: 'ea', unitCost: 72000, kg: 140, fits: [A.TAGS.compressor], usedFor: ['VSD fault'], perJob: 1, rop: 0, max: 1, vendor: 'ABB Drives (simulated)', leadDays: 100, expediteDays: 12, expeditePremium: 0.4, seed: [1, 0] },
  { id: 'MAT-K2200-PM', name: 'Compressor PM kit — DGS filter elements, lube oil filters, coupling bolts', short: 'compressor PM kit', category: 'rotating', criticality: 'C', uom: 'kit', unitCost: 3200, kg: 40, fits: [A.TAGS.compressor], usedFor: ['PM'], perJob: 1, rop: 2, max: 4, vendor: 'Siemens Energy (simulated)', leadDays: 30, expediteDays: 7, expeditePremium: 0.25, seed: [3, 1] },
  // ---------------------------------------------------------------- gas turbine generators
  { id: 'MAT-GT-NOZ', name: 'Fuel nozzle set — GT-8100A/B (shared)', short: 'GT fuel-nozzle set', category: 'rotating', criticality: 'B', uom: 'set', unitCost: 38000, kg: 45, fits: GT, usedFor: ['Exhaust temperature spread high'], perJob: 1, rop: 1, max: 2, vendor: 'Solar Turbines (simulated)', leadDays: 90, expediteDays: 21, expeditePremium: 0.35, seed: [1, 1] },
  { id: 'MAT-GT-IGN', name: 'Igniter plug & flame-detector kit — GT-8100A/B', short: 'GT igniter kit', category: 'rotating', criticality: 'B', uom: 'kit', unitCost: 4800, kg: 6, fits: GT, usedFor: ['Flame-out'], perJob: 1, rop: 2, max: 4, vendor: 'Solar Turbines (simulated)', leadDays: 45, expediteDays: 7, expeditePremium: 0.3, seed: [1, 0] },
  { id: 'MAT-GT-BRG', name: 'Gas generator bearing set — GT-8100A/B', short: 'GT bearing set', category: 'rotating', criticality: 'B', uom: 'set', unitCost: 58000, kg: 75, fits: GT, usedFor: ['High vibration'], perJob: 1, rop: 0, max: 1, vendor: 'Solar Turbines (simulated)', leadDays: 150, expediteDays: 30, expeditePremium: 0.4, seed: [0, 1] },
  { id: 'MAT-GT-LOC', name: 'Lube oil cooler fan motor & thermostatic valve — GT-8100A/B', short: 'GT lube cooler kit', category: 'electrical', criticality: 'B', uom: 'kit', unitCost: 8600, kg: 55, fits: GT, usedFor: ['Lube oil temperature high'], perJob: 1, rop: 1, max: 2, vendor: 'Solar Turbines (simulated)', leadDays: 49, expediteDays: 10, expeditePremium: 0.3, seed: [1, 1] },
  { id: 'MAT-GT-PM', name: 'GT PM kit — lube oil filters, borescope plugs, gaskets', short: 'GT PM kit', category: 'rotating', criticality: 'C', uom: 'kit', unitCost: 2900, kg: 20, fits: GT, usedFor: ['PM'], perJob: 1, rop: 2, max: 4, vendor: 'Solar Turbines (simulated)', leadDays: 28, expediteDays: 7, expeditePremium: 0.25, seed: [3, 1] },
  // ---------------------------------------------------------------- instrument air
  { id: 'MAT-K4600-AE', name: 'Air-end valve & aftercooler service kit — K-4600', short: 'IA air-end kit', category: 'rotating', criticality: 'A', uom: 'kit', unitCost: 11800, kg: 35, fits: cls('ia'), usedFor: ['High discharge temperature'], perJob: 1, rop: 1, max: 2, vendor: 'Atlas Copco (simulated)', leadDays: 56, expediteDays: 10, expeditePremium: 0.3, seed: [1, 1] },
  { id: 'MAT-K4600-DES', name: 'Dryer desiccant charge & switching valve — K-4600', short: 'IA dryer kit', category: 'rotating', criticality: 'B', uom: 'kit', unitCost: 3600, kg: 160, fits: cls('ia'), usedFor: ['Dryer tower failure', 'PM'], perJob: 1, rop: 1, max: 3, vendor: 'Atlas Copco (simulated)', leadDays: 35, expediteDays: 7, expeditePremium: 0.25, seed: [2, 1] },
  // ---------------------------------------------------------------- drilling rig
  { id: 'MAT-DR-TDS', name: 'Top drive wash pipe & seal kit — DR-100', short: 'top drive seal kit', category: 'rotating', criticality: 'B', uom: 'kit', unitCost: 6900, kg: 25, fits: cls('rig'), usedFor: ['Top drive fault'], perJob: 1, rop: 1, max: 3, vendor: 'NOV (simulated)', leadDays: 42, expediteDays: 7, expeditePremium: 0.3, seed: [2, 1] },
  { id: 'MAT-DR-MPL', name: 'Mud pump liner, piston & valve set — DR-100', short: 'mud pump liner set', category: 'rotating', criticality: 'C', uom: 'set', unitCost: 4200, kg: 180, fits: cls('rig'), usedFor: ['Mud pump failure', 'PM'], perJob: 1, rop: 2, max: 6, vendor: 'NOV (simulated)', leadDays: 28, expediteDays: 5, expeditePremium: 0.25, seed: [4, 2] },
  // ---------------------------------------------------------------- chemical & utility skids
  { id: 'MAT-SKID-KIT', name: 'Dosing / metering pump repair kit, diaphragm + check valves — skids', short: 'dosing pump kit', category: 'rotating', criticality: 'C', uom: 'kit', unitCost: 1150, kg: 4, fits: cls('skid'), usedFor: ['Metering pump failure', 'PM'], perJob: 1, rop: 4, max: 12, vendor: 'Milton Roy (simulated)', leadDays: 28, expediteDays: 5, expeditePremium: 0.25, seed: [8, 4] },
  // ---------------------------------------------------------------- instruments, F&G, valves
  { id: 'MAT-FG-GDH', name: 'Point gas detector head, catalytic / IR — exchange', short: 'gas detector head', category: 'instrument', criticality: 'A', uom: 'ea', unitCost: 2600, kg: 3, fits: { inst: ['GD'] }, usedFor: ['Detector fault'], ratePerYear: 0.08, perJob: 1, rop: 3, max: 8, vendor: 'Dräger (simulated)', leadDays: 42, expediteDays: 7, expeditePremium: 0.3, seed: [5, 3] },
  { id: 'MAT-FG-IR3', name: 'IR3 flame detector head', short: 'IR3 flame head', category: 'instrument', criticality: 'A', uom: 'ea', unitCost: 4900, kg: 4, fits: { inst: ['FD'] }, usedFor: ['Detector fault'], ratePerYear: 0.05, perJob: 1, rop: 2, max: 5, vendor: 'Det-Tronics (simulated)', leadDays: 56, expediteDays: 10, expeditePremium: 0.3, seed: [3, 2] },
  { id: 'MAT-INS-PT', name: 'Pressure transmitter, 4–20 mA HART, universal range', short: 'pressure transmitter', category: 'instrument', criticality: 'B', uom: 'ea', unitCost: 2100, kg: 4, fits: { inst: ['PT'] }, usedFor: ['Transmitter fault'], ratePerYear: 0.03, perJob: 1, rop: 3, max: 8, vendor: 'Emerson (simulated)', leadDays: 35, expediteDays: 5, expeditePremium: 0.25, seed: [6, 4] },
  { id: 'MAT-ESDV-ACT', name: 'ESDV actuator seal kit, spring-return 8–24"', short: 'ESDV actuator seal kit', category: 'static', criticality: 'A', uom: 'kit', unitCost: 3300, kg: 12, fits: { valves: 'esdv' }, usedFor: ['Actuator leak', 'PM'], ratePerYear: 0.04, perJob: 1, rop: 2, max: 5, vendor: 'Rotork (simulated)', leadDays: 63, expediteDays: 14, expeditePremium: 0.3, seed: [3, 2] },
  // ---------------------------------------------------------------- chemicals & consumables (usage per logistics day at design throughput)
  { id: 'MAT-CHM-MEOH', name: 'Methanol, hydrate inhibitor — 1 m³ IBC', short: 'methanol', category: 'chemical', criticality: 'B', uom: 'IBC', unitCost: 650, kg: 850, fits: ['C-5600'], usedFor: [], usagePerDay: 1.4, driver: 'gas', perJob: 0, rop: 14, max: 40, vendor: 'Methanex (simulated)', leadDays: 10, expediteDays: 3, expeditePremium: 0.25, seed: [3.2, 30] },
  { id: 'MAT-CHM-TEG', name: 'Triethylene glycol (TEG) — 208 L drum', short: 'TEG', category: 'chemical', criticality: 'B', uom: 'drum', unitCost: 620, kg: 235, fits: ['C-5350'], usedFor: [], usagePerDay: 0.6, driver: 'gas', perJob: 0, rop: 10, max: 30, vendor: 'Dow (simulated)', leadDays: 14, expediteDays: 4, expeditePremium: 0.25, seed: [14, 16] },
  { id: 'MAT-CHM-CI', name: 'Corrosion inhibitor — 1 m³ IBC', short: 'corrosion inhibitor', category: 'chemical', criticality: 'B', uom: 'IBC', unitCost: 3800, kg: 1000, fits: ['C-1700', 'C-N260'], usedFor: [], usagePerDay: 0.35, driver: 'oil', perJob: 0, rop: 6, max: 16, vendor: 'ChampionX (simulated)', leadDays: 21, expediteDays: 5, expeditePremium: 0.25, seed: [5, 7] },
  { id: 'MAT-CHM-DEM', name: 'Demulsifier — 1 m³ IBC', short: 'demulsifier', category: 'chemical', criticality: 'B', uom: 'IBC', unitCost: 4400, kg: 950, fits: ['C-1700'], usedFor: [], usagePerDay: 0.3, driver: 'oil', perJob: 0, rop: 5, max: 14, vendor: 'ChampionX (simulated)', leadDays: 21, expediteDays: 5, expeditePremium: 0.25, seed: [4, 6] },
  { id: 'MAT-CHM-SI', name: 'Scale inhibitor, water injection — 1 m³ IBC', short: 'scale inhibitor', category: 'chemical', criticality: 'C', uom: 'IBC', unitCost: 3100, kg: 1000, fits: ['C-W340', 'C-N260'], usedFor: [], usagePerDay: 0.25, driver: 'water', perJob: 0, rop: 4, max: 12, vendor: 'Baker Hughes (simulated)', leadDays: 21, expediteDays: 5, expeditePremium: 0.25, seed: [4, 5] },
  { id: 'MAT-LUB-VG32', name: 'Turbine / compressor lube oil ISO VG 32 — 208 L drum', short: 'lube oil VG 32', category: 'consumable', criticality: 'C', uom: 'drum', unitCost: 1350, kg: 190, fits: [A.TAGS.compressor, ...GT], usedFor: [], usagePerDay: 0.25, driver: 'calendar', perJob: 0, rop: 6, max: 16, vendor: 'Shell Lubricants (simulated)', leadDays: 14, expediteDays: 4, expeditePremium: 0.2, seed: [6, 6] },
  { id: 'MAT-FLT-GT', name: 'GT inlet air filter elements, pre + fine', short: 'GT inlet filters', category: 'consumable', criticality: 'C', uom: 'ea', unitCost: 240, kg: 6, fits: GT, usedFor: [], usagePerDay: 1.2, driver: 'calendar', perJob: 0, rop: 30, max: 80, vendor: 'Camfil (simulated)', leadDays: 28, expediteDays: 7, expeditePremium: 0.2, seed: [36, 24] },
]

const CLASS_NAME: Record<A.MachineClass, string> = { pump: 'pumps', caisson: 'caisson pumps', compressor: 'compressors', gtg: 'gas turbines', ia: 'air compressors', rig: 'drilling rig', skid: 'skids' }
const CLASS_COST: Record<A.MachineClass, [number, number]> = { pump: [6000, 60], caisson: [12000, 75], compressor: [40000, 120], gtg: [30000, 90], ia: [8000, 56], rig: [6000, 42], skid: [1500, 28] }

export interface Catalog {
  parts: SparePart[]
  stock: Record<string, StockLevel>
}

/** the catalogue and seed stock for a plant (pure; ids are stable for the same plant) */
export function buildCatalog(p: Plant): Catalog {
  const machines = machineTags(p)
  const tags = new Set(p.equipment.map((e) => e.tag))
  const parts: SparePart[] = []
  const stock: Record<string, StockLevel> = {}
  for (const s of SPECS) {
    const { seed, fits: f, ...rest } = s
    let fits: string[]
    if (Array.isArray(f)) fits = f.filter((t) => tags.has(t))
    else if (typeof f === 'function') fits = machines.filter(f).map((m) => m.tag)
    else if ('inst' in f) fits = p.instruments.filter((i) => f.inst.includes(i.type)).map((i) => i.tag)
    else fits = p.valves.filter((v) => v.type === f.valves).map((v) => v.tag)
    if (!fits.length) continue
    parts.push({ ...rest, fits })
    stock[s.id] = { offshore: seed[0], base: seed[1], reserved: 0 }
  }
  // generic class parts for any (machine, failure mode) / PM the specific catalogue doesn't cover
  const covered = (tag: string, mode: string) => parts.some((x) => x.fits.includes(tag) && x.usedFor.includes(mode))
  const gaps = new Map<string, { cls: A.MachineClass; mode: string; tags: string[] }>()
  for (const m of machines) {
    for (const mode of [...A.CLASS_DATA[m.cls].failures, 'PM']) {
      if (covered(m.tag, mode)) continue
      const k = `${m.cls}|${mode}`
      const g = gaps.get(k) ?? gaps.set(k, { cls: m.cls, mode, tags: [] }).get(k)!
      g.tags.push(m.tag)
    }
  }
  let n = 0
  for (const g of gaps.values()) {
    const [cost, lead] = CLASS_COST[g.cls]
    const pm = g.mode === 'PM'
    const id = `MAT-GEN-${g.cls.toUpperCase()}-${String(++n).padStart(2, '0')}`
    parts.push({
      id,
      name: pm ? `PM kit — ${CLASS_NAME[g.cls]} (generic)` : `Repair kit: ${g.mode.toLowerCase()} — ${CLASS_NAME[g.cls]} (generic)`,
      short: pm ? `${g.cls} PM kit` : `${g.cls} repair kit`,
      category: 'rotating',
      criticality: pm ? 'C' : 'B',
      uom: 'kit',
      unitCost: pm ? Math.round(cost * 0.1) : cost,
      kg: 30,
      fits: g.tags,
      usedFor: [g.mode],
      perJob: 1,
      rop: 1,
      max: 2,
      vendor: 'OEM (simulated)',
      leadDays: pm ? 21 : lead,
      expediteDays: pm ? 5 : Math.max(7, Math.round(lead / 4)),
      expeditePremium: 0.3,
    })
    stock[id] = { offshore: 2, base: 1, reserved: 0 }
  }
  return { parts, stock }
}

/** seed time-line used by the store when the catalogue is (re)built */
export const SEED_NOTE =
  'Seed (simulated): stock healthy overall; K-2200 DGS cartridge 0 offshore / 0 base with a standard PO open (ETA months away); GT igniter kits and caisson bowl assemblies below the reorder point; methanol low offshore until the next sailing.'
