import { useCallback, useEffect, useState } from 'react'

export function notifyBasketChanged(): void {
  window.dispatchEvent(new Event('basket-changed'))
}

// 组卷篮计数:供导航徽章用。每次挂载查一次,提供一个 refresh 供入篮后刷新。
export function useBasketCount() {
  const [count, setCount] = useState(0)
  const [setId, setSetId] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      const sid = await window.api.getOrCreateDraftSet()
      const items = await window.api.listSetItems(sid)
      setSetId(sid)
      setCount(items.length)
    } catch {
      // 忽略,导航徽章非关键
    }
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('basket-changed', refresh)
    return () => window.removeEventListener('basket-changed', refresh)
  }, [refresh])

  return { count, setId, refresh }
}
