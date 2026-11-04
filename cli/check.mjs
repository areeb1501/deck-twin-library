// plant.json checker: the rules behind `decktwin check`, as a pure function so anything that loads a plant applies the same ones. Zero dependencies.

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

const TOP_KEYS = ['$schema', 'name', 'description', 'source', 'items', 'lines', 'camera', 'sea']
const ITEM_KEYS = ['tag', 'component', 'props', 'position', 'rotation']
const LINE_KEYS = ['tag', 'from', 'to', 'nps', 'service', 'schedule', 'insulated', 'elevation', 'order', 'via', 'supports', 'inline']

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const here = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = here
    }
  }
  return row[b.length]
}

/** The real names nearest a wrong one: shared words count first, then spelling. */
export function closest(word, names, n = 3) {
  const w = String(word).toLowerCase()
  const parts = w.split(/[^a-z0-9]+/).filter((x) => x.length > 1)
  return names
    .map((name) => ({ name, shared: parts.filter((x) => name.toLowerCase().includes(x)).length, d: distance(w, name.toLowerCase()) }))
    .filter((x) => x.shared > 0 || x.d <= Math.max(2, w.length / 3))
    .sort((a, b) => b.shared - a.shared || a.d - b.d)
    .slice(0, n)
    .map((x) => x.name)
}

/**
 * The one name a wrong one is plainly a misspelling of, or null. An agent acts on what `fix` says, so this stays strict:
 * "hp-separator" shares a word with three separators, and naming one would put the wrong equipment in a file that passes.
 */
export function clearMatch(word, names) {
  const w = String(word).toLowerCase()
  const [best, next] = names.map((name) => ({ name, d: distance(w, name.toLowerCase()) })).sort((a, b) => a.d - b.d)
  if (!best || best.d > Math.max(2, Math.floor(w.length / 4))) return null
  return !next || next.d - best.d >= 2 ? best.name : null
}

/** The fix for a wrong component name: one name for a typo, otherwise a choice for the agent to make. */
function componentFix(wrong, names) {
  const one = clearMatch(wrong, names)
  if (one) return `Did you mean "${one}"? Check it with decktwin info ${one}.`
  const close = closest(wrong, names)
  return close.length ? `Choose the part that matches the documents: compare ${close.join(', ')} with decktwin info <name>, or run decktwin search <words>.` : 'Run decktwin search <words> and use a name it returns.'
}

const quoted = (list) => list.map((x) => `"${x}"`).join(', ')

/** A file written in another plant format, named plainly: these fail in confusing ways further down. */
export function wrongFormat(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'A plant.json is a JSON object with "name", "items" and "lines".'
  if (Array.isArray(spec.items)) return null
  if (Array.isArray(spec.equipment) || spec.deck)
    return 'This is not plant.json: it uses "equipment" or "deck". plant.json lists registry components in "items", each with "tag", "component" and "position", and lines join them as "TAG.port". See references/plant-json.md.'
  return null
}

/** What to do after a run: the last line an agent reads. */
export function nextStep(issues) {
  const e = issues.filter((i) => i.level === 'error').length
  if (e) return 'Fix every error, then run validate again.'
  if (issues.length) return 'Valid. Fix each warning or say why it stays, then open it in the UI.'
  return 'Valid. Open it in the UI, which also checks line clearances, overlaps and floating items.'
}

/**
 * spec: parsed plant.json. items: registry entries { name, anchor, params, defaults, ports }.
 * Reports every problem in one pass, as [{ level, code, where, path, message, fix }]:
 * `path` points into the file, and `fix` says what to change.
 */
