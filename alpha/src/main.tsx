import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'
import { PasswordGate } from './ui/PasswordGate'
import { restoreSavedPlant } from './state/savedPlants'
import { bootDone, bootStage } from './ui/bootLoader'

// the saved plant goes in first, so a reload doesn't build the Alpha field only to swap it out
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PasswordGate>
        <App />
      </PasswordGate>
    </StrictMode>,
  )

bootStage('Building the decks')
// a last resort: a scene that never draws must not leave the loader up for ever
setTimeout(bootDone, 45_000)
void restoreSavedPlant().finally(render)
