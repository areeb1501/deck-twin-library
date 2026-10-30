import { useRef, useState } from 'react'
import { plant as alpha } from '../model/plant'
import { onshoreStation } from '../model/examples/onshoreStation'
import type { Plant } from '../model/types'
import { usePlantStore, validatePlant } from '../state/plantStore'
import { useStore } from '../state/store'
import { buildPiping } from '../scene/piping/build'

const BUILT_IN: Plant[] = [alpha, onshoreStation]

/** Switch between bundled plants, load any plant JSON, or export the current one as a template. */
export function PlantMenu() {
  const plant = usePlantStore((s) => s.plant)
  const setPlant = usePlantStore((s) => s.setPlant)
  const [err, setErr] = useState<string[] | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const load = (p: Plant) => {
    setErr(null)
    const st = useStore.getState()
    st.select(null)
    st.setSection({ enabled: false })
    setPlant(p)
    setTimeout(() => st.requestPreset(p.deck.site === 'onshore' ? 'deck' : 'overview'), 50)
  }

  const onFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text())
      const errs = validatePlant(json)
      if (errs.length) return setErr(errs)
      // dry-run the piping fabrication so a bad route/valve/instrument is reported, not rendered
      try {
        buildPiping(json as Plant)
      } catch (e) {
        return setErr([`Piping could not be built: ${(e as Error).message}`])
      }
      load(json as Plant)
    } catch (e) {
      setErr([`Could not parse JSON: ${(e as Error).message}`])
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(plant, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${plant.name.replace(/\W+/g, '-').toLowerCase()}.plant.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="plant-menu">
      <select value={BUILT_IN.some((p) => p.name === plant.name) ? plant.name : '__custom'} onChange={(e) => {
        const p = BUILT_IN.find((x) => x.name === e.target.value)
        if (p) load(p)
      }}>
        {BUILT_IN.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
        {!BUILT_IN.some((p) => p.name === plant.name) && <option value="__custom">{plant.name}</option>}
      </select>
      <button onClick={() => file.current?.click()} title="Load a plant definition (JSON, same schema as the export)">
        Load…
      </button>
      <button onClick={exportJson} title="Download the current plant as JSON — use it as a template">
        Export
      </button>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      {err && (
        <div className="plant-err">
          {err.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
    </div>
  )
}
