/**
 * Drawer handles for the side panels: a small tab on the inner edge of each panel hides it; when hidden
 * the tab waits at the screen edge to bring it back. Keys: [ left panel, ] right panel, \ both.
 * The right handle only appears when the inspector has something to show.
 */
import { useStore } from '../state/store'

export function PanelHandles() {
  const panels = useStore((s) => s.panels)
  const toggle = useStore((s) => s.togglePanel)
  const walking = useStore((s) => s.walk)
  const rightHasContent = useStore((s) => !!(s.selected || s.isolation || (s.walk && s.lookAt)))
  const selTag = useStore((s) => s.selected?.tag ?? s.isolation?.target ?? s.lookAt?.tag)
  return (
    <>
      {!walking && (
        <button className={`panel-handle left ${panels.left ? 'open' : 'closed'}`} onClick={() => toggle('left')} title={`${panels.left ? 'Hide' : 'Show'} the side panel  [`} aria-label={`${panels.left ? 'Hide' : 'Show'} left panel`}>
          <span className="chev">{panels.left ? '‹' : '›'}</span>
          {!panels.left && <span className="handle-label">Panel</span>}
        </button>
      )}
      {rightHasContent && (
        <button className={`panel-handle right ${panels.right ? 'open' : 'closed'}`} onClick={() => toggle('right')} title={`${panels.right ? 'Hide' : 'Show'} the inspector  ]`} aria-label={`${panels.right ? 'Hide' : 'Show'} inspector`}>
          <span className="chev">{panels.right ? '›' : '‹'}</span>
          {!panels.right && <span className="handle-label">{selTag ?? 'Inspector'}</span>}
        </button>
      )}
    </>
  )
}
