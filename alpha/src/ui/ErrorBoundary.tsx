import { Component, type ReactNode } from 'react'

/** Isolates a subtree so one bad item (e.g. a malformed equipment record) can't blank the scene. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode; label?: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.error(`[render] ${this.props.label ?? 'subtree'} failed:`, err)
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
