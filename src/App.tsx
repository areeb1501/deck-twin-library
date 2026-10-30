// Routes: docs ship in the entry chunk; pages that need three.js or the P&ID data load on demand, warming when a link to them is hovered.
import { lazy, Suspense, type ComponentType } from 'react'
import { Route, Switch, useLocation } from 'wouter'
import { Boundary, PageError } from './components/Boundary'
import { Shell } from './components/Shell'
import { DocPage } from './pages/DocPage'

const page = <T,>(load: () => Promise<T>, pick: (m: T) => ComponentType<any>) => lazy(() => load().then((m) => ({ default: pick(m) })))
const loaders = {
  home: () => import('./pages/Home'),
  index: () => import('./pages/ComponentsIndex'),
  component: () => import('./pages/ComponentPage'),
  examples: () => import('./pages/Examples'),
  playground: () => import('./pages/Playground'),
  symbols: () => import('./pages/Symbols'),
  notFound: () => import('./pages/NotFound'),
}
const Home = page(loaders.home, (m) => m.Home)
const ComponentsIndex = page(loaders.index, (m) => m.ComponentsIndex)
const ComponentPage = page(loaders.component, (m) => m.ComponentPage)
const ExamplesIndex = page(loaders.examples, (m) => m.ExamplesIndex)
const ExamplePage = page(loaders.examples, (m) => m.ExamplePage)
const Playground = page(loaders.playground, (m) => m.Playground)
const Symbols = page(loaders.symbols, (m) => m.Symbols)
const SymbolPage = page(loaders.symbols, (m) => m.SymbolPage)
const NotFound = page(loaders.notFound, (m) => m.NotFound)
const Shot = lazy(() => import('./pages/Shot'))

const route = (path: string) =>
  path === '/' ? loaders.home : path === '/components' ? loaders.index : path.startsWith('/components/') ? loaders.component : path.startsWith('/examples') ? loaders.examples : path.startsWith('/playground') ? loaders.playground : path.startsWith('/symbols') ? loaders.symbols : null
if (typeof window !== 'undefined') {
  const warm = (e: Event) => {
    const href = (e.target as Element | null)?.closest?.('a[href^="/"]')?.getAttribute('href')
    if (href) route(href.split(/[?#]/)[0])?.().catch(() => {})
  }
  addEventListener('pointerover', warm, { passive: true })
  addEventListener('focusin', warm)
}

export function App() {
  return (
    <Switch>
      <Route path="/shot/:name">{(p) => <Suspense fallback={null}><Shot name={p.name} /></Suspense>}</Route>
      <Route path="/shot-plant/:name">{(p) => <Suspense fallback={null}><Shot plant={p.name} /></Suspense>}</Route>
      <Route>
        <Shell>
          <Pages />
        </Shell>
      </Route>
    </Switch>
  )
}

function Pages() {
  const [loc] = useLocation()
  return (
    <Boundary key={loc} fallback={(error, retry) => <PageError error={error} retry={retry} />}>
      <Suspense fallback={<div className="min-h-[70vh]" />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/components" component={ComponentsIndex} />
          <Route path="/components/:name">{(p) => <ComponentPage name={p.name} />}</Route>
          <Route path="/docs/:slug">{(p) => <DocPage slug={p.slug} />}</Route>
          <Route path="/docs">{() => <DocPage slug="introduction" />}</Route>
          <Route path="/examples" component={ExamplesIndex} />
          <Route path="/examples/:name">{(p) => <ExamplePage name={p.name} />}</Route>
          <Route path="/playground" component={Playground} />
          <Route path="/symbols" component={Symbols} />
          <Route path="/symbols/:id">{(p) => <SymbolPage id={p.id} />}</Route>
          <Route>{() => <NotFound />}</Route>
        </Switch>
      </Suspense>
    </Boundary>
  )
}
