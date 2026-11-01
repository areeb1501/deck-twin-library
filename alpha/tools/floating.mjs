// Floating-object audit: finds things in the 3D scene that touch nothing — no deck under them, no wall or
// beam beside them, nothing above them to hang from. Loads the app with ?nobatch (every object stays its own
// mesh), builds a BVH per geometry (three-mesh-bvh, already a dependency of drei) and, for every small mesh
// and every instance of an instanced mesh, casts 5 rays off each of its 6 bounding-box faces. A hit within
// GAP metres of a face means contact; none at all means it floats.
//
// Skips what is meant to float or fly (sea, sky, vessel, helicopter, the inspection drone, gas clouds, spray, flame,
// smoke, flow particles, overlays, crane hooks and loads, labels). The inspection units are off by default, so the
// audit switches them on and flies the drone: that puts it in the air for the skip to be tested, and puts the robot
// and the bay, which are not skipped, under the audit. Dev server must be running.
//   node tools/floating.mjs [--gap 0.25] [--max 4]      (max = largest object dimension tested, m)
import { chromium } from 'playwright-core'
const arg = (k, d) => {
  const i = process.argv.indexOf(k)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const GAP = arg('--gap', 0.25)
const MAX = arg('--max', 4)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
await page.goto(`http://localhost:${process.env.PORT ?? 5191}/alpha/demo/?nobatch`)
await page.waitForFunction(() => !!window.__scene && !!window.__sim?.getState().result, null, { timeout: 90000 })
// the drone on a mission (up and hovering), the robot parked on its pad
await page.evaluate(() => {
  window.__store.getState().setInspection(true)
  window.__inspect.dispatch({ tag: 'B-9300', unit: 'drone' })
})
await page.waitForTimeout(6000)

const res = await page.evaluate(
  async ({ GAP, MAX }) => {
    const { MeshBVH } = await import('/alpha/node_modules/three-mesh-bvh/src/index.js')
    const { BufferGeometry, Matrix4, Vector3 } = await import('/alpha/node_modules/.vite/deps/three.js')
    const sc = window.__scene
    sc.updateMatrixWorld(true)
    // meant to float / fly / move, or not solid: matched on exact group names (most effects are unnamed and
    // are dropped by the material test below: transparent or no depth write)
    const SKIP = /^(Ocean|PSV|Helicopter|Windsocks|hazardous-areas|hook|personnel|sunTarget)$|^(sky|cloud|spray|flame|smoke|overlay|label|avatar|worker|crowd|drone)/i
    const hidden = (o) => {
      for (let p = o; p; p = p.parent) if (p.visible === false) return true
      return false
    }
    const skipName = (o) => {
      for (let p = o; p; p = p.parent) if (SKIP.test(p.name || '') || p.userData?.noAudit) return true
      return false
    }
    const solid = (o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material
      return !!m && !(m.transparent && m.opacity < 0.6) && m.depthWrite !== false && m.visible !== false
    }
    const bvhs = new Map()
    const bvhOf = (g) => {
      let b = bvhs.get(g)
      if (b === undefined) {
        try {
          // position + a copy of the index only: no normals / uvs to interpolate (degenerate triangles), and
          // the app's own index buffer is left untouched (MeshBVH reorders the index it is given)
          const gg = new BufferGeometry()
          gg.setAttribute('position', g.attributes.position)
          if (g.index) gg.setIndex(g.index.clone())
          b = new MeshBVH(gg)
        } catch {
          b = null
        }
        bvhs.set(g, b)
      }
      return b
    }
    // supports: every solid visible mesh / instance, with its world box
    const sup = []
    const m4 = new Matrix4()
    sc.traverse((o) => {
      if (!o.isMesh || hidden(o) || !solid(o) || skipName(o)) return
      const g = o.geometry
      if (!g?.attributes?.position) return
      if (!g.boundingBox) g.computeBoundingBox()
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m4)
          const mw = new Matrix4().multiplyMatrices(o.matrixWorld, m4)
          sup.push({ o, i, g, mw, box: g.boundingBox.clone().applyMatrix4(mw) })
        }
      } else sup.push({ o, i: -1, g, mw: o.matrixWorld.clone(), box: g.boundingBox.clone().applyMatrix4(o.matrixWorld) })
    })
    // uniform grid over the supports' boxes
    const CELL = 3
    const grid = new Map()
    /** supports too big for the grid (field-wide merged meshes): checked on every query */
    const globals = []
    const key = (x, y, z) => `${x},${y},${z}`
    sup.forEach((s, idx) => {
      const b = s.box
      const span = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z)
      if (!Number.isFinite(span)) return
      const a = [Math.floor(b.min.x / CELL), Math.floor(b.min.y / CELL), Math.floor(b.min.z / CELL)]
      const c = [Math.floor(b.max.x / CELL), Math.floor(b.max.y / CELL), Math.floor(b.max.z / CELL)]
      if ((c[0] - a[0] + 1) * (c[1] - a[1] + 1) * (c[2] - a[2] + 1) > 20000) return void globals.push(idx)
      for (let x = a[0]; x <= c[0]; x++) for (let y = a[1]; y <= c[1]; y++) for (let z = a[2]; z <= c[2]; z++) {
        const k = key(x, y, z)
        let l = grid.get(k)
        if (!l) grid.set(k, (l = []))
        l.push(idx)
      }
    })
    const inv = new Matrix4()
    // owner: the plant item (pick tag) a mesh belongs to, else the mesh (+ instance) itself — an item never
    // supports itself, so a floating valve isn't "held up" by its own actuator
    // (a moving unit is one item too, through userData.auditOwner: its parts touch each other, so a robot off the deck
    // or a drone in the air would otherwise pass, each part held up by the next)
    const ownerOf = (s) => {
      // a beacon's lens and housing are separate meshes of one item: neither holds the other up
      if (s.i >= 0 && s.o.parent?.name === 'GaBeacons') return `beacon:${s.i}`
      for (let p = s.o; p; p = p.parent) {
        if (p.userData?.pick?.tag) return `tag:${p.userData.pick.tag}`
        if (p.userData?.auditOwner) return `unit:${p.userData.auditOwner}`
      }
      return `${s.o.uuid}:${s.i}`
    }
    sup.forEach((s) => (s.owner = ownerOf(s)))
    /** does any other owner's geometry come within the (already expanded) world box? */
    const contact = (box, owner) => {
      const a = [Math.floor(box.min.x / CELL), Math.floor(box.min.y / CELL), Math.floor(box.min.z / CELL)]
      const c = [Math.floor(box.max.x / CELL), Math.floor(box.max.y / CELL), Math.floor(box.max.z / CELL)]
      const seen = new Set()
      const lists = [globals]
      for (let x = a[0]; x <= c[0]; x++) for (let y = a[1]; y <= c[1]; y++) for (let z = a[2]; z <= c[2]; z++) lists.push(grid.get(key(x, y, z)) ?? [])
      {
        for (const idx of lists.flat()) {
          if (seen.has(idx)) continue
          seen.add(idx)
          const s = sup[idx]
          if (s.owner === owner || !s.box.intersectsBox(box)) continue
          const b = bvhOf(s.g)
          if (!b) continue
          inv.copy(s.mw).invert()
          if (b.intersectsBox(box, inv)) return true
        }
      }
      return false
    }
    const pathOf = (o) => {
      const n = []
      for (let p = o; p && n.length < 5; p = p.parent) {
        const tag = p.userData?.pick?.tag
        if (tag) return `${tag}${n.length ? ' / ' + n.reverse().join('<') : ''}`
        if (p.name) n.push(p.name)
      }
      return n.join(' < ') || '(unnamed)'
    }
    // candidates: each plant item as a whole (union of its meshes), and every untagged mesh / instance
    const items = new Map()
    for (const s of sup) {
      if (s.o.isInstancedMesh && s.o.count > 3000) continue
      let it = items.get(s.owner)
      if (!it) items.set(s.owner, (it = { owner: s.owner, box: s.box.clone(), first: s, tagged: s.owner.startsWith('tag:') }))
      else it.box.union(s.box)
    }
    const out = []
    let tested = 0
    const v = new Vector3()
    for (const it of items.values()) {
      const size = it.box.getSize(v)
      if (Math.max(size.x, size.y, size.z) > (it.tagged ? MAX * 4 : MAX) || size.lengthSq() < 1e-6) continue
      tested++
      if (!contact(it.box.clone().expandByScalar(GAP), it.owner)) {
        const s = it.first
        out.push({ what: pathOf(s.o) + (s.i >= 0 ? ` #${s.i}` : ''), mat: (Array.isArray(s.o.material) ? s.o.material[0] : s.o.material)?.name ?? '', at: it.box.getCenter(new Vector3()).toArray().map((x) => Math.round(x * 10) / 10), size: size.toArray().map((x) => Math.round(x * 100) / 100) })
      }
    }
    // ---- pass 2: pieces inside merged environment meshes (decks, outfits, jackets are many parts in one
    // geometry). Split each into connected pieces (triangles sharing a vertex position) and test every piece
    // against the rest of the scene AND the other pieces of the same mesh.
    const { Box3 } = await import('/alpha/node_modules/.vite/deps/three.js')
    let pieces = 0
    const piecesOut = []
    for (const s of sup) {
      if (s.i !== -1 || s.owner.startsWith('tag:')) continue
      const sz = s.box.getSize(new Vector3())
      if (Math.max(sz.x, sz.y, sz.z) <= MAX) continue // tested whole in pass 1
      const b = bvhOf(s.g)
      if (!b) continue
      const gg = b.geometry
      const pos = gg.attributes.position
      if (pos.count > 600000) continue
      const idx = gg.index
      const nTri = idx ? idx.count / 3 : pos.count / 3
      // union-find over vertex positions (merged parts don't share vertex indices, only positions)
      const keyOf = new Map()
      const vid = new Int32Array(pos.count)
      for (let i = 0; i < pos.count; i++) {
        const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`
        let id = keyOf.get(k)
        if (id === undefined) keyOf.set(k, (id = keyOf.size))
        vid[i] = id
      }
      const parent = new Int32Array(keyOf.size).map((_, i) => i)
      const find = (x) => {
        while (parent[x] !== x) x = parent[x] = parent[parent[x]]
        return x
      }
      const vtx = (t, c) => vid[idx ? idx.getX(t * 3 + c) : t * 3 + c]
      for (let t = 0; t < nTri; t++) {
        const a0 = find(vtx(t, 0))
        for (const c of [1, 2]) {
          const r = find(vtx(t, c))
          if (r !== a0) parent[r] = a0
        }
      }
      const comp = new Int32Array(nTri)
      const boxes = new Map()
      const pv = new Vector3()
      for (let t = 0; t < nTri; t++) {
        const r = find(vtx(t, 0))
        comp[t] = r
        let bx = boxes.get(r)
        if (!bx) boxes.set(r, (bx = new Box3()))
        for (let c = 0; c < 3; c++) bx.expandByPoint(pv.fromBufferAttribute(pos, idx ? idx.getX(t * 3 + c) : t * 3 + c))
      }
      const invS = s.mw.clone().invert()
      for (const [r, lb] of boxes) {
        const wb = lb.clone().applyMatrix4(s.mw)
        const ws = wb.getSize(new Vector3())
        if (Math.max(ws.x, ws.y, ws.z) > MAX || Math.max(ws.x, ws.y, ws.z) < 0.03) continue
        pieces++
        const q = wb.clone().expandByScalar(GAP)
        if (contact(q, s.owner)) continue
        // other pieces of the same mesh
        const lq = q.clone().applyMatrix4(invS)
        let hit = false
        b.shapecast({
          intersectsBounds: (bb) => bb.intersectsBox(lq),
          intersectsTriangle: (tri, ti) => {
            if (comp[ti] === r) return false
            if (tri.intersectsBox(lq)) return (hit = true)
            return false
          },
        })
        if (!hit) piecesOut.push({ what: pathOf(s.o) + ' (piece)', mat: (Array.isArray(s.o.material) ? s.o.material[0] : s.o.material)?.name ?? '', at: wb.getCenter(new Vector3()).toArray().map((x) => Math.round(x * 10) / 10), size: ws.toArray().map((x) => Math.round(x * 100) / 100) })
      }
    }
    return { tested, pieces, supports: sup.length, floating: out.concat(piecesOut) }
  },
  { GAP, MAX },
)
// group by what (strip instance numbers) for the summary
const groups = {}
for (const f of res.floating) {
  const k = f.what.replace(/ #\d+$/, '')
  ;(groups[k] ??= []).push(f)
}
const summary = Object.entries(groups)
  .sort((a, b) => b[1].length - a[1].length)
  .map(([k, v]) => ({ what: k, mat: v[0].mat, n: v.length, first: v[0].at, size: v[0].size }))
console.log(JSON.stringify({ tested: res.tested, pieces: res.pieces, supports: res.supports, floating: res.floating.length, groups: summary, errors: errs.slice(0, 5) }, null, 1))
await browser.close()
