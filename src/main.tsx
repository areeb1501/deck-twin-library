import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { Router } from 'wouter'
import './index.css'
import { App } from './App'
import { initAnalytics } from './analytics'

void initAnalytics()
const root = document.getElementById('root')!
// Hydrate only the page this HTML was built for: the shared 404 page serves many URLs, and filters in the query string start from the default view.
if (root.dataset.page === location.pathname) {
  hydrateRoot(
    root,
    <StrictMode>
      <Router ssrPath={location.pathname} ssrSearch="">
        <App />
      </Router>
    </StrictMode>,
  )
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
