// plant.json checker: the rules behind `deck-twin check`, as a pure function so anything that loads a plant applies the same ones. Zero dependencies.

export const SERVICES = ['oil', 'gas', 'multiphase', 'water', 'seawater', 'firewater', 'steam', 'air', 'nitrogen', 'chemical', 'flare', 'drain', 'fuel-gas', 'diesel', 'potable', 'cooling']

const SERVICE_CODES = { PO: 'oil', PG: 'gas', PM: 'multiphase', PW: 'water', SW: 'seawater', FW: 'firewater', ST: 'steam', IA: 'air', NG: 'nitrogen', CI: 'chemical', FL: 'flare', CD: 'drain', FG: 'fuel-gas', DF: 'diesel', DW: 'potable', CM: 'cooling', HC: 'multiphase', VF: 'flare', BD: 'flare', VA: 'flare', OD: 'drain', WI: 'water', WP: 'water', CW: 'cooling', MI: 'chemical', TG: 'chemical', PA: 'air', UA: 'air', N2: 'nitrogen', FO: 'diesel' }
const DN = { 15: 0.5, 20: 0.75, 25: 1, 32: 1.25, 40: 1.5, 50: 2, 65: 2.5, 80: 3, 100: 4, 125: 5, 150: 6, 200: 8, 250: 10, 300: 12, 350: 14, 400: 16, 450: 18, 500: 20, 600: 24, 750: 30, 900: 36 }
const CLASS_DIGITS = { 1: 150, 3: 300, 6: 600, 9: 900, 15: 1500, 25: 2500 }

