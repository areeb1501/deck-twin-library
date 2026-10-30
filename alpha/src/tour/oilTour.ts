/**
 * "Follow the oil" tour (plan 01): a barrel of oil from the reservoir to the export riser. A camera flight
 * up the jacket, then one continuous walk: the christmas tree on the cellar deck, up the west stair to the
 * manifold, through HP and LP separation, the crude cooler, the export pumps and the pig launcher, across the
 * west bridge to RP's fiscal meter and export pig launcher, then a closing flight. Coordinates are
 * deck-local (model/site.ts); narration reads the live simulation so the numbers are the plant's own.
 */
import type { PlanRect } from '../model/types'
import { instrumentHistory, runState, useSim } from '../state/sim'
import type { Stop } from './engine'

/** Alpha's west stair tower (same rectangle as the field tour) */
const ST_W: PlanRect = { x0: -33, x1: -29.9, z0: 8.9, z1: 14.7 }

const n0 = (v: number) => Math.round(v).toLocaleString()
const n1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const sim = () => useSim.getState()
const r = () => sim().result
const p = () => sim().process

/** latest reading of an instrument (historian / dynamic model), or undefined */
const inst = (tag: string) => {
  const h = instrumentHistory(tag, 1)
  return h.length ? h[h.length - 1] : undefined
}

const WELL = 'XT-140'
const choke = (tag: string) => sim().knobs.chokes[tag] ?? 60
const wellsOnline = () => {
  const w = Object.values(r()?.wells ?? {})
  return `${w.filter((x) => x.online).length} of ${w.length}`
}
const pump = (tag: string) => runState(tag)
/** a valve with no sim entry has never been moved: it sits in its normal (open) position */
const valveState = (tag: string) => {
  const v = sim().valves[tag]
  if (!v) return 'open'
  if (v.pos > 0.98) return 'open'
  if (v.pos < 0.02) return 'closed'
  return v.cmd === 'open' ? 'opening' : 'closing'
}

