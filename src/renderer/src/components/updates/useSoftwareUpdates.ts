import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdatePreferences, UpdateState } from '@shared/updates'

type RequestName = 'check' | 'download' | 'cancel' | 'install' | 'preferences' | 'release'
export const updateErrorMessage = (value: unknown): string => String(value).replace(/^Error:\s*/, '')
  .replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '').replace(/^UPDATE_[A-Z_]+:\s*/, '')

/** UI observes the main-process updater; it never starts background downloads. */
export function useSoftwareUpdates(panelOpen: boolean) {
  const [state, setState] = useState<UpdateState | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Partial<Record<RequestName, boolean>>>({})
  const stateRef = useRef<UpdateState | null>(null)
  const openRef = useRef(panelOpen); openRef.current = panelOpen
  const alive = useRef(true)
  const requests = useRef(new Set<RequestName>())
  const reading = useRef(false)
  const generation = useRef(0)
  const cancelledDownload = useRef(false)
  const activePolling = state?.phase === 'checking' || state?.phase === 'downloading' || state?.phase === 'installing' ||
    Boolean(pending.check || pending.download || pending.install)
  const acceptState = useCallback((value: UpdateState) => {
    if (!alive.current) return
    stateRef.current = value; setState(value)
  }, [])
  const refresh = useCallback(async () => {
    if (reading.current) return
    reading.current = true
    const started = generation.current
    try {
      const value = await window.api.getUpdateState()
      if (alive.current && started === generation.current) {
        if (!stateRef.current) setError('')
        acceptState(value)
      }
    } catch (e) { if (alive.current && !stateRef.current) setError(updateErrorMessage(e)) }
    finally { reading.current = false }
  }, [acceptState])
  useEffect(() => {
    alive.current = true
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      if (alive.current) await refresh()
      if (stopped || !alive.current) return
      const phase = stateRef.current?.phase
      const active = phase === 'checking' || phase === 'downloading' || phase === 'installing' ||
        requests.current.has('check') || requests.current.has('download') || requests.current.has('install')
      timer = window.setTimeout(() => void poll(), active ? 1000 : openRef.current ? 3000 : 15000)
    }
    void poll()
    return () => { stopped = true; alive.current = false; if (timer !== undefined) window.clearTimeout(timer) }
  }, [refresh, activePolling, panelOpen])

  const run = useCallback(async (name: RequestName, action: () => Promise<UpdateState | void>) => {
    if (requests.current.has(name)) return
    requests.current.add(name); generation.current++
    if (alive.current) { setPending((old) => ({ ...old, [name]: true })); setError('') }
    try {
      const value = await action()
      generation.current++
      // Cancelling is independent of the long-lived download request. Its final
      // cancelled result must not overwrite the state returned by cancellation.
      if (value && !(name === 'download' && cancelledDownload.current)) acceptState(value)
    } catch (e) {
      if (alive.current && !(name === 'download' && cancelledDownload.current)) setError(updateErrorMessage(e))
    } finally {
      requests.current.delete(name)
      if (alive.current) setPending((old) => ({ ...old, [name]: false }))
      if (alive.current) await refresh()
    }
  }, [acceptState, refresh])

  const check = useCallback(() => run('check', () => window.api.checkForUpdates()), [run])
  const download = useCallback(() => {
    cancelledDownload.current = false
    return run('download', () => window.api.downloadUpdate())
  }, [run])
  const cancel = useCallback(() => {
    cancelledDownload.current = true
    return run('cancel', () => window.api.cancelUpdateDownload())
  }, [run])
  const install = useCallback(() => run('install', () => window.api.installUpdate()), [run])
  const preferences = useCallback((value: UpdatePreferences) => run('preferences', () => window.api.saveUpdatePreferences(value)), [run])
  const openRelease = useCallback(() => run('release', () => window.api.openUpdateRelease()), [run])
  return { state, error, pending, refresh, check, download, cancel, install, preferences, openRelease }
}

export type SoftwareUpdatesController = ReturnType<typeof useSoftwareUpdates>
