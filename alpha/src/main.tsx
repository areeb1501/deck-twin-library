import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { sandboxes } from './dev/sandboxes'
import { PasswordGate } from './ui/PasswordGate'

const key = new URLSearchParams(location.search).get('sandbox')
const Sandbox = key ? sandboxes[key] : null

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