export const OIL_TOUR: Stop[] = [
  {
    id: 'reservoir',
    title: 'Reservoir to wellhead',
    where: 'Jacket · seabed to EL +20',
    say: () =>
      'The oil starts 2–3 km below the seabed, pushed up the well tubing by reservoir pressure. Conductors carry each well up the jacket to the cellar deck. ' +
      (r() ? `Water injection holds reservoir support at ${n0(p().reservoir * 100)} %; ${wellsOnline()} wells are online.` : ''),
    fly: { pos: [18, 4, 8], target: [0, 20, -12], hold: 10 },
  },
  {
    id: 'tree',
    title: 'Christmas tree & choke',
    where: 'Alpha cellar deck · EL +20',
    say: 'At the top of each conductor sits a christmas tree: master valves, the wing valve and the choke that sets how hard the well flows.',
    walk: {
      start: { level: 'cellar', at: [1.3, -7.6], face: [0, -10.5] },
      beats: [
        {
          look: WELL,
          kb: true,
          hold: 9,
          say: () =>
            `The choke throttles the well stream from reservoir pressure down to manifold pressure. Well A-04's choke is set ${n0(choke(WELL))} % open, flowing ${n0(r()?.wells[WELL]?.oil ?? 0)} bbl/d of oil with its gas and water.`,
        },
        { goto: [-29.3, 9.6], say: 'The flowlines rise to the production deck. We take the west stair tower up after them.' },
        { stair: ST_W, from: -8, to: 0, off: [-29.3, 9.6], say: 'Up one storey to the production deck.' },
      ],
    },
  },
  {
    id: 'manifold',
    title: 'Production manifold',
    where: 'Alpha production deck · EL +28',
    say: 'Every Alpha well, and the six on WHP-N across the north bridge, arrives at one manifold.',
    walk: {
      start: { level: 'production', at: [-29.3, 9.6], face: [-26.6, -9] },
      beats: [
        { goto: [-26.6, -4.0] },
        {
          look: 'M-1000',
          hold: 8,
          say: () =>
            `The manifold commingles all the wells into one header for the HP separator; a single well can be switched to the test separator to be measured. Together they flow ${n0(r()?.oilProduced ?? 0)} bbl/d of oil.`,
        },
      ],
    },
  },
  {
    id: 'hp-sep',
    title: 'HP three-phase separator',
    where: 'Alpha production deck · EL +28',
    say: 'The first and biggest step: separating the well stream.',
    walk: {
      start: { level: 'production', at: [-26.6, -4.0], face: [-13, -9] },
      beats: [
        { goto: [-13, -4.2] },
        {
          look: 'V-1100',
          kb: true,
          hold: 10,
          say: () =>
            `In V-1100 the stream slows and separates by gravity: gas off the top, oil over the weir, water out of the boot. Level ${n1(p().hpLevel)} % at ${n1(p().hpPressure)} barg. Split now: ${n0(r()?.oilProduced ?? 0)} bbl/d oil, ${n1(r()?.gasProduced ?? 0)} MMscfd gas, ${n0(r()?.water ?? 0)} bbl/d water.`,
        },
      ],
    },
  },
  {
    id: 'lp-sep',
    title: 'LP separator',
    where: 'Alpha production deck · EL +28',
    say: 'The oil leaves the HP separator through its level valve and drops to about 8 barg.',
    walk: {
      start: { level: 'production', at: [-13, -4.2], face: [5, -9] },
      beats: [
        { goto: [5, -4.0] },
        {
          look: 'V-1300',
          hold: 8,
          say: () =>
            `At the lower pressure the last dissolved gas flashes off, so the crude is stable and will not boil in the pipeline. The flash gas goes to the compressor suction. Level ${n1(p().lpLevel)} %.`,
        },
      ],
    },
  },
  {
    id: 'cooler',
    title: 'Crude cooler',
    where: 'Alpha production deck · EL +28',
    say: 'Hot crude would soften the pipeline coating and boil off vapour, so it is cooled before export.',
    walk: {
      start: { level: 'production', at: [5, -4.0], face: [6, -14.8] },
      beats: [
        { goto: [10.5, -11.2] },
        {
          look: 'E-1400',
          hold: 8,
          say: () =>
            `In E-1400 the crude gives its heat to the cooling medium, a closed fresh-water loop cooled by seawater. ` +
            (inst('TT-1301') !== undefined && inst('TT-1401') !== undefined ? `Crude in at ${n0(inst('TT-1301')!)} °C, out at ${n0(inst('TT-1401')!)} °C; ` : '') +
            `cooling medium supply ${n1(p().cmTemp)} °C.`,
        },
      ],
    },
  },
  {
    id: 'pumps',
    title: 'Export pumps',
    where: 'Alpha production deck · EL +28',
    say: 'The stabilised crude is at low pressure; the export pumps give it the push to reach shore.',
    walk: {
      start: { level: 'production', at: [10.5, -11.2], face: [15, -13.5] },
      beats: [
        { goto: [19.4, -11.6] },
        {
          look: 'P-1500A',
          hold: 8,
          say: () =>
            `P-1500A and B lift the crude to pipeline pressure: one duty, one standby that starts if the duty pump trips. Pump A is ${pump('P-1500A')}, pump B ${pump('P-1500B')}. ${n0(r()?.oilExport ?? 0)} bbl/d goes to export.`,
        },
      ],
    },
  },
  {
    id: 'pig',
    title: 'Pig launcher',
    where: 'Alpha production deck · EL +28',
    say: 'The last item on Alpha before the oil leaves for RP.',
    walk: {
      start: { level: 'production', at: [19.4, -11.6], face: [23, -6.5] },
      beats: [
        { goto: [23, -3.6] },
        {
          look: 'L-1600',
          hold: 7,
          say: 'The oil flows straight past the launcher. Now and then a pig is loaded and pushed down the line by the oil to scrape out wax and water, or an intelligent pig inspects the pipe wall for corrosion.',
        },
      ],
    },
  },
  {
    id: 'bridge',
    title: 'Across the west bridge',
    where: 'West bridge · EL +28',
    say: 'The export oil line runs along the north side of the 40 m west bridge to the riser platform RP.',
    walk: {
      start: { level: 'production', at: [23, -3.6], face: [-30, -13.5] },
      beats: [
        { goto: [-29, -13.5], say: 'Across Alpha to the west bridge landing.' },
        { goto: [-71, -13.5], say: () => `Along the bridge with the 10-inch oil export line beside us, carrying ${n0(r()?.oilExport ?? 0)} bbl/d.` },
      ],
    },
  },
  {
    id: 'metering',
    title: 'Fiscal metering',
    where: 'RP main deck · EL +28',
    say: 'Here the oil changes hands: it is measured to custody-transfer accuracy.',
    walk: {
      start: { level: 'production', at: [-71, -13.5], face: [-78.5, -19.5] },
      beats: [
        { goto: [-78.5, -15.6] },
        {
          look: 'X-R150',
          hold: 9,
          say: () =>
            `The fiscal meter counts every barrel sold, with a prover to check the meters and a sampler for water content and density. It reads ${n0(inst('FT-R150') ?? r()?.oilExport ?? 0)} bbl/d` +
            (inst('AT-R151') !== undefined ? ` at ${inst('AT-R151')!.toFixed(2)} % water (BS&W).` : '.'),
        },
      ],
    },
  },
  {
    id: 'riser',
    title: 'Export pig launcher & riser',
    where: 'RP main deck · EL +28',
    say: 'The last step on the platform: down the export riser to the seabed pipeline.',
    walk: {
      start: { level: 'production', at: [-78.5, -15.6], face: [-83, -5.2] },
      beats: [
        { goto: [-80, -1.4] },
        {
          look: 'L-R110',
          hold: 9,
          say: () =>
            `Past the export pig launcher, the oil drops down the riser through riser ESDV-R101, now ${valveState('ESDV-R101')}, and a subsea isolation valve, into the pipeline to shore. On an ESD both close to isolate the platform.`,
        },
      ],
    },
  },
  {
    id: 'summary',
    title: 'That’s the oil path',
    where: 'Overview',
    say: () =>
      (r() ? `Live now: ${n0(r()!.oilExport)} bbl/d of oil exported at ${n1(r()!.efficiency)} % production efficiency. ` : '') +
      'The separated gas went through scrubbing and compression to the gas export riser or to flare, and the produced water was cleaned and returned to the sea.',
    fly: { pos: [-30, 110, 120], target: [-62, 22, -12], hold: 12 },
  },
]
