/**
 * Plant data model — the single source of truth for the deck.
 *
 * Units: metres, degrees C, barg. Coordinates are DECK-LOCAL:
 *   +X = east (plant north-east "length" of deck), +Z = south, +Y = up,
 *   y = 0 is the top of the production-deck plate (EL +28.0 m above LAT).
 * Everything rendered in 3D, every row in the tag tree and every P&ID link
 * is generated from these records.
 */

export type Vec3 = [number, number, number]

export type Service =
  | 'multiphase' // well fluids
  | 'oil'
  | 'gas'
  | 'water' // produced water
  | 'flare'
  | 'cooling' // cooling medium (TEG/water)
  | 'firewater'
  | 'chemical'
  | 'drain'
  | 'instrumentAir'

export type SystemId =
  | 'production' // inlet + separation
  | 'oilExport'
  | 'gasCompression'
  | 'flare'
  | 'utilities'
  | 'safety'

export type Rating = 150 | 300 | 600 | 900

export interface Nozzle {
  /** e.g. "N1" — unique within the equipment */
  id: string
  /** human name: "Inlet", "Gas outlet", "PSV connection" */
  name: string
  /** deck-local position of the FLANGE FACE (where the piping starts) */
  pos: Vec3
  /** unit vector pointing outward from the equipment along the nozzle axis */
  dir: Vec3
  /** nominal pipe size, inches */
  nps: number
  rating: Rating
  /** deck-local point on the shell surface where the nozzle neck starts */
  base: Vec3
}

interface EquipmentBase {
  tag: string
  name: string
  system: SystemId
  /** deck-local position of the equipment origin (see each kind) */
  position: Vec3
  /** rotation about +Y, radians */
  rotationY: number
  nozzles: Nozzle[]
  design: DesignData
}

export interface DesignData {
  pressure?: string // e.g. "42 barg"
  temperature?: string // e.g. "-10 / 120 °C"
  material?: string
  capacity?: string
  weight?: string
  vendor?: string
  notes?: string
  [k: string]: string | undefined
}

/** Origin = centre of the vessel axis at mid tangent-to-tangent. Axis along local +X. */
export interface HorizontalVessel extends EquipmentBase {
  kind: 'horizontalVessel'
  id: number // inside diameter, m
  tt: number // tangent-to-tangent length, m
  wall: number // shell thickness, m
  saddles: number[] // local-X stations of saddle centres
  /** boots hang from the shell bottom: local X station, diameter, length */
  boots?: { x: number; d: number; l: number }[]
  internals?: ('inletDiverter' | 'weir' | 'meshPad' | 'vortexBreaker' | 'perforatedBaffle' | 'vanePack')[]
  /** liquid levels as fraction of ID, used for x-ray fill (water below oil) */
  levels?: { water?: number; oil?: number }
  insulated?: boolean
  /** saddle height: distance from deck (y=0) to the bottom of the shell */
  elevation: number
}

/** Origin = deck-level centre of the skirt/legs base. Axis along +Y. */
export interface VerticalVessel extends EquipmentBase {
  kind: 'verticalVessel'
  id: number
  tt: number
  wall: number
  /** bottom tangent line height above deck */
  elevation: number
  support: 'skirt' | 'legs'
  internals?: ('inletDiverter' | 'meshPad' | 'vortexBreaker' | 'cyclones' | 'vanePack')[]
  levels?: { liquid?: number }
  platform?: boolean // top access platform + ladder
}

/** TEMA shell & tube. Origin = shell axis midpoint. Axis along local +X. */
export interface ShellTube extends EquipmentBase {
  kind: 'shellTube'
  temaType: string // e.g. "AES"
  shellOd: number
  length: number // tubesheet-to-tubesheet
  channelLength: number
  tubeCount: number
  tubeOd: number
  elevation: number // deck to shell bottom
}

/** Horizontal centrifugal pump + motor on a baseplate. Origin = baseplate centre at deck level. Shaft along local +X, motor at -X. */
export interface PumpPackage extends EquipmentBase {
  kind: 'pumpPackage'
  stages: number
  motorKw: number
  baseplate: [number, number] // length (X), width (Z)
}

/** Centrifugal compressor train on skid: motor - gearbox - barrel compressor. Origin = skid centre at deck. Train along local +X. */
export interface CompressorPackage extends EquipmentBase {
  kind: 'compressorPackage'
  skid: [number, number]
  motorKw: number
}

/** Pig launcher/receiver. Origin = barrel axis mid point. Axis along local +X, closure at +X end. */
export interface PigTrap extends EquipmentBase {
  kind: 'pigTrap'
  majorBarrelNps: number
  minorBarrelNps: number
  length: number
  elevation: number
}

