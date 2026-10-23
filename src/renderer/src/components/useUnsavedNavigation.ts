import { useEffect, useRef } from 'react'

/** HashRouter has no data-router blocker: keep browser history and UI in sync on rejected Back. */
export function useUnsavedNavigation(dirty: boolean) {
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  useEffect(() => {
    let currentUrl = window.location.href
    let currentState: { idx?: number } | null = window.history.state
    let rollingBack = false
    const unload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault(); event.returnValue = ''
    }
    const pop = (event: PopStateEvent) => {
      if (rollingBack) { rollingBack = false; event.stopImmediatePropagation(); return }
      if (dirtyRef.current && !window.confirm('还有未保存的修改。放弃这些修改并离开？')) {
        event.stopImmediatePropagation()
        const targetIndex = (event.state as { idx?: number } | null)?.idx
        if (typeof currentState?.idx === 'number' && typeof targetIndex === 'number' && currentState.idx !== targetIndex) {
          rollingBack = true; window.history.go(currentState.idx - targetIndex)
        } else window.history.replaceState(currentState, '', currentUrl)
        return
      }
      currentUrl = window.location.href; currentState = window.history.state
    }
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]')
      if (!dirtyRef.current || !anchor) return
      const destination = new URL(anchor.getAttribute('href')!, window.location.href)
      if (destination.origin !== window.location.origin || destination.pathname !== window.location.pathname || destination.hash === window.location.hash) return
      if (!window.confirm('还有未保存的修改。放弃这些修改并离开？')) {
        event.preventDefault(); event.stopImmediatePropagation()
      }
    }
    document.addEventListener('click', link, true)
    window.addEventListener('beforeunload', unload)
    window.addEventListener('popstate', pop, true)
    return () => { document.removeEventListener('click', link, true); window.removeEventListener('beforeunload', unload); window.removeEventListener('popstate', pop, true) }
  }, [])
}
