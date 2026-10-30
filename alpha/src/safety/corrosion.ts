/**
 * Corrosion ground truth and findings (plan 12). Simulated throughout: the wall figures are seeded assumptions,
 * not survey data.
 *
 *  - corrosionOf(plant, tag, t): the true state of any line or equipment shell, a pure function of the tag and
 *    the sim clock. A private hash picks the seed (8 % light, 2 % moderate, 0.5 % severe; CORROSION_SEEDS pins a
 *    few so a first scan finds something), so the engine's simRandom stream is untouched and scenarios keep
 *    their numbers. Nothing ticks, so it costs nothing until something asks.
 *  - useCorrosion: what inspections have actually found. Nothing is known about a tag until a unit has been there;
 *    risk, alerts and the agent tools read findings, never the ground truth.
 */
import { create } from 'zustand'
import type { Plant } from '../model/types'
import type { PlatformId } from '../sim/types'
import { pipeWall } from '../model/catalog'
import { CORROSION_SEEDS } from '../model/inspectionSite'

export type CorrGrade = 'none' | 'light' | 'moderate' | 'severe' | 'critical'
export const GRADE_RANK: Record<CorrGrade, number> = { none: 0, light: 1, moderate: 2, severe: 3, critical: 4 }

export function gradeOf(wallPct: number): CorrGrade {
  return wallPct > 92 ? 'none' : wallPct > 80 ? 'light' : wallPct > 70 ? 'moderate' : wallPct > 60 ? 'severe' : 'critical'
}

export interface CorrosionState {
  /** remaining wall, % of nominal */
  wallPct: number
  grade: CorrGrade
  rateMmPerYr: number
  /** nominal wall, mm */
  wallMm: number
  /** wall at the simulated survey a year before the session, % */
  lastSurveyPct: number
}

export interface CorrFinding {
  /** CF-#### */
  id: string
  /** sim seconds when graded */
  t: number
  tag: string
  platform: PlatformId
  grade: CorrGrade
  wallPct: number
  rateMmPerYr: number
  method: 'visual' | 'ut'
  missionId: string
}

const YEAR_S = 365 * 86400

/** FNV-1a of a string → 0…1 */
function unit(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** base rate by exposure, mm/yr (plan 12 §2.2) */
function baseRate(plant: Plant, tag: string) {
  const line = plant.lines.find((l) => l.tag === tag)
  if (line) return line.system === 'accommodation' ? 0.06 : line.system === 'wells' || line.system === 'flare' ? 0.22 : line.system === 'production' ? 0.18 : 0.15
  return 0.1
}

/** the true state of a line or an equipment shell at sim time t; null when the tag is neither */
export function corrosionOf(plant: Plant, tag: string, t: number): CorrosionState | null {
  const line = plant.lines.find((l) => l.tag === tag)
  const eq = line ? undefined : plant.equipment.find((e) => e.tag === tag)
  if (!line && !eq) return null
  const wallMm = line ? pipeWall(line.nps, line.schedule) * 1000 : eq && 'wall' in eq && typeof eq.wall === 'number' ? eq.wall * 1000 : 12
  const pin = CORROSION_SEEDS[tag]
  const u = unit(tag)
  const v = unit(`${tag}#`)
  const seed = pin ? pin[0] : u < 0.005 ? 61 + v * 8 : u < 0.025 ? 71 + v * 8 : u < 0.105 ? 81 + v * 10 : 94 + v * 5
  const rateMmPerYr = pin ? pin[1] : baseRate(plant, tag) * (0.8 + v * 0.5)
  const pctPerYear = (rateMmPerYr / wallMm) * 100
  const wallPct = seed - pctPerYear * (t / YEAR_S)
  return { wallPct, grade: gradeOf(wallPct), rateMmPerYr, wallMm, lastSurveyPct: Math.min(100, seed + pctPerYear) }
}

interface CorrStore {
  /** newest first (cap 200) */
  findings: CorrFinding[]
}
export const useCorrosion = create<CorrStore>(() => ({ findings: [] }))

let seq = 0
export function pushFinding(f: Omit<CorrFinding, 'id'>): CorrFinding {
  const nf = { ...f, id: `CF-${String(++seq).padStart(4, '0')}` }
  useCorrosion.setState((s) => ({ findings: [nf, ...s.findings].slice(0, 200) }))
  return nf
}
export function resetCorrosion() {
  seq = 0
  useCorrosion.setState({ findings: [] })
}

/** the latest finding per tag (a re-inspection replaces the older result) */
export function latestFindings(): CorrFinding[] {
  const seen = new Set<string>()
  return useCorrosion.getState().findings.filter((f) => !seen.has(f.tag) && !!seen.add(f.tag))
}
