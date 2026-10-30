import { useEffect, useRef, useState } from 'react'
import { plant as alpha } from '../model/plant'
import { onshoreStation } from '../model/examples/onshoreStation'
import { compileSpec } from '../library/compile'
import { separationTrainSpec } from '../library/examples/separationTrain'
import type { Plant } from '../model/types'
import { importPlant, plantFormats, useImportNotes } from '../state/plantFormats'
import { usePlantStore } from '../state/plantStore'
import { clearActiveSaved, openSaved, removeSaved, savePlant, showPlant, useSavedPlants } from '../state/savedPlants'

// the third plant is compiled from a topology-only PlantSpec (see library/) — edit it in the Builder
const BUILT_IN: Plant[] = [alpha, onshoreStation, compileSpec(separationTrainSpec).plant]
const slug = (name: string) => name.replace(/\W+/g, '-').toLowerCase()

/** Switch between bundled and saved plants, load any supported plant file, or export the current one. */
export function PlantMenu() {
  const plant = usePlantStore((s) => s.plant)
  const saved = useSavedPlants((s) => s.names)
  const active = useSavedPlants((s) => s.active)
  const warnings = useImportNotes((s) => s.warnings)
  const note = useImportNotes((s) => s.note)
  const [err, setErr] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const brief = plantFormats().find((f) => f.agentBrief)?.agentBrief
  const current = active && saved.includes(active) ? active : BUILT_IN.some((p) => p.name === plant.name) ? plant.name : '__custom'

  useEffect(() => {
    void useSavedPlants.getState().refresh()
  }, [])

  const chooseBuiltIn = (p: Plant) => {
    setErr(null)
    useImportNotes.getState().set([])
    clearActiveSaved()
    showPlant(p)
  }

  const chooseSaved = async (name: string) => {
    setErr(null)
    try {
      const r = await openSaved(name)
      if (!r.plant) return setErr(r.errors)
      useImportNotes.getState().set(r.warnings)
      showPlant(r.plant)
    } catch (e) {
      setErr([(e as Error).message])
    }
  }

  const onFile = async (f: File) => {
    setErr(null)
    let json: unknown
    try {
      json = JSON.parse(await f.text())
    } catch (e) {
      return setErr([`Could not parse JSON: ${(e as Error).message}`])
    }
    const r = await importPlant(json)
    if (!r.plant) return setErr(r.errors)
    const name = r.plant.name?.trim() || f.name.replace(/\.[^.]+$/, '')
    // a re-imported export keeps its own row, apart from the built-in of the same name
    const kept = await savePlant(BUILT_IN.some((p) => p.name === name) ? `${name} (imported)` : name, json)
    useImportNotes.getState().set(r.warnings, kept ? null : "This browser refused to save it, so it won't survive a reload.")
    showPlant(r.plant)
  }

  const remove = async () => {
    if (!active) return
    await removeSaved(active)
    chooseBuiltIn(alpha)
  }

  const exportJson = () => {
    // a plant drawn by a custom renderer exports the file it came from; the rest export the twin's own format
    const data = plant.custom ? plant.custom.source : plant
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slug(plant.name)}${plant.custom ? '.plant.json' : '.twin.json'}`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyBrief = async () => {
    if (!brief) return
    await navigator.clipboard.writeText(brief)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="plant-menu">
      <select
        value={current}
        aria-label="Plant"
        onChange={(e) => {
          const v = e.target.value
          const p = BUILT_IN.find((x) => x.name === v)
          if (p) chooseBuiltIn(p)
          else if (saved.includes(v)) void chooseSaved(v)
        }}
      >
        {BUILT_IN.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
        {saved.length > 0 && (
          <optgroup label="Saved in this browser">
            {saved.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </optgroup>
        )}
        {current === '__custom' && <option value="__custom">{plant.name}</option>}
      </select>
      <button onClick={() => file.current?.click()} title="Load a plant file. It stays in this browser, and comes back after a reload.">
        Load…
      </button>
      <button onClick={exportJson} title="Download the current plant as JSON">
        Export
      </button>
      {current === active && (
        <button onClick={() => void remove()} title="Delete this plant from this browser and go back to the Alpha field">
          Remove
        </button>
      )}
      {brief && (
        <button onClick={() => void copyBrief()} title="Copy the rules an AI agent needs to write a plant file that loads here">
          {copied ? 'Copied' : 'Agent rules'}
        </button>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void onFile(e.target.files[0])
          e.target.value = ''
        }}
      />
      {err && (
        <div className="plant-err">
          {err.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
      {note && <div className="plant-err">{note}</div>}
      {warnings.length > 0 && (
        <details className="plant-warn">
          <summary>
            Loaded with {warnings.length} warning{warnings.length > 1 ? 's' : ''}
          </summary>
          {warnings.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </details>
      )}
    </div>
  )
}
