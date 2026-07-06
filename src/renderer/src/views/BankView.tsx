import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  BankQuestionDTO,
  QuestionFilterCriteria,
  QuestionTypeDTO,
  ChapterDTO,
  KnowledgePointDTO,
  DifficultyDTO,
  PaperDTO
} from '@shared/types'

function BankView(): React.JSX.Element {
  const [questions, setQuestions] = useState<BankQuestionDTO[]>([])
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [chapters, setChapters] = useState<ChapterDTO[]>([])
  const [kps, setKps] = useState<KnowledgePointDTO[]>([])
  const [diffs, setDiffs] = useState<DifficultyDTO[]>([])
  const [papers, setPapers] = useState<PaperDTO[]>([])
  const [criteria, setCriteria] = useState<QuestionFilterCriteria>({})
  const [selectedKps, setSelectedKps] = useState<Set<number>>(new Set())
  const [draftSetId, setDraftSetId] = useState<number | null>(null)
  const [inBasket, setInBasket] = useState<Set<number>>(new Set())

  const reloadMeta = useCallback(async () => {
    const [ts, chs, kpsList, dfs, ps, sid] = await Promise.all([
      window.api.listQuestionTypes(),
      window.api.listChapters(),
      window.api.listKnowledgePoints(),
      window.api.listDifficulties(),
      window.api.listPapers(),
      window.api.getOrCreateDraftSet()
    ])
    setTypes(ts)
    setChapters(chs)
    setKps(kpsList)
    setDiffs(dfs)
    setPapers(ps)
    setDraftSetId(sid)
    const ids = await window.api.listSetQuestionIds(sid)
    setInBasket(new Set(ids))
  }, [])

  const reloadBank = useCallback(async () => {
    const c: QuestionFilterCriteria = { ...criteria }
    if (selectedKps.size > 0) c.kp_ids = Array.from(selectedKps)
    setQuestions(await window.api.listBankQuestions(c))
  }, [criteria, selectedKps])

  useEffect(() => {
    reloadMeta()
  }, [reloadMeta])

  useEffect(() => {
    reloadBank()
  }, [reloadBank])

  const toggleKp = (id: number) => {
    setSelectedKps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearAll = () => {
    setCriteria({})
    setSelectedKps(new Set())
  }

  const toggleBasket = useCallback(
    async (questionId: number) => {
      if (draftSetId == null) return
      if (inBasket.has(questionId)) {
        // 已在篮：忽略（移除在 BasketView 做）——这里简化为不重复加入
        return
      }
      await window.api.addToSet(draftSetId, questionId)
      setInBasket((prev) => new Set(prev).add(questionId))
    },
    [draftSetId, inBasket]
  )

  const typeName = (id: number | null) =>
    id == null ? '' : types.find((t) => t.id === id)?.name ?? ''

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* 侧栏筛选 */}
      <div
        style={{
          width: 240,
          background: '#f5f5f5',
          padding: 12,
          overflow: 'auto',
          borderRight: '1px solid #ddd'
        }}
      >
        <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>← 返回主页</Link>
        <Link to="/basket" style={{ textDecoration: 'none', color: '#0078d7', marginTop: 4, display: 'block' }}>
          查看组卷篮 →
        </Link>
        <h3 style={{ marginTop: 12 }}>筛选</h3>

        <div style={{ marginBottom: 8 }}>
          <button onClick={clearAll}>清除全部</button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>题型</div>
          <select
            value={criteria.type_id ?? ''}
            onChange={(e) =>
              setCriteria((c) => ({
                ...c,
                type_id: e.target.value ? Number(e.target.value) : null
              }))
            }
          >
            <option value="">全部</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>来源试卷</div>
          <select
            value={criteria.paper_id ?? ''}
            onChange={(e) =>
              setCriteria((c) => ({
                ...c,
                paper_id: e.target.value ? Number(e.target.value) : null
              }))
            }
          >
            <option value="">全部</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>章节</div>
          <select
            value={criteria.chapter_id ?? ''}
            onChange={(e) =>
              setCriteria((c) => ({
                ...c,
                chapter_id: e.target.value ? Number(e.target.value) : null
              }))
            }
          >
            <option value="">全部</option>
            {chapters.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.name}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 8 }}>
          <div>难度</div>
          <select
            value={criteria.difficulty_id ?? ''}
            onChange={(e) =>
              setCriteria((c) => ({
                ...c,
                difficulty_id: e.target.value ? Number(e.target.value) : null
              }))
            }
          >
            <option value="">全部</option>
            {diffs.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div>知识点（命中任一）</div>
          {kps.map((kp) => (
            <label key={kp.id} style={{ display: 'block', fontSize: 13 }}>
              <input
                type="checkbox"
                checked={selectedKps.has(kp.id)}
                onChange={() => toggleKp(kp.id)}
              />
              {kp.name}
            </label>
          ))}
        </div>
      </div>

      {/* 网格 */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#eee' }}>
        <div style={{ marginBottom: 8 }}>
          共 {questions.length} 题
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {questions.map((q) => (
            <div
              key={q.id}
              style={{
                width: 200,
                background: '#fff',
                border: inBasket.has(q.id) ? '2px solid #2e7d32' : '1px solid #ccc',
                borderRadius: 6,
                padding: 6
              }}
            >
              <label style={{ display: 'block', marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={inBasket.has(q.id)}
                  onChange={() => toggleBasket(q.id)}
                />
                加入组卷篮
              </label>
              {q.image_path && (
                <img
                  src={`app://projects/${q.paper_id}/images/q_${q.id}.png`}
                  alt={`题${q.id}`}
                  style={{ width: '100%', display: 'block' }}
                />
              )}
              <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                {q.paper_name} · 第{q.order_in_paper}题
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>{typeName(q.type_id)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BankView
