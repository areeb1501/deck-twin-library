/**
 * The Alpha field guided tour: one continuous walk where the decks connect (WHP-N → north bridge →
 * cellar → production deck → weather deck → drill floor), camera flights where they don't (seabed,
 * derrick), then the south bridge into the control room, the emergency generator and up the escape
 * stair onto the helideck. Coordinates are deck-local (model/site.ts); narration reads the live
 * simulation so the numbers match what the plant is doing right now.
 */
import type { PlanRect } from '../model/types'
import { useSim } from '../state/sim'
import type { Stop } from './engine'

/** stair towers and the rig ladder, as plan rectangles the stair finder searches */
const ST_W: PlanRect = { x0: -33, x1: -29.9, z0: 8.9, z1: 14.7 }
const ST_E: PlanRect = { x0: 29.9, x1: 33, z0: -19.3, z1: -13.5 }
const LQ_ESCAPE: PlanRect = { x0: 20.9, x1: 23.8, z0: 79.9, z1: 84.9 }
const RIG_LADDER: PlanRect = { x0: 9.4, x1: 10.8, z0: -18, z1: -17 }

const n0 = (v: number) => Math.round(v).toLocaleString()
const n1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const sim = () => useSim.getState()
const r = () => sim().result

export const ALPHA_TOUR: Stop[] = [
  {
    id: 'field',
    title: 'The Alpha field',
    where: 'Overview',
    say: () =>
      `Five bridge-linked platforms in 62 m of water: the Alpha drilling & production platform in the middle, the accommodation platform (LQ) to the south, the riser & export platform RP to the west, and to the north the wellhead platform WHP-N with the water-injection platform WI beyond it. ` +
      (r() ? `Right now the field exports ${n0(r()!.oilExport)} bbl/d of oil and ${n1(r()!.gasExport)} MMscfd of gas at ${n1(r()!.efficiency)} % production efficiency.` : ''),
    fly: { pos: [-188, 186, 150], target: [-26, 6, -34], hold: 10 },
  },
  {
    id: 'rp-fly',
    title: 'Riser & export platform RP',
    where: 'RP · EL +28, west bridge',
    say: () =>
      'Alpha’s stabilised oil and dry gas cross the west bridge to RP. There they are measured to custody-transfer accuracy on the fiscal meters, pass the pig launchers and go down the export risers through the riser ESD valves on the cellar deck. ' +
      (r() ? `Right now ${n0(r()!.oilExport)} bbl/d of oil and ${n1(r()!.gasExport)} MMscfd of gas leave the field this way. ` : '') +
      'On an emergency shutdown the riser ESDVs and the subsea isolation valves close, and the blowdown valve vents the riser topsides to the cold vent stack.',
    fly: { pos: [-48, 50, 18], target: [-84, 28, -14], hold: 10 },
  },
  {
    id: 'wi-fly',
    title: 'Water-injection platform WI',
    where: 'WI · EL +28, north of WHP-N',
    say: 'Forty metres beyond WHP-N, WI lifts seawater with caisson pumps, filters it, strips the oxygen in the vacuum deaerator and pumps it to about 230 bar with two 2.6 MW injection pumps. The water crosses back over the bridge to the injector on WHP-N and holds the reservoir pressure up as the oil is produced.',
    fly: { pos: [52, 48, -110], target: [11, 29, -142], hold: 10 },
  },
  {
    id: 'subsea',
    title: 'Below the waterline',
    where: 'Jacket & seabed · EL −62',
    say: 'The steel jacket stands on the seabed 62 m down. Inside it, conductors carry each well from the mudline up to the cellar deck, risers bring export oil and gas down to the pipelines, and caissons hang the seawater and firewater pumps below sea level. Under the rig, the drill string runs down its conductor to the bit below the mudline.',
    fly: { pos: [34, -40, 26], target: [3, -62, -13], hold: 10 },
  },
  {
    id: 'whp-fly',
    title: 'Wellhead platform WHP-N',
    where: 'WHP-N · EL +28',
    say: 'Forty metres north of Alpha: six wells, a production and test manifold, a multiphase meter, desander, chemical injection and a small temporary refuge. Nobody lives here — it is run from Alpha’s control room and visited by day. We land on its deck and walk back to Alpha.',
    fly: { pos: [58, 46, -118], target: [12, 28, -74], hold: 9 },
  },
  {
    id: 'whp-walk',
    title: 'Walking the wellhead deck',
    where: 'WHP-N main deck · EL +28',
    say: 'Each christmas tree controls one well: master valves, a wing valve with the hydraulic choke, and the surface-controlled safety valve deep in the tubing, all held open by the hydraulic panel.',
    walk: {
      start: { level: 'production', at: [12, -63.5], face: [6, -72] },
      beats: [
        { goto: [9.6, -74], say: 'Into the well bay.' },
        { look: 'XT-N104', kb: true, hold: 8, say: () => `Well N-04 — flowing ${n0(r()?.wells['XT-N104']?.oil ?? 0)} bbl/d of oil through its choke. The card explains the tree and its ideal operating window.` },
        { goto: [14, -76.5] },
        { look: 'M-N200', hold: 6, say: 'The production manifold gathers all six wells into one header; any single well can be switched to the test header to be measured on its own.' },
        { goto: [18.6, -82.4] },
        { look: 'V-N240', hold: 6, say: 'The multiphase flow meter measures a test well’s oil, gas and water without separating them — that is how each well’s rate on the Operations page is known.' },
        { goto: [12, -21], say: 'Across the 40 m north bridge: production, water injection, firewater, instrument air and the vent line run along its west side, cables on the east.' },
      ],
    },
  },
  {
    id: 'cellar',
    title: 'Cellar deck — the wellheads',
    where: 'Alpha cellar deck · EL +20',
    say: 'Alpha’s own wells come up through the cellar deck: five producing trees and, under the rig, the blowout preventer on the well being drilled. The east stair tower takes us down.',
    walk: {
      start: { level: 'production', at: [12, -21], face: [29, -15] },
      beats: [
        { goto: [29.3, -14.2], say: 'To the east stair tower.' },
        { stair: ST_E, from: 0, to: -8, off: [29.3, -14.2], say: 'Down two flights per storey to the cellar deck.' },
        { goto: [15.5, -10.6] },
        { look: 'P-6400A', hold: 6, say: 'Seawater lift pump A: a long-shaft pump hung in a caisson down into the sea, supplying cooling water to the plant. B stands by and starts automatically if A trips.' },
        { goto: [1.3, -7.6] },
        { look: 'XT-140', kb: true, hold: 8, say: () => `Well A-04 — ${n0(r()?.wells['XT-140']?.oil ?? 0)} bbl/d. The flowline rises from the wing valve to the production manifold on the deck above.` },
        { goto: [6.0, -8.6] },
        { look: 'BOP-100', hold: 7, say: () => `The BOP stack on well A-06: annular and ram preventers that can close in the well if it kicks while drilling. Drilling is ${sim().knobs.drilling ? 'under way right now' : 'paused'}.` },
        { goto: [-3.5, 8.6] },
        { look: 'X-1900', hold: 5, say: 'The wellhead hydraulic control panel keeps every tree’s safety valves open — lose its pressure and the wells shut in.' },
        { goto: [-29.3, 9.6], say: 'Across the cellar to the west stair tower.' },
        { stair: ST_W, from: -8, to: 0, off: [-29.3, 9.6], say: 'Up to the production deck.' },
      ],
    },
  },
  {
    id: 'production',
    title: 'Production deck — the process',
    where: 'Alpha production deck · EL +28',
    say: 'Following the oil: from the manifold through three-phase separation, cooling and export pumping to the pipeline, then the gas through scrubbing and compression, and the produced water through degassing to the sea.',
    walk: {
      start: { level: 'production', at: [-29.3, 9.6], face: [-26, 0] },
      beats: [
        { goto: [-26.6, -4.0] },
        { look: 'M-1000', hold: 6, say: 'The production / test manifold: every Alpha and WHP-N well arrives here and is routed to the HP or the test separator.' },
        { goto: [-8.6, -3.4] },
        { look: 'V-1100', kb: true, hold: 9, say: () => `The HP separator splits the well stream into gas, oil and water, held at ${sim().knobs.hpPressure} barg — try changing that knob on the Operations page.` },
        { goto: [5, -4.0] },
        { look: 'V-1300', hold: 6, say: 'The LP separator flashes off the last gas so the crude is stable enough to export.' },
        { goto: [19.4, -11.6] },
        { look: 'P-1500B', hold: 7, say: () => `Crude export pumps, duty and standby: ${n0(r()?.oilExport ?? 0)} bbl/d goes down the riser to shore.` },
        { goto: [23, -3.6] },
        { look: 'L-1600', hold: 5, say: 'The pig launcher sends cleaning and inspection pigs down the export pipeline.' },
        { goto: [3.6, 3.5] },
        { look: 'K-2200', kb: true, hold: 9, say: () => `The export gas compressor at ${sim().knobs.compressorSpeed} % speed lifts the separator gas to pipeline pressure — ${n1(r()?.gasExport ?? 0)} MMscfd exported. If it trips, the gas goes to flare.` },
        { goto: [-22.5, 3.6] },
        { look: 'V-4100', hold: 6, say: () => `Produced water: hydrocyclones and this degasser clean ${n0(r()?.water ?? 0)} bbl/d of water to below 30 mg/l oil before it goes back to the sea.` },
        { goto: [-29.3, 9.6], say: 'Back to the west stair tower, up to the weather deck.' },
        { stair: ST_W, from: 0, to: 10, off: [-29.3, 9.6] },
      ],
    },
  },
  {
    id: 'weather',
    title: 'Weather deck — power & the rig',
    where: 'Alpha weather deck · EL +38',
    say: 'The top deck carries the power station, the electrical rooms, the crane and the drilling rig’s substructure.',
    walk: {
      start: { level: 'weather', at: [-29.3, 9.6], face: [0, 8] },
      beats: [
        { goto: [-1.6, 8.0] },
        { look: 'GT-8100A', kb: true, hold: 9, say: () => `Gas turbine generator A burns the platform’s own fuel gas: ${n1(r()?.powerGenerated ?? 0)} MW generated against ${n1(r()?.powerDemand ?? 0)} MW of demand. B is the 100 % standby.` },
        { goto: [16.4, -0.5] },
        { look: 'TR-8200A', hold: 5, say: 'Main power transformers step the 11 kV generator voltage down for the 6.6 kV switchboard in the LER.' },
        { goto: [11.0, -17.5], say: 'To the caged ladder up the side of the rig substructure.' },
        { stair: RIG_LADDER, from: 10, to: 18, off: [8.8, -16], speed: 1.3, say: 'Climbing to the drill floor, 8 m up.' },
        { goto: [3.2, -8.9], speed: 2.2 },
        { look: 'DR-100', at: [3.4, 18.3, -12.6], kb: true, eye: true, hold: 9, say: 'The drill floor: the rotary table over the well, the top drive hanging from the derrick, stands of pipe racked in the setback and the driller’s cabin behind us.' },
      ],
    },
  },
  {
    id: 'rig',
    title: 'The derrick',
    where: 'Drilling rig · EL +46 to +89',
    say: () => `From outside: the 43 m derrick over the well slot, the travelling block and top drive, mud pits and the pipe deck below. ${sim().knobs.drilling ? 'Drilling adds about 3.5 MW to the power load.' : 'Drilling is paused.'}`,
    fly: { pos: [88, 84, -80], target: [3, 64, -13], hold: 9 },
  },
  {
    id: 'lq',
    title: 'South bridge & accommodation',
    where: 'LQ platform · EL +28',
    say: 'The people side of the field: the central control room that runs all three platforms, the emergency generator, the quarters with the helideck on top, lifeboats on the east side.',
    walk: {
      start: { level: 'production', at: [6, 21], face: [6, 60] },
      beats: [
        { goto: [6, 59], say: 'Across the 40 m south bridge — diesel, potable water and firewater ride along it.' },
        { open: 'B-9300' },
        { goto: [-3, 61.4] },
        { goto: [-3, 64.0], speed: 1.8, say: 'Into the central control room.' },
        { look: 'B-9300', at: [-3, 1.7, 68.2], kb: true, hold: 9, say: () => `The CCR: DCS, safety and fire & gas operator stations and the CCTV wall. From here the operators watch ${n0(r()?.oilExport ?? 0)} bbl/d leave the field and can shut down any platform.` },
        { goto: [2.8, 64.4], speed: 2.2 },
        { open: 'B-9310' },
        { goto: [2.4, 78.5] },
        { goto: [-0.4, 78.5], speed: 1.8 },
        { look: 'B-9310', at: [-3.5, 1.4, 78.5], hold: 7, say: 'The emergency generator: a 1.5 MW diesel that starts by itself if the turbines are lost, keeping the escape lighting, radios and fire pumps alive.' },
        { goto: [22.3, 79.4], say: 'Round the quarters to the escape stair on the lifeboat deck.' },
        { stair: LQ_ESCAPE, from: 0, to: 19.2, off: [21.5, 80.6], say: 'Five storeys of quarters, then the roof, then the helideck.' },
        { via: [[20.2, 80.0, 19.2], [14.5, 77.5, 19.2]] },
        { face: [4, 21, 0], hold: 7, say: 'The helideck, 47 m above the sea: crew change arrives here. Looking north across the bridge to Alpha.' },
      ],
    },
  },
  {
    id: 'end',
    title: 'That’s the field',
    where: 'Overview',
    say: () =>
      (r() ? `Live now: ${n0(r()!.oilExport)} bbl/d oil, ${n1(r()!.gasExport)} MMscfd gas, ${n1(r()!.flare)} MMscfd to flare, ${n1(r()!.efficiency)} % production efficiency. ` : '') +
      'Open Operations to turn the knobs, Decks to jump anywhere, or Walk to explore on your own with the arrow keys.',
    fly: { pos: [210, 140, 70], target: [-6, 14, 4], hold: 12 },
  },
]