// Same convention as assembly/linetag.ts: SIZE"-SERVICE-SEQ-CLASS-INSULATION.
export function parseLineTag(tag = '') {
  const m = /^\s*((?:DN\s?\d+)|(?:\d+(?:[- ]\d+\/\d+|\/\d+|\.\d+)?)\s*(?:["”″]|in)?)\s*-\s*([A-Z][A-Z0-9]{0,3})\s*-\s*([A-Z0-9]+)(?:\s*-\s*([A-Z0-9#]+))?(?:\s*-\s*([A-Z]{1,2}))?\s*$/i.exec(tag)
  if (!m) return {}
  const t = m[1].trim().replace(/["”″]|in$/i, '')
  const dn = /^DN\s?(\d+)$/i.exec(t)
  const mixed = /^(\d+)[- ](\d+)\/(\d+)$/.exec(t)
  const frac = /^(\d+)\/(\d+)$/.exec(t)
  const nps = dn ? DN[Number(dn[1])] : mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : frac ? Number(frac[1]) / Number(frac[2]) : Number(t) || undefined
  const code = m[2].toUpperCase()
  const cls = m[4]?.toUpperCase()
  const direct = cls && /(?:CL)?(150|300|600|900|1500|2500)#?/.exec(cls)
  const digits = cls && /^[A-Z]+(\d{1,2})[A-Z]*$/.exec(cls)
  return { nps, code, service: SERVICE_CODES[code], pipingClass: cls, rating: direct ? Number(direct[1]) : digits ? CLASS_DIGITS[digits[1]] : undefined, insulation: m[5]?.toUpperCase() }
}

/** A file written in another plant format, named plainly: these fail in confusing ways further down. */
export function wrongFormat(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'A plant.json is a JSON object with "name", "items" and "lines".'
  if (Array.isArray(spec.items)) return null
  if (Array.isArray(spec.equipment) || spec.deck)
    return 'This is not plant.json: it uses "equipment" or "deck". plant.json lists registry components in "items", each with "tag", "component" and "position", and lines join them as "TAG.port". See references/plant-json.md.'
  return null
}

/** spec: parsed plant.json. items: registry entries { name, anchor, params, defaults, ports }. Returns [{ level, where, message }]. */
export function checkPlant(spec, items) {
  const byName = new Map(items.map((i) => [i.name, i]))
  const issues = []
  const err = (where, message) => issues.push({ level: 'error', where, message })
  const warn = (where, message) => issues.push({ level: 'warning', where, message })
  const wrong = wrongFormat(spec)
  if (wrong) return [{ level: 'error', where: 'plant', message: wrong }]
  if (!spec.name) warn('plant', 'Add a "name".')
  if (!Array.isArray(spec.items)) err('plant', '"items" must be an array.')
  const tags = new Map()
  for (const it of spec.items ?? []) {
    const where = it.tag ?? '(no tag)'
    if (!it.tag) err(where, 'Every item needs a "tag".')
    else if (tags.has(it.tag)) err(where, 'Duplicate tag.')
    const comp = byName.get(it.component)
    if (!comp) {
      const close = items.filter((i) => i.name.includes(String(it.component).split('-')[0])).map((i) => i.name).slice(0, 4)
      err(where, `Unknown component "${it.component}".${close.length ? ` Close: ${close.join(', ')}.` : ''}`)
    } else if (comp.anchor === 'inline') warn(where, `"${it.component}" is an inline component. Put it on a line ("inline": [...]) instead of in items.`)
    if (it.position && !(Array.isArray(it.position) && it.position.length === 3 && it.position.every(Number.isFinite))) err(where, 'position must be [x, y, z] in metres.')
    if (it.rotation !== undefined && !Number.isFinite(it.rotation)) err(where, 'rotation must be a number of degrees.')
    if (comp && it.props)
      for (const [k, v] of Object.entries(it.props)) {
        const p = comp.params.find((x) => x.key === k)
        if (!p && !(k in comp.defaults)) warn(where, `Prop "${k}" is not a ${comp.name} prop. Known: ${comp.params.map((x) => x.key).join(', ')}.`)
        if (p?.type === 'number' && typeof v === 'number' && (v < p.min || v > p.max)) warn(where, `${k} = ${v} is outside ${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}.`)
        if (p?.type === 'select' && !p.options.some((o) => (typeof o === 'object' ? o.value : o) === v)) warn(where, `${k} = ${JSON.stringify(v)} is not one of ${p.options.map((o) => JSON.stringify(typeof o === 'object' ? o.value : o)).join(', ')}.`)
      }
    if (it.tag) tags.set(it.tag, { it, comp })
  }
  const used = new Set()
  const lineTags = new Set()
  for (const l of spec.lines ?? []) {
    const where = l.tag ?? `${l.from} → ${l.to}`
    if (!l.tag) warn(where, 'Give the line a line number as "tag", e.g. 6"-PO-1001-C3A-N.')
    else if (lineTags.has(l.tag)) err(where, 'Duplicate line tag.')
    lineTags.add(l.tag)
    if (l.service && !SERVICES.includes(l.service)) warn(where, `service "${l.service}" is not one of ${SERVICES.join(', ')}.`)
    const ends = []
    if (typeof l.from === 'object' && typeof l.to === 'object') err(where, 'Both ends are battery limits. At least one end must be an item port.')
    for (const ref of [l.from, l.to]) {
      if (ref && typeof ref === 'object') {
        if (!(Array.isArray(ref.at) && ref.at.length === 3 && ref.at.every(Number.isFinite))) err(where, 'A battery-limit end needs "at": [x, y, z] in metres.')
        continue
      }
      if (typeof ref !== 'string' || !ref.includes('.')) {
        err(where, `"${ref}" must be "TAG.port" or a battery limit { "at": [x, y, z] }.`)
        continue
      }
      const i = ref.lastIndexOf('.')
      const tag = ref.slice(0, i)
      const port = ref.slice(i + 1)
      const t = tags.get(tag)
      if (!t) {
        err(where, `"${ref}": no item tagged ${tag}.`)
        continue
      }
      if (!t.comp) continue
      const p = t.comp.ports.find((x) => x.id === port)
      if (!p) {
        const msg = `"${ref}": ${t.comp.name} has no port "${port}" at its default props. Ports: ${t.comp.ports.map((x) => x.id).join(', ') || 'none'}.`
        t.it.props ? warn(where, msg + ' (It may exist for your props.)') : err(where, msg)
        continue
      }
      used.add(`${tag}.${port}`)
      ends.push({ ref, p, overridden: Object.keys(t.it.props ?? {}).some((k) => /nps|size/i.test(k)) })
    }
    const lt = parseLineTag(l.tag)
    if (l.tag && !lt.code) warn(where, 'Line tag is not SIZE"-SERVICE-SEQ-CLASS-INSULATION, so size, service and class are not read from it.')
    if (lt.code && !lt.service && !l.service) warn(where, `Service code "${lt.code}" is not recognised. Set "service" on the line.`)
    if (lt.nps && ends[0] && !ends[0].overridden && !l.nps && lt.nps !== ends[0].p.nps) warn(where, `Line number says ${lt.nps}" but ${ends[0].ref} is ${ends[0].p.nps}". Set the nozzle size prop or fix the line number.`)
    if (lt.rating && ends[0]?.p.rating && lt.rating < ends[0].p.rating) warn(where, `Piping class ${lt.pipingClass} is Class ${lt.rating}, below ${ends[0].ref} (Class ${ends[0].p.rating}).`)
    if (l.from === l.to) err(where, 'from and to are the same port.')
    for (const v of l.inline ?? []) {
      const comp = byName.get(v.component)
      if (!comp) err(where, `Inline component "${v.component}" does not exist.`)
      else if (!comp.ports.some((p) => p.id === 'A') || !comp.ports.some((p) => p.id === 'B')) err(where, `"${v.component}" is not inline (needs ports A and B).`)
      if (v.at !== undefined && !(v.at >= 0 && v.at <= 1)) err(where, `inline "at" must be 0–1.`)
    }
  }
  for (const { it, comp } of tags.values()) {
    if (!comp) continue
    for (const p of comp.ports.filter((x) => (x.kind ?? 'process') === 'process'))
      if (!used.has(`${it.tag}.${p.id}`)) warn(it.tag, `Process port "${p.id}" (${p.label}) is not connected.`)
  }
  return issues
}
