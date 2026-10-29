// Line numbers as data: "8"-PG-2101-D6A-N" → size, service, sequence, piping class, ASME class and insulation code.
import { SERVICE, type Rating, type Service } from '../lib/standards'

export interface LineTag {
  nps?: number
  /** service code as written, e.g. PG */
  code?: string
  service?: Service
  seq?: string
  /** piping class as written, e.g. D6A */
  pipingClass?: string
  rating?: Rating
  /** insulation code as written, e.g. N, H, P, C */
  insulation?: string
}

/** Service codes beyond the ISO 14726 set in lib/standards (common operator conventions). */
export const SERVICE_CODES: Record<string, Service> = {
  ...Object.fromEntries(Object.entries(SERVICE).map(([k, v]) => [v.code, k as Service])),
  HC: 'multiphase',
  VF: 'flare',
  BD: 'flare',
  VA: 'flare',
  OD: 'drain',
  WI: 'water',
  WP: 'water',
  CW: 'cooling',
  MI: 'chemical',
  TG: 'chemical',
  PA: 'air',
  UA: 'air',
  N2: 'nitrogen',
  FO: 'diesel',
  PW: 'water',
}

const DN: Record<number, number> = { 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 550: 22, 600: 24, 750: 30, 900: 36, 1050: 42, 1200: 48 }
/** Pressure-class digit(s) in a piping class name, e.g. D6A → 600. A widespread convention; override per project. */
export const CLASS_DIGITS: Record<string, Rating> = { '1': 150, '3': 300, '6': 600, '9': 900, '15': 1500, '25': 2500 }

function size(s: string): number | undefined {
  const t = s.trim().replace(/["”″]|in$/i, '')
  const dn = /^DN\s?(\d+)$/i.exec(t)
  if (dn) return DN[Number(dn[1])]
  const mixed = /^(\d+)[- ](\d+)\/(\d+)$/.exec(t)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Parse SIZE-SERVICE-SEQ-CLASS-INSULATION. Missing parts stay undefined; never throws. */
export function parseLineTag(tag: string): LineTag {
  const m = /^\s*((?:DN\s?\d+)|(?:\d+(?:[- ]\d+\/\d+|\/\d+|\.\d+)?)\s*(?:["”″]|in)?)\s*-\s*([A-Z][A-Z0-9]{0,3})\s*-\s*([A-Z0-9]+)(?:\s*-\s*([A-Z0-9#]+))?(?:\s*-\s*([A-Z]{1,2}))?\s*$/i.exec(tag)
  if (!m) return {}
  const out: LineTag = { nps: size(m[1]), code: m[2].toUpperCase(), seq: m[3] }
  out.service = SERVICE_CODES[out.code!]
  if (m[4]) {
    out.pipingClass = m[4].toUpperCase()
    const direct = /(?:CL)?(150|300|600|900|1500|2500)#?/.exec(out.pipingClass)
    const digits = /^[A-Z]+(\d{1,2})[A-Z]*$/.exec(out.pipingClass)
    out.rating = direct ? (Number(direct[1]) as Rating) : digits ? CLASS_DIGITS[digits[1]] : undefined
  }
  if (m[5]) out.insulation = m[5].toUpperCase()
  return out
}
