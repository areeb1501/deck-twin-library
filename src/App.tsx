import { lazy, Suspense } from 'react'
import { Route, Switch } from 'wouter'
import { Shell } from './components/Shell'
import { Home } from './pages/Home'
import { ComponentsIndex } from './pages/ComponentsIndex'
import { ComponentPage } from './pages/ComponentPage'
import { DocPage } from './pages/DocPage'
import { ExamplesIndex, ExamplePage } from './pages/Examples'
import { Playground } from './pages/Playground'
import { Symbols } from './pages/Symbols'

const Shot = lazy(() => import('./pages/Shot'))

export function App() {
  return (
    <Switch>
      <Route path="/shot/:name">{(p) => <Suspense fallback={null}><Shot name={p.name} /></Suspense>}</Route>
      <Route path="/shot-plant/:name">{(p) => <Suspense fallback={null}><Shot plant={p.name} /></Suspense>}</Route>
      <Route>
        <Shell>
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
            <Route>
              <div className="mx-auto max-w-2xl px-6 py-24 text-center text-muted-fg">Page not found.</div>
            </Route>
          </Switch>
        </Shell>
      </Route>
    </Switch>
  )
}
