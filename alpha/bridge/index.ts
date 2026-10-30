/**
 * Bridge between the engine and the component library: plant.json loads in the twin and draws the real registry
 * components. The engine only knows the generic seams (state/plantFormats.ts, scene/customPlant.ts); the registry is
 * reachable from this repo but not from a deck-twin build, so this lives outside src/, where `npm run refresh` keeps it.
 * Everything heavy loads on demand: the Alpha field pays nothing for it.
 */
import { lazy } from 'react'
import { registerPlantRenderer } from '../src/scene/customPlant'
import { registerPlantFormat } from '../src/state/plantFormats'
import { agentBrief } from './brief'

registerPlantRenderer('library', lazy(() => import('./LibraryLayer')))

registerPlantFormat({
  id: 'library',
  label: 'plant.json',
  detect: (j) => Array.isArray(j.items),
  load: async (j) => (await import('./load')).loadLibraryPlant(j),
  agentBrief: agentBrief(location.origin),
})
