/**
 * Live metrics for any item (equipment, line, valve). Real instruments come first: those mounted
 * on the item and on the lines attached to its nozzles. Quantities no instrument covers are filled
 * with simulated signals per equipment kind (flagged `simulated`) so every item has something to
 * inspect. Values come from the same simulated historian as the instruments (live.ts).
 */
import type { Equipment, Instrument, PipeLine, Plant, Valve } from '../model/types'

export interface Metric {
  inst: Instrument
  label: string
  simulated: boolean
}

/** "42 barg" → 42; falls back when the design field is missing (builder plants). */
const num = (s: string | undefined, fallback: number) => {
  const m = s ? /(-?\d+(?:\.\d+)?)/.exec(s.replace(/\s/g, '').replace(/→.*/, '')) : null
  return m ? Number(m[1]) : fallback
}
/** last number in a field like "40 → 140 barg" or "-10 / 120 °C" */
const lastNum = (s: string | undefined, fallback: number) => {
  const all = s ? s.match(/-?\d+(?:\.\d+)?/g) : null
  return all?.length ? Number(all[all.length - 1]) : fallback
}

function sim(tag: string, key: string, label: string, unit: string, nominal: number, range: string, alarms?: Instrument['alarms']): Metric {
  return { inst: { tag: `${tag}·${key}`, type: 'PT', on: { equipment: tag }, unit, nominal, range, alarms }, label, simulated: true }
}

const KIND_OF: Record<string, string> = { PT: 'P', PI: 'P', PG: 'P', TT: 'T', TG: 'T', LT: 'L', LG: 'L', FT: 'F', PDT: 'DP', AT: 'A', FD: 'FD', GD: 'GD', OGD: 'OGD', HD: 'HD', SD: 'SD', MAC: 'MAC' }
const LABEL_OF: Record<string, string> = {
  P: 'Pressure', T: 'Temperature', L: 'Level', F: 'Flow', DP: 'Differential pressure', A: 'Analyser',
  FD: 'Flame detector', GD: 'Gas detector', OGD: 'Open-path gas', HD: 'Heat detector', SD: 'Smoke detector', MAC: 'Call point',
}

function real(i: Instrument, where?: string): Metric {
  const k = KIND_OF[i.type] ?? i.type
  return { inst: i, label: `${LABEL_OF[k] ?? i.type}${where ? ` · ${where}` : ''}`, simulated: false }
}

function connectedLines(plant: Plant, eq: string) {
  return plant.lines.filter((l) => [l.from, l.to].some((e) => 'equipment' in e && e.equipment === eq))
}

function equipmentSim(e: Equipment): Metric[] {
  const t = e.tag
  const P = num(e.design.pressure, 30) * 0.82
  const T = lastNum(e.design.temperature, 80) * 0.6
  switch (e.kind) {
    case 'horizontalVessel': {
      const out = [
        sim(t, 'P', 'Operating pressure', 'barg', +P.toFixed(1), `0–${Math.ceil(P * 1.4)}`, { hi: +(P * 1.1).toFixed(1), hiHi: +(P * 1.18).toFixed(1) }),
        sim(t, 'L', e.boots?.length ? 'Oil level' : 'Liquid level', '%', Math.round((e.levels?.oil ?? 0.4) * 100), '0–100', { lo: 20, hi: 80, loLo: 10, hiHi: 90 }),
        sim(t, 'T', 'Temperature', '°C', Math.round(T), '0–150'),
      ]
      if (e.boots?.length) out.splice(2, 0, sim(t, 'IL', 'Water interface level', '%', Math.round((e.levels?.water ?? 0.22) * 100), '0–100', { lo: 10, hi: 45 }))
      return out
    }
    case 'verticalVessel':
      return [
        sim(t, 'P', 'Operating pressure', 'barg', +P.toFixed(1), `0–${Math.ceil(P * 1.4)}`, { hi: +(P * 1.1).toFixed(1) }),
        sim(t, 'L', 'Liquid level', '%', Math.round((e.levels?.liquid ?? 0.12) * 100), '0–100', { hi: 40, hiHi: 60 }),
        sim(t, 'DP', 'Demister ΔP', 'mbar', 22, '0–100', { hi: 60 }),
      ]
    case 'shellTube': {
      const duty = num(e.design.capacity, 4)
      return [
        sim(t, 'TI', 'Shell inlet temperature', '°C', 105, '0–200'),
        sim(t, 'TO', 'Shell outlet temperature', '°C', 48, '0–200', { hi: 60 }),
        sim(t, 'CT', 'Cooling medium return', '°C', 38, '0–100'),
        sim(t, 'Q', 'Duty', 'MW', duty, `0–${Math.ceil(duty * 1.5)}`),
      ]
    }
    case 'pumpPackage': {
      const flow = num(e.design.capacity, 120)
      return [
        sim(t, 'F', 'Flow', 'm³/h', flow, `0–${Math.ceil(flow * 1.5)}`, { lo: flow * 0.4 }),
        sim(t, 'PD', 'Discharge pressure', 'barg', 24, '0–60'),
        sim(t, 'I', 'Motor current', 'A', Math.round(e.motorKw * (e.motorKw > 300 ? 0.11 : 1.7)), '0–' + Math.ceil(e.motorKw * (e.motorKw > 300 ? 0.15 : 2.2))),
        sim(t, 'V', 'Bearing vibration', 'mm/s', 2.1, '0–12', { hi: 4.5, hiHi: 7.1 }),
        sim(t, 'BT', 'Bearing temperature', '°C', 62, '0–120', { hi: 85 }),
      ]
    }
    case 'compressorPackage':
      return [
        sim(t, 'PS', 'Suction pressure', 'barg', num(e.design.pressure, 40) * 0.98, '0–80'),
        sim(t, 'PD', 'Discharge pressure', 'barg', lastNum(e.design.pressure, 120) * 0.95, '0–160'),
        sim(t, 'N', 'Speed', 'rpm', 9800, '0–12000', { hi: 11200 }),
        sim(t, 'SM', 'Surge margin', '%', 18, '0–50', { lo: 10, loLo: 5 }),
        sim(t, 'V', 'Shaft vibration', 'µm', 24, '0–100', { hi: 50, hiHi: 75 }),
        sim(t, 'KW', 'Motor power', 'kW', Math.round(e.motorKw * 0.82), `0–${e.motorKw}`),
      ]
    case 'pigTrap':
      return [sim(t, 'P', 'Barrel pressure', 'barg', +P.toFixed(1), '0–120'), sim(t, 'T', 'Temperature', '°C', 55, '0–150')]
    case 'manifold':
      return [
        sim(t, 'P', 'Header pressure', 'barg', +P.toFixed(1), '0–120'),
        sim(t, 'T', 'Header temperature', '°C', 78, '0–150'),
        sim(t, 'F', 'Total well flow', 'bbl/d', 38000, '0–50000'),
      ]
    case 'chemSkid':
      return [
        ...Array.from({ length: Math.min(e.tanks, 3) }, (_, i) => sim(t, `L${i}`, `Tank ${i + 1} level`, '%', 55 + i * 9, '0–100', { lo: 20 })),
        sim(t, 'F', 'Injection rate', 'L/h', 14, '0–40'),
      ]
    case 'xmasTree': {
      const thp = { oilProducer: 48, gasProducer: 96, waterInjector: 128, suspended: 0.6 }[e.wellType]
      return [
        sim(t, 'THP', e.wellType === 'waterInjector' ? 'Injection pressure' : 'Tubing head pressure', 'barg', thp, '0–200', { hi: +(thp * 1.25).toFixed(1) }),
        sim(t, 'FTHT', 'Flowing tubing head temp.', '°C', e.wellType === 'waterInjector' ? 18 : 74, '0–150'),
        sim(t, 'CH', 'Choke opening', '%', e.wellType === 'suspended' ? 0.1 : 42, '0–100'),
        sim(t, 'PA', 'A-annulus pressure', 'barg', 14, '0–100', { hi: 35, hiHi: 50 }),
        sim(t, 'SCSSV', 'SCSSV control line', 'barg', 310, '0–400', { lo: 250, loLo: 200 }),
      ]
    }
    case 'module':
      return [
        sim(t, 'T', 'Room temperature', '°C', 22, '0–50', { hi: 30 }),
        sim(t, 'DP', 'Room pressurisation', 'Pa', 50, '0–150', { lo: 25 }),
        sim(t, 'GD', 'Gas detection', '%LEL', 0.4, '0–100', { hi: 20, hiHi: 60 }),
      ]
  }
}

