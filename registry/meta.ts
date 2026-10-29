// Registry metadata schema: drives the website controls, the CLI index and the agent skill. Not installed into projects.

export type CategoryId =
  | 'piping'
  | 'valves'
  | 'vessels'
  | 'thermal'
  | 'rotating'
  | 'wellhead'
  | 'drilling'
  | 'instruments'
  | 'safety'
  | 'structure'
  | 'electrical'
  | 'interiors'
  | 'lifting'
  | 'packages'
  | 'onshore'

export const CATEGORIES: { id: CategoryId; title: string; blurb: string }[] = [
  { id: 'piping', title: 'Piping & fittings', blurb: 'ASME B36.10 pipe, B16.9 fittings, B16.5 flanges, supports and specialty items.' },
  { id: 'valves', title: 'Valves', blurb: 'Manual, actuated, control and relief valves sized to B16.10 and API 526.' },
  { id: 'vessels', title: 'Vessels & tanks', blurb: 'ASME VIII pressure vessels, separators, columns, filters and API 650 tanks.' },
  { id: 'thermal', title: 'Heat transfer & flare', blurb: 'TEMA exchangers, air coolers, plate exchangers, heaters, flare and vent stacks.' },
  { id: 'rotating', title: 'Rotating equipment', blurb: 'API 610 pumps, API 617/618 compressors, gas turbines, motors and engines.' },
  { id: 'wellhead', title: 'Wells & pipelines', blurb: 'API 6A trees and wellheads, BOPs, manifolds, pig traps and risers.' },
  { id: 'drilling', title: 'Drilling & subsea', blurb: 'Mud system, pipe handling, well service units, subsea manifolds, PLETs and umbilical terminations.' },
  { id: 'instruments', title: 'Instruments', blurb: 'Transmitters, gauges, flowmeters, level instruments and analysers.' },
  { id: 'safety', title: 'Fire, gas & safety', blurb: 'F&G detectors, call points, deluge, monitors, showers and lifesaving.' },
  { id: 'structure', title: 'Structure & access', blurb: 'Decks, beams, grating, stairs, ladders, racks, jackets and bridges.' },
  { id: 'electrical', title: 'Power & buildings', blurb: 'Transformers, switchgear, E-houses, panels, lighting and cable tray.' },
  { id: 'interiors', title: 'Control room & interiors', blurb: 'CCR consoles, video walls, screens, doors, windows, rooms, cabinets and CCTV.' },
  { id: 'lifting', title: 'Lifting & logistics', blurb: 'Pedestal cranes, monorails, davits, containers and cargo units.' },
  { id: 'packages', title: 'Packages & skids', blurb: 'Chemical injection, metering, nitrogen, air, HPU and treatment skids.' },
  { id: 'onshore', title: 'Onshore & terminals', blurb: 'Loading arms, truck bays, pipeline valve stations, bunds, fences, boilers, substations and site buildings.' },
]

export type Param =
  | { key: string; label: string; type: 'number'; min: number; max: number; step?: number; unit?: string }
  | { key: string; label: string; type: 'select'; options: (string | number | { value: string | number; label: string })[] }
  | { key: string; label: string; type: 'bool' }
  | { key: string; label: string; type: 'nps'; min?: number; max?: number }
  | { key: string; label: string; type: 'rating'; options?: number[] }
  | { key: string; label: string; type: 'color' }
  | { key: string; label: string; type: 'text' }

export interface ComponentMeta {
  /** kebab-case id, unique across the registry; also the CLI name */
  name: string
  title: string
  /** file in the same category folder */
  file: string
  /** named export of the React component */
  export: string
  description: string
  /** standards the geometry and defaults follow */
  standards: string[]
  /** typical suppliers of this equipment type (geometry is generic, not vendor CAD) */
  vendors?: string[]
  tags?: string[]
  /** live controls on the website; keys are component props */
  params: Param[]
  /** prop overrides used for the preview and thumbnail */
  preview?: Record<string, unknown>
  /**
   * 'base': origin at the footprint centre on the deck (y = 0).
   * 'inline': origin on the pipe centreline, ports A (-X) and B (+X); can sit in a line's "inline" list.
   * 'fitting': origin at the fitting or body centre, ports wherever they are (elbows, tees, PSVs).
   */
  anchor: 'base' | 'inline' | 'fitting'
  /** other registry components this file imports */
  registryDependencies?: string[]
  /** extra npm packages beyond react, three, @react-three/fiber, @react-three/drei */
  dependencies?: string[]
}

export const defineMeta = (items: ComponentMeta[]) => items
