/**
 * Renderer slot for plants the equipment and piping layers can't draw (plan 14). A build registers a renderer by id,
 * and a Plant with `custom.renderer` set is drawn by it inside the plant root, so picking, selection, framing and the
 * walker work as usual. Nothing is registered by default.
 */
import type { ComponentType } from 'react'
import type { Plant } from '../model/types'

export type PlantRenderer = ComponentType<{ plant: Plant }>

const renderers = new Map<string, PlantRenderer>()

export const registerPlantRenderer = (id: string, r: PlantRenderer) => void renderers.set(id, r)
export const plantRenderer = (id: string) => renderers.get(id)