/** Chemical injection skid — tanks, metering pumps, bund. Origin = skid centre at deck. */
export interface ChemSkid extends EquipmentBase {
  kind: 'chemSkid'
  skid: [number, number]
  tanks: number
}

/** Enclosed module (local equipment room / switchgear). Origin = floor centre. */
export interface Module extends EquipmentBase {
  kind: 'module'
  size: Vec3 // x, y, z extents
}

/** Production / test manifold: header pipes with branch valves. Origin = header centre. */
export interface Manifold extends EquipmentBase {
  kind: 'manifold'
  slots: number
  headers: { name: string; nps: number; y: number; z: number }[]
  length: number
}

export type Equipment =
  | HorizontalVessel
  | VerticalVessel
  | ShellTube
  | PumpPackage
  | CompressorPackage
  | PigTrap
  | ChemSkid
  | Module
  | Manifold

export type EquipmentKind = Equipment['kind']

/** Reference to a point a line connects to. */
export type LineEnd =
  | { equipment: string; nozzle: string }
  | { offDeck: string } // free end leaving the modelled area (e.g. "To cellar deck")
  | { line: string } // tees into another line (branch end)

export interface PipeLine {
  /** ISO line number: SIZE-SERVICE-SEQ-SPEC-INSULATION e.g. 10"-PG-1101-C3A-H */
  tag: string
  service: Service
  system: SystemId
  nps: number
  schedule: '40' | '80' | 'XS' | '160' | 'STD'
  spec: string // piping class
  insulation?: 'H' | 'P' | 'C' // heat conservation, personnel protection, cold
  /** orthogonal route polyline, deck-local. First/last points are the end connections. */
  route: Vec3[]
  from: LineEnd
  to: LineEnd
  design: DesignData
  /** if true the line is drawn but considered "ghost" (off-deck stub) */
  stub?: boolean
  /** deluge pipes: render open spray nozzles along the last segment */
  sprayNozzles?: boolean
}

export type ValveType =
  | 'gate'
  | 'globe'
  | 'ball'
  | 'check'
  | 'butterfly'
  | 'control' // globe body + diaphragm actuator
  | 'esdv' // ball + quarter-turn spring-return actuator
  | 'bdv' // blowdown valve
  | 'psv' // pressure safety valve (angle body)
  | 'needle'

export interface Valve {
  tag: string
  type: ValveType
  line: string // PipeLine.tag
  /** route segment index (between route[seg] and route[seg+1]) */
  seg: number
  /** fractional position 0..1 along that segment of the valve CENTRE */
  t: number
  /** for PSVs the outlet goes to this line */
  outletLine?: string
  /** stem/actuator orientation hint, deck-local unit vector; default +Y */
  up?: Vec3
  /** PSVs (and other equipment-mounted valves) sit directly on a nozzle; `line` is then the outlet line */
  mount?: { equipment: string; nozzle: string }
  /** PSV outlet direction (deck frame), horizontal unit vector */
  outletDir?: Vec3
  normally: 'open' | 'closed'
  failAction?: 'FC' | 'FO' | 'FL'
  actuator?: 'handwheel' | 'gear' | 'lever' | 'diaphragm' | 'pistonSpring' | 'electric' | 'none'
  design: DesignData
}

export type InstrumentType =
  | 'PT' | 'PI' | 'PG' // pressure transmitter / indicator / gauge
  | 'TT' | 'TG'
  | 'LT' | 'LG' // level transmitter (DP / radar) / level gauge (magnetic)
  | 'FT' // flow transmitter (orifice)
  | 'PDT'
  | 'AT' // analyser

export interface Instrument {
  tag: string
  type: InstrumentType
  /** what it's mounted on */
  on: { line: string; seg: number; t: number } | { equipment: string; nozzle?: string; at?: Vec3 }
  /** offset/standoff direction for the transmitter head */
  dir?: Vec3
  range: string
  unit: string
  /** nominal live value used by the simulated historian */
  nominal: number
  alarms?: { lo?: number; hi?: number; loLo?: number; hiHi?: number }
}

export interface Plant {
  name: string
  deck: {
    name: string
    elevation: number // EL above LAT of y=0
    extent: { minX: number; maxX: number; minZ: number; maxZ: number }
    /** surroundings: the authored offshore jacket platform, or a plain onshore concrete pad */
    site?: 'offshoreAlpha' | 'onshore'
  }
  equipment: Equipment[]
  lines: PipeLine[]
  valves: Valve[]
  instruments: Instrument[]
}

/** Anything selectable carries one of these in object.userData */
export interface PickData {
  tag: string
  kind: 'equipment' | 'line' | 'valve' | 'instrument' | 'structure'
}
