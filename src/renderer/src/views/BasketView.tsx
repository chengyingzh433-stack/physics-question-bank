import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BankQuestionDTO, PaperSetItemDTO } from '@shared/types'

function BasketView(): React.JSX.Element {
  const [, setSetId] = useState<number | null>(null)
  const [items, setItems] = useState<PaperSetItemDTO[]>([])
  const [qMap, setQMap] = useState<Record<number, BankQuestionDTO>>({})
  const [groupHeaders, setGroupHeaders] = useState<Record<number, string>>({})

  const reload = useCallback(async () => {
    const sid = await window.api.getOrCreateDraftSet()
    setSetId(sid)
    const its = await window.api.listSetItems(sid)
    setItems(its)
    // 初始化 group_header 编辑态
    const gh: Record<number, string> = {}
    its.forEach((it) => {
      gh[it.id] = it.group_header ?? ''
    })
    setGroupHeaders(gh)
    // 拉全部题做映射
    const all = await window.api.listBankQuestions({})
    const m: Record<number, BankQuestionDTO> = {}
    all.forEach((q) => (m[q.id] = q))
    setQMap(m)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const handleRemove = useCallback(
    async (itemId: number) => {
      await window.api.removeFromSet(itemId)
      await reload()
    },
    [reload]
  )

  // 上移/下移：交换相邻 order_index
  const move = useCallback(
    async (idx: number, dir: -1 | 1) => {
      const target = idx + dir
      if (target < 0 || target >= items.length) return
      const a = items[idx]
      const b = items[target]
      const aOrder = a.order_index ?? idx
      const bOrder = b.order_index ?? target
      await window.api.updateSetItem(a.id, { order_index: bOrder })
      await window.api.updateSetItem(b.id, { order_index: aOrder })
      await reload()
    },
    [items, reload]
  )

  const handleGroupHeader = useCallback(
    async (itemId: number, value: string) => {
      setGroupHeaders((m) => ({ ...m, [itemId]: value }))
      await window.api.updateSetItem(itemId, { group_header: value || null })
    },
    []
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          padding: 8,
          background: '#f5f5f5',
          borderBottom: '1px solid #ddd'
        }}
      >
        <Link to="/bank" style={{ textDecoration: 'none', color: '#333' }}>← 返回题库</Link>
        <strong style={{ marginLeft: 8 }}>组卷篮</strong>
        <span style={{ color: '#999' }}>{items.length} 题</span>
        <div style={{ flex: 1 }} />
        <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>主页</Link>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#eee' }}>
        {items.length === 0 && <div>篮内为空，去题库勾选加入。</div>}
        {items.map((it, idx) => {
          const q = qMap[it.question_id]
          return (
            <div
              key={it.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 6,
                padding: 8,
                marginBottom: 8
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => move(idx, -1)} disabled={idx === 0}>
                  ↑
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>
                  ↓
                </button>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>第 {idx + 1} 项</strong>
                  {q && (
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {q.paper_name} · 原第{q.order_in_paper}题
                    </span>
                  )}
                </div>
                <div style={{ margin: '4px 0' }}>
                  <span style={{ fontSize: 13 }}>分组标题：</span>
                  <input
                    value={groupHeaders[it.id] ?? ''}
                    onChange={(e) => handleGroupHeader(it.id, e.target.value)}
                    placeholder="（可选）"
                    style={{ width: 200 }}
                  />
                </div>
                {q && q.image_path && (
                  <img
                    src={`app://projects/${q.paper_id}/images/q_${q.id}.png`}
                    alt={`题${q.id}`}
                    style={{ maxWidth: 300, display: 'block' }}
                  />
                )}
              </div>
              <button onClick={() => handleRemove(it.id)}>移除</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default BasketView