export function checkPlant(spec, items) {
  const byName = new Map(items.map((i) => [i.name, i]))
  const names = items.map((i) => i.name)
  const inlineNames = items.filter((i) => i.anchor === 'inline').map((i) => i.name)
  const issues = []
  const add = (level) => (code, where, path, message, fix) => issues.push({ level, code, where, path, message, fix })
  const err = add('error')
  const warn = add('warning')
  const wrong = wrongFormat(spec)
  if (wrong) {
    err('wrong-format', 'plant', '', wrong, 'Rewrite it with "items" and "lines". Top-level "equipment", "deck", "valves" and "instruments" belong to other formats.')
    return issues
  }
  if (!spec.name) warn('no-name', 'plant', 'name', 'Add a "name".', 'Set "name" to the plant or unit name.')
  if (!Array.isArray(spec.items)) err('no-items', 'plant', 'items', '"items" must be an array.', 'Add "items": [{ "tag": "V-100", "component": "horizontal-separator", "position": [0, 0, 0] }].')
  for (const k of Object.keys(spec)) if (!TOP_KEYS.includes(k)) warn('unknown-key', 'plant', k, `"${k}" is not a plant.json key, so it is ignored.`, /^(valves|instruments)$/.test(k) ? `Put them in a line's "inline" list.` : `Remove it. Keys: ${quoted(TOP_KEYS)}.`)

  const tags = new Map()
  ;(spec.items ?? []).forEach((it, n) => {
    const at = `items[${n}]`
    const where = it.tag ?? '(no tag)'
    if (!it.tag) err('no-tag', where, `${at}.tag`, 'Every item needs a "tag".', 'Use the tag from the documents, such as "V-100".')
    else if (tags.has(it.tag)) err('duplicate-tag', where, `${at}.tag`, 'Duplicate tag.', `It is also used by ${tags.get(it.tag).at}. Give each item its own tag.`)
    for (const k of Object.keys(it)) if (!ITEM_KEYS.includes(k)) warn('unknown-key', where, `${at}.${k}`, `"${k}" is not an item key, so it is ignored.`, k === 'type' || k === 'kind' ? 'Use "component" with a registry name.' : `Keys: ${quoted(ITEM_KEYS)}. Component settings go in "props".`)
    const comp = byName.get(it.component)
    if (!comp) {
      const close = closest(it.component, names)
      err('unknown-component', where, `${at}.component`, `Unknown component "${it.component}".${close.length ? ` Close: ${close.join(', ')}.` : ''}`, componentFix(it.component, names))
    } else if (comp.anchor === 'inline') warn('inline-in-items', where, `${at}.component`, `"${it.component}" is an inline component. Put it on a line ("inline": [...]) instead of in items.`, `Move it to the "inline" list of the line it sits on.`)
    if (it.position && !(Array.isArray(it.position) && it.position.length === 3 && it.position.every(Number.isFinite))) err('bad-position', where, `${at}.position`, 'position must be [x, y, z] in metres.', 'Use three numbers, such as [0, 0, 0]. y is the level the item stands on.')
    if (it.rotation !== undefined && !Number.isFinite(it.rotation)) err('bad-rotation', where, `${at}.rotation`, 'rotation must be a number of degrees.', 'Use a number, such as 90.')
    if (comp && it.props)
      for (const [k, v] of Object.entries(it.props)) {
        const p = comp.params.find((x) => x.key === k)
        const known = [...new Set([...comp.params.map((x) => x.key), ...Object.keys(comp.defaults)])]
        if (!p && !(k in comp.defaults)) {
          const one = clearMatch(k, known)
          warn('unknown-prop', where, `${at}.props.${k}`, `Prop "${k}" is not a ${comp.name} prop. Known: ${comp.params.map((x) => x.key).join(', ')}.`, one ? `Did you mean "${one}"? Otherwise remove it.` : `Remove it, or run decktwin info ${comp.name}.`)
        }
        if (p?.type === 'number' && typeof v === 'number' && (v < p.min || v > p.max)) warn('prop-range', where, `${at}.props.${k}`, `${k} = ${v} is outside ${p.min}–${p.max}${p.unit ? ' ' + p.unit : ''}.`, `Use a value from ${p.min} to ${p.max}.`)
        if (p?.type === 'select' && !p.options.some((o) => (typeof o === 'object' ? o.value : o) === v)) warn('prop-option', where, `${at}.props.${k}`, `${k} = ${JSON.stringify(v)} is not one of ${p.options.map((o) => JSON.stringify(typeof o === 'object' ? o.value : o)).join(', ')}.`, 'Use one of the listed values.')
      }
    if (it.tag && !tags.has(it.tag)) tags.set(it.tag, { it, comp, at })
  })

  const used = new Set()
  const lineTags = new Map()
  ;(spec.lines ?? []).forEach((l, n) => {
    const at = `lines[${n}]`
    const end = (e) => (typeof e === 'string' ? e : (e?.label ?? 'battery limit'))
    const where = l.tag ?? `${end(l.from)} → ${end(l.to)}`
    if (!l.tag) err('no-tag', where, `${at}.tag`, 'Every line needs a line number as "tag", e.g. 6"-PO-1001-C3A-N.', 'Use the number from the line list or drawing, or write one in that form.')
    else if (lineTags.has(l.tag)) err('duplicate-tag', where, `${at}.tag`, 'Duplicate line tag.', `It is also used by ${lineTags.get(l.tag)}. If a tee splits this line, add a letter to one sequence number: 4"-PO-303A-D6A-N.`)
    if (l.tag && !lineTags.has(l.tag)) lineTags.set(l.tag, at)
    for (const k of Object.keys(l)) if (!LINE_KEYS.includes(k)) warn('unknown-key', where, `${at}.${k}`, `"${k}" is not a line key, so it is ignored.`, k === 'route' ? 'The router builds the route. Use "via" for waypoints.' : `Keys: ${quoted(LINE_KEYS)}.`)
    if (l.service && !SERVICES.includes(l.service)) {
      const one = clearMatch(l.service, SERVICES)
      warn('bad-service', where, `${at}.service`, `service "${l.service}" is not one of ${SERVICES.join(', ')}.`, one ? `Did you mean "${one}"?` : 'Use one of the listed services.')
    }
    const ends = []
    if (typeof l.from === 'object' && l.from && typeof l.to === 'object' && l.to) err('two-battery-limits', where, at, 'Both ends are battery limits. At least one end must be an item port.', 'Change "from" or "to" to "TAG.port".')
    for (const side of ['from', 'to']) {
      const ref = l[side]
      if (ref && typeof ref === 'object') {
        if (!(Array.isArray(ref.at) && ref.at.length === 3 && ref.at.every(Number.isFinite))) err('bad-battery-limit', where, `${at}.${side}`, 'A battery-limit end needs "at": [x, y, z] in metres.', 'Set "at" to where the line leaves the plot.')
        continue
      }
      if (typeof ref !== 'string' || !ref.includes('.')) {
        err('bad-end', where, `${at}.${side}`, `"${ref}" must be "TAG.port" or a battery limit { "at": [x, y, z] }.`, 'A line can\'t end on another line. For a branch, add a "tee" item and join its ports.')
        continue
      }
      const i = ref.lastIndexOf('.')
      const tag = ref.slice(0, i)
      const port = ref.slice(i + 1)
      const t = tags.get(tag)
      if (!t) {
        const one = clearMatch(tag, [...tags.keys()])
        err('unknown-item', where, `${at}.${side}`, `"${ref}": no item tagged ${tag}.`, one ? `Did you mean "${one}.${port}"? Otherwise add the item.` : 'Add the item, or fix the tag.')
        continue
      }
      if (!t.comp) continue
      const p = t.comp.ports.find((x) => x.id === port)
      if (!p) {
        const ids = t.comp.ports.map((x) => x.id)
        const one = clearMatch(port, ids)
        const msg = `"${ref}": ${t.comp.name} has no port "${port}" at its default props. Ports: ${ids.join(', ') || 'none'}.`
        const fix = one ? `Did you mean "${tag}.${one}"?` : `Run decktwin info ${t.comp.name} and use one of its ports.`
        if (t.it.props) warn('unknown-port', where, `${at}.${side}`, msg + ' (It may exist for your props.)', fix)
        else err('unknown-port', where, `${at}.${side}`, msg, fix)
        continue
      }
      used.add(`${tag}.${port}`)
      ends.push({ ref, p, overridden: Object.keys(t.it.props ?? {}).some((k) => /nps|size/i.test(k)) })
    }
    const lt = parseLineTag(l.tag)
    if (l.tag && !lt.code) warn('bad-line-tag', where, `${at}.tag`, 'Line tag is not SIZE"-SERVICE-SEQ-CLASS-INSULATION, so size, service and class are not read from it.', 'Write it in that form, such as 6"-PO-1001-C3A-N, or set "nps" and "service" on the line.')
    if (lt.code && !lt.service && !l.service) warn('unknown-service-code', where, `${at}.tag`, `Service code "${lt.code}" is not recognised. Set "service" on the line.`, `Add "service" with one of: ${SERVICES.join(', ')}.`)
    if (lt.nps && ends[0] && !ends[0].overridden && !l.nps && lt.nps !== ends[0].p.nps) warn('size-mismatch', where, `${at}.tag`, `Line number says ${lt.nps}" but ${ends[0].ref} is ${ends[0].p.nps}". Set the nozzle size prop or fix the line number.`, `Set the matching size prop on ${ends[0].ref.slice(0, ends[0].ref.lastIndexOf('.'))}, or set "nps" on the line if a reducer is intended.`)
    if (lt.rating && ends[0]?.p.rating && lt.rating < ends[0].p.rating) warn('class-mismatch', where, `${at}.tag`, `Piping class ${lt.pipingClass} is Class ${lt.rating}, below ${ends[0].ref} (Class ${ends[0].p.rating}).`, `Use a Class ${ends[0].p.rating} piping class, or set the item's "rating" prop.`)
    if (l.from === l.to) err('same-port', where, at, 'from and to are the same port.', 'Point one end at the next item in the flow.')
    ;(l.inline ?? []).forEach((v, m) => {
      const path = `${at}.inline[${m}]`
      const comp = byName.get(v.component)
      if (!comp) {
        err('unknown-component', where, `${path}.component`, `Inline component "${v.component}" does not exist.`, componentFix(v.component, inlineNames))
      } else if (!comp.ports.some((p) => p.id === 'A') || !comp.ports.some((p) => p.id === 'B')) err('not-inline', where, `${path}.component`, `"${v.component}" is not inline (needs ports A and B).`, `Put it in "items" and join it to the line through its ports. Run decktwin info ${v.component}.`)
      if (v.at !== undefined && !(v.at >= 0 && v.at <= 1)) err('bad-inline-at', where, `${path}.at`, `inline "at" must be 0–1.`, 'Use a fraction along the line, such as 0.5.')
    })
  })
  for (const { it, comp, at } of tags.values()) {
    if (!comp) continue
    for (const p of comp.ports.filter((x) => (x.kind ?? 'process') === 'process'))
      if (!used.has(`${it.tag}.${p.id}`)) warn('open-port', it.tag, at, `Process port "${p.id}" (${p.label}) is not connected.`, `Add a line from ${it.tag}.${p.id}, or report why it stays open.`)
  }
  return issues
}
