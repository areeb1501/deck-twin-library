/**
 * Plant file formats (plan 14). One entry point, importPlant(), recognises a file and turns it into a Plant, or
 * explains what is wrong with it. Two formats ship with the app; a build can register more.
 *   engine   Export output: deck, equipment[], routed lines[]
 *   spec     PlantSpec: topology only, no coordinates (Builder, pid-to-plant)
 * Errors stop the load. Warnings load and stay visible in the plant menu.
 * The heavy modules load inside each format: a build registers its formats before the app starts, and a static import
 * here would run the plant model ahead of the store that depends on it.
 */
import { create } from 'zustand'
import type { PlantSpec } from '../library/spec'
import type { Plant } from '../model/types'

export interface PlantLoad {
  plant?: Plant
  errors: string[]
  warnings: string[]
}
export interface PlantImport extends PlantLoad {
  format: string
}
export interface PlantFormat {
  id: string
  /** how the file is described in messages */
  label: string
  detect: (json: Record<string, unknown>) => boolean
  load: (json: Record<string, unknown>) => Promise<PlantLoad>
  /** text an agent needs to write this format; the plant menu offers to copy it */
  agentBrief?: string
}

const dryRun = async (p: Plant, warnings: string[] = []): Promise<PlantLoad> => {
  const { buildPiping } = await import('../scene/piping/build')
  try {
    buildPiping(p)
  } catch (e) {
    return { errors: [`Piping could not be built: ${(e as Error).message}`], warnings }
  }
  return { plant: p, errors: [], warnings }
}

const first = (j: Record<string, unknown>) => (Array.isArray(j.equipment) ? (j.equipment[0] as Record<string, unknown> | undefined) : undefined)

const FORMATS: PlantFormat[] = [
  {
    id: 'engine',
    label: 'twin export',
    detect: (j) => 'deck' in j || !!first(j)?.kind,
    load: async (j) => {
      const { validatePlant } = await import('./plantStore')
      const errors = validatePlant(j)
      if (errors.length) return { errors, warnings: [] }
      const { custom: _, ...p } = j as unknown as Plant
      // a file that doesn't say where it stands gets a plain pad, not the Alpha field around it
      return dryRun({ ...p, deck: { ...p.deck, site: p.deck.site ?? 'onshore' } })
    },
  },
  {
    id: 'spec',
    label: 'PlantSpec',
    detect: (j) => Array.isArray(j.equipment) && !('deck' in j),
    load: async (j) => {
      const { compileSpec } = await import('../library/compile')
      try {
        const r = compileSpec(j as unknown as PlantSpec)
        if (r.errors.length) return { errors: r.errors, warnings: r.warnings }
        return dryRun(r.plant, r.warnings)
      } catch (e) {
        return { errors: [`Could not compile the spec: ${(e as Error).message}`], warnings: [] }
      }
    },
  },
]

/** Newest first, so a build's format is tried before the built-in ones. */
export const registerPlantFormat = (f: PlantFormat) => void FORMATS.unshift(f)
export const plantFormats = () => FORMATS as readonly PlantFormat[]

export async function importPlant(json: unknown): Promise<PlantImport> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { format: '', errors: ['Not a JSON object.'], warnings: [] }
  const j = json as Record<string, unknown>
  const f = FORMATS.find((x) => x.detect(j))
  if (!f) return { format: '', errors: [`Not a plant file. Expected one of: ${FORMATS.map((x) => x.label).join(', ')}.`], warnings: [] }
  try {
    const r = await f.load(j)
    const steer = !r.plant && !f.agentBrief && FORMATS.find((x) => x.agentBrief)
    return { format: f.id, ...r, errors: steer ? [...r.errors, `Read as a ${f.label}. If an agent wrote this, it should be a ${steer.label}: use Agent rules.`] : r.errors }
  } catch (e) {
    return { format: f.id, errors: [`Could not load this ${f.label}: ${(e as Error).message}`], warnings: [] }
  }
}

/** What the last load reported. A renderer can add to it once the plant is on screen. */
export const useImportNotes = create<{ warnings: string[]; note: string | null; add: (w: string[]) => void; set: (w: string[], note?: string | null) => void }>((set) => ({
  warnings: [],
  note: null,
  add: (w) => set((s) => ({ warnings: [...new Set([...s.warnings, ...w])] })),
  set: (warnings, note = null) => set({ warnings, note }),
}))