function lineSim(l: PipeLine): Metric[] {
  const gas = l.service === 'gas' || l.service === 'flare'
  const P = num(l.design.pressure, gas ? 38 : 20) * 0.85
  return [
    sim(l.tag, 'F', 'Flow', gas ? 'MMscfd' : 'm³/h', gas ? 45 : Math.round(l.nps * l.nps * 2.2), gas ? '0–80' : `0–${Math.ceil(l.nps * l.nps * 4)}`),
    sim(l.tag, 'P', 'Pressure', 'barg', +P.toFixed(1), `0–${Math.ceil(P * 1.5)}`),
    sim(l.tag, 'T', 'Temperature', '°C', num(l.design.temperature, gas ? 40 : 60), '0–150'),
  ]
}

function valveSim(v: Valve): Metric[] {
  const modulating = v.type === 'control'
  const open = v.normally === 'open'
  return [
    sim(v.tag, 'Z', modulating ? 'Valve position (output)' : 'Valve position', '%', modulating ? 46 : open ? 100 : 0.1, '0–100'),
    sim(v.tag, 'DP', 'Differential pressure', 'bar', modulating ? 3.2 : open ? 0.15 : 18, '0–40'),
  ]
}

/** Metrics for any item tag, real instruments first, at most `max`. */
export function metricsFor(plant: Plant, tag: string, max = 8): Metric[] {
  const eq = plant.equipment.find((e) => e.tag === tag)
  const out: Metric[] = []
  if (eq) {
    for (const i of plant.instruments) if ('equipment' in i.on && i.on.equipment === tag) out.push(real(i))
    for (const l of connectedLines(plant, tag)) for (const i of plant.instruments) if ('line' in i.on && i.on.line === l.tag) out.push(real(i, l.tag))
    const have = new Set(out.map((m) => m.label.split(' · ')[0]))
    for (const m of equipmentSim(eq)) if (!have.has(m.label.replace('Operating ', '').replace(/^(Oil|Liquid) level$/, 'Level'))) out.push(m)
    return out.slice(0, max)
  }
  const line = plant.lines.find((l) => l.tag === tag)
  if (line) {
    for (const i of plant.instruments) if ('line' in i.on && i.on.line === tag) out.push(real(i))
    const have = new Set(out.map((m) => m.label))
    for (const m of lineSim(line)) if (!have.has(m.label)) out.push(m)
    return out.slice(0, max)
  }
  const valve = plant.valves.find((v) => v.tag === tag)
  if (valve) {
    out.push(...valveSim(valve))
    const l = plant.lines.find((x) => x.tag === valve.line)
    for (const i of plant.instruments) if (l && 'line' in i.on && i.on.line === l.tag) out.push(real(i, l.tag))
    return out.slice(0, max)
  }
  return out
}
