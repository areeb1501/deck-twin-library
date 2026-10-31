import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'
import { sandboxes } from './dev/sandboxes'
import { PasswordGate } from './ui/PasswordGate'
import { restoreSavedPlant } from './state/savedPlants'

const key = new URLSearchParams(location.search).get('sandbox')
const Sandbox = key ? sandboxes[key] : null

// the saved plant goes in first, so a reload doesn't build the Alpha field only to swap it out
const render = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PasswordGate>
        {Sandbox ? (
          <Suspense fallback={null}>
            <Sandbox />
          </Suspense>
        ) : (
          <App />
        )}
      </PasswordGate>
    </StrictMode>,
  )

if (Sandbox) render()
else void restoreSavedPlant().finally(render)
