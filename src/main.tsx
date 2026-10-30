import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { initAnalytics } from './analytics'

void initAnalytics()
const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)
if (root.firstElementChild) hydrateRoot(root, app)
else createRoot(root).render(app)
