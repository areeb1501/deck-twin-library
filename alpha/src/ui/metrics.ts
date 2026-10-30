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
    case 'gasTurbineGenerator':
      return [
        sim(t, 'MW', 'Active power', 'MW', +(e.ratedMW * 0.72).toFixed(1), `0–${e.ratedMW}`, { hi: e.ratedMW * 0.95 }),
        sim(t, 'EGT', 'Exhaust gas temperature', '°C', 485, '0–650', { hi: 560, hiHi: 590 }),
        sim(t, 'N', 'Generator speed', 'rpm', 1500, '0–1800', { hi: 1575 }),
        sim(t, 'V', 'Turbine vibration', 'mm/s', 3.1, '0–25', { hi: 12.5, hiHi: 18 }),
        sim(t, 'FG', 'Fuel gas pressure', 'barg', 18.2, '0–30', { lo: 15, loLo: 13 }),
        sim(t, 'LO', 'Lube oil temperature', '°C', 54, '0–100', { hi: 70 }),
      ]
    case 'caissonPump': {
      const fw = e.system === 'safety'
      return [
        sim(t, 'PD', 'Discharge pressure', 'barg', fw ? 14.5 : 6.4, fw ? '0–25' : '0–12', { lo: fw ? 9 : 4 }),
        sim(t, 'F', 'Flow', 'm³/h', fw ? 0.5 : 1750, fw ? '0–1500' : '0–2500'),
        sim(t, e.driver === 'diesel' ? 'RPM' : 'I', e.driver === 'diesel' ? 'Engine speed (standby)' : 'Motor current', e.driver === 'diesel' ? 'rpm' : 'A', e.driver === 'diesel' ? 0.5 : Math.round(e.motorKw * 0.105), e.driver === 'diesel' ? '0–2100' : `0–${Math.ceil(e.motorKw * 0.14)}`),
        sim(t, 'V', 'Motor / head vibration', 'mm/s', 2.4, '0–15', { hi: 7.1 }),
        sim(t, 'L', 'Caisson water level', 'm', 8.2, '0–15', { lo: 3 }),
      ]
    }
    case 'transformer':
      return [
        sim(t, 'LOAD', 'Load', '%', 62, '0–120', { hi: 95, hiHi: 110 }),
        sim(t, 'WT', 'Winding hot-spot temperature', '°C', 78, '0–150', { hi: 110, hiHi: 130 }),
        sim(t, 'OT', 'Top oil temperature', '°C', 61, '0–120', { hi: 90, hiHi: 100 }),
        sim(t, 'U', 'LV voltage', 'kV', Number(e.voltage.split('/')[1]?.split(' ')[0]) || 6.6, '0–15'),
      ]
    case 'proxy':
      return e.role === 'drillingRig'
        ? [
            sim(t, 'HL', 'Hook load', 't', 182, '0–450', { hi: 360 }),
            sim(t, 'WOB', 'Weight on bit', 't', 12.5, '0–40', { hi: 25 }),
            sim(t, 'ROP', 'Rate of penetration', 'm/h', 24, '0–80'),
            sim(t, 'TQ', 'Top drive torque', 'kN·m', 18.5, '0–60', { hi: 45 }),
            sim(t, 'RPM', 'Top drive speed', 'rpm', 120, '0–220'),
            sim(t, 'SPP', 'Standpipe pressure', 'bar', 212, '0–350', { hi: 300 }),
            sim(t, 'DEPTH', 'Bit depth (MD)', 'm', 2840, '0–5000'),
            sim(t, 'PIT', 'Active pit volume', 'm³', 142, '0–250', { lo: 130, hi: 154 }),
          ]
        : [
            sim(t, 'ACC', 'Accumulator pressure', 'barg', 207, '0–350', { lo: 180, loLo: 165 }),
            sim(t, 'ANN', 'Annular closing pressure', 'barg', 103, '0–200'),
            sim(t, 'WB', 'Wellbore pressure below BOP', 'barg', 0.6, '0–700', { hi: 20 }),
            sim(t, 'CK', 'Choke manifold pressure', 'barg', 0.8, '0–700', { hi: 20 }),
          ]
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
    const FG = new Set(['FD', 'GD', 'OGD', 'HD', 'SD', 'MAC'])
    const fg: Metric[] = []
    for (const i of plant.instruments) if ('equipment' in i.on && i.on.equipment === tag) (FG.has(i.type) ? fg : out).push(real(i))
    for (const l of connectedLines(plant, tag)) for (const i of plant.instruments) if ('line' in i.on && i.on.line === l.tag) out.push(real(i, l.tag))
    const have = new Set(out.map((m) => m.label.split(' · ')[0]))
    for (const m of equipmentSim(eq)) if (!have.has(m.label.replace('Operating ', '').replace(/^(Oil|Liquid) level$/, 'Level'))) out.push(m)
    // process first; fire & gas detectors covering the item fill what's left (at least two shown)
    const room = Math.max(2, max - out.length)
    return [...out.slice(0, max - Math.min(2, fg.length)), ...fg.slice(0, room)].slice(0, max + 2)
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
