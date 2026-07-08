import { useEffect, useState } from 'react'

// 组卷篮计数:供导航徽章用。每次挂载查一次,提供一个 refresh 供入篮后刷新。
export function useBasketCount() {
  const [count, setCount] = useState(0)
  const [setId, setSetId] = useState<number | null>(null)

  const refresh = async () => {
    try {
      const sid = await window.api.getOrCreateDraftSet()
      const items = await window.api.listSetItems(sid)
      setSetId(sid)
      setCount(items.length)
    } catch {
      // 忽略,导航徽章非关键
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  return { count, setId, refresh }
}
