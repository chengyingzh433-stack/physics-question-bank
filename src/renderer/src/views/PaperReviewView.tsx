import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type {
  QuestionDTO,
  QuestionTypeDTO,
  TemplateRuleDTO
} from '@shared/types'
import { applyTemplate } from '../services/TemplateService'

interface ChapterDTO {
  id: number
  name: string
}
interface KpDTO {
  id: number
  name: string
  chapter_id: number | null
}
interface DiffDTO {
  id: number
  name: string
  sort_order: number
}

function PaperReviewView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId)

  const [questions, setQuestions] = useState<QuestionDTO[]>([])
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [rules, setRules] = useState<TemplateRuleDTO[]>([])
  const [chapters, setChapters] = useState<ChapterDTO[]>([])
  const [kps, setKps] = useState<KpDTO[]>([])
  const [diffs, setDiffs] = useState<DiffDTO[]>([])
  // 每题的知识点选中态：questionId -> Set<kpId>
  const [qKps, setQKps] = useState<Record<number, Set<number>>>({})
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const [qs, ts, tpls, chs, kpsList, dfs] = await Promise.all([
      window.api.listQuestionsByPaper(pid),
      window.api.listQuestionTypes(),
      window.api.listTemplates(),
      window.api.listChapters(),
      window.api.listKnowledgePoints(),
      window.api.listDifficulties()
    ])
    setQuestions(qs)
    setTypes(ts)
    setTemplates(tpls)
    setChapters(chs)
    setKps(kpsList)
    setDiffs(dfs)
    // 每题知识点
    const kpsMap: Record<number, Set<number>> = {}
    for (const q of qs) {
      kpsMap[q.id] = new Set(await window.api.getQuestionKnowledgePoints(q.id))
    }
    setQKps(kpsMap)
  }, [pid])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (selectedTemplate == null) {
      setRules([])
      return
    }
    window.api.listRules(selectedTemplate).then(setRules)
  }, [selectedTemplate])

  const handleApply = useCallback(async () => {
    if (selectedTemplate == null) return
    setBusy(true)
    try {
      const results = applyTemplate(
        questions.map((q) => ({ id: q.id, order_in_paper: q.order_in_paper })),
        rules
      )
      for (const r of results) {
        await window.api.setQuestionType(r.questionId, r.typeId)
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }, [selectedTemplate, questions, rules, reload])

  const handleSetType = useCallback(
    async (questionId: number, typeId: number | null) => {
      await window.api.setQuestionType(questionId, typeId)
      setQuestions((arr) =>
        arr.map((q) => (q.id === questionId ? { ...q, type_id: typeId } : q))
      )
    },
    []
  )

  const handleSetChapter = useCallback(async (qid: number, cid: number | null) => {
    await window.api.setQuestionChapter(qid, cid)
    setQuestions((arr) => arr.map((q) => (q.id === qid ? { ...q, chapter_id: cid } : q)))
  }, [])

  const handleSetDifficulty = useCallback(async (qid: number, did: number | null) => {
    await window.api.setQuestionDifficulty(qid, did)
    setQuestions((arr) => arr.map((q) => (q.id === qid ? { ...q, difficulty_id: did } : q)))
  }, [])

  // 知识点勾选/取消 → 写库 + 更新 state
  const handleToggleKp = useCallback(
    async (qid: number, kpId: number) => {
      const cur = new Set(qKps[qid] ?? [])
      if (cur.has(kpId)) cur.delete(kpId)
      else cur.add(kpId)
      const arr = Array.from(cur)
      await window.api.setQuestionKnowledgePoints(qid, arr)
      setQKps((m) => ({ ...m, [qid]: cur }))
    },
    [qKps]
  )

  // 临时新建知识点（立即选中）
  const [newKpName, setNewKpName] = useState('')
  const handleCreateKp = useCallback(
    async (qid: number) => {
      if (!newKpName.trim()) return
      const id = await window.api.createKnowledgePoint(newKpName.trim(), null)
      setNewKpName('')
      const newList = await window.api.listKnowledgePoints()
      setKps(newList)
      // 立即选中
      const cur = new Set(qKps[qid] ?? [])
      cur.add(id)
      await window.api.setQuestionKnowledgePoints(qid, Array.from(cur))
      setQKps((m) => ({ ...m, [qid]: cur }))
    },
    [newKpName, qKps]
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
        <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>← 返回</Link>
        <Link to={`/post/${pid}`} style={{ textDecoration: 'none', color: '#333' }}>后期处理</Link>
        <strong style={{ marginLeft: 8 }}>原卷复查</strong>
        <div style={{ flex: 1 }} />
        <span>模板：</span>
        <select
          value={selectedTemplate ?? ''}
          onChange={(e) => setSelectedTemplate(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">（未选）</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button onClick={handleApply} disabled={busy || selectedTemplate == null}>
          套用模板
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#eee' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {questions.map((q) => (
            <div
              key={q.id}
              style={{
                width: 320,
                background: '#fff',
                border: '1px solid #ccc',
                borderRadius: 6,
                padding: 8
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                第 {q.order_in_paper} 题
                {q.is_merged ? ' · 合并' : ''}
              </div>
              {q.image_path && (
                <img
                  src={`app://projects/${pid}/images/q_${q.id}.png`}
                  alt={`题${q.id}`}
                  style={{ width: '100%', display: 'block', marginBottom: 6 }}
                />
              )}

              {/* 题型 */}
              <label style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>
                题型：
                <select
                  value={q.type_id ?? ''}
                  onChange={(e) =>
                    handleSetType(q.id, e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">未设</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              {/* 章节 */}
              <label style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>
                章节：
                <select
                  value={q.chapter_id ?? ''}
                  onChange={(e) =>
                    handleSetChapter(q.id, e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">未设</option>
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              {/* 难度 */}
              <label style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>
                难度：
                <select
                  value={q.difficulty_id ?? ''}
                  onChange={(e) =>
                    handleSetDifficulty(q.id, e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">未设</option>
                  {diffs.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>

              {/* 知识点（多选） */}
              <div style={{ fontSize: 13, marginBottom: 2 }}>
                知识点：
                <div style={{ paddingLeft: 8 }}>
                  {kps.map((kp) => (
                    <label key={kp.id} style={{ display: 'inline-block', marginRight: 8 }}>
                      <input
                        type="checkbox"
                        checked={(qKps[q.id] ?? new Set()).has(kp.id)}
                        onChange={() => handleToggleKp(q.id, kp.id)}
                      />
                      {kp.name}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 2 }}>
                  <input
                    value={newKpName}
                    onChange={(e) => setNewKpName(e.target.value)}
                    placeholder="临时新建知识点"
                    style={{ width: 120 }}
                  />
                  <button onClick={() => handleCreateKp(q.id)}>新建并选中</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PaperReviewView
