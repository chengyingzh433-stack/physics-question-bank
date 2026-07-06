import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type {
  QuestionDTO,
  QuestionTypeDTO,
  TemplateRuleDTO
} from '@shared/types'
import { applyTemplate } from '../services/TemplateService'

function PaperReviewView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId)

  const [questions, setQuestions] = useState<QuestionDTO[]>([])
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null)
  const [rules, setRules] = useState<TemplateRuleDTO[]>([])
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const [qs, ts, tpls] = await Promise.all([
      window.api.listQuestionsByPaper(pid),
      window.api.listQuestionTypes(),
      window.api.listTemplates()
    ])
    setQuestions(qs)
    setTypes(ts)
    setTemplates(tpls)
  }, [pid])

  useEffect(() => {
    reload()
  }, [reload])

  // 选中模板时加载规则
  useEffect(() => {
    if (selectedTemplate == null) {
      setRules([])
      return
    }
    window.api.listRules(selectedTemplate).then(setRules)
  }, [selectedTemplate])

  // 套用模板
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

  // 手改题型
  const handleSetType = useCallback(
    async (questionId: number, typeId: number | null) => {
      await window.api.setQuestionType(questionId, typeId)
      setQuestions((arr) =>
        arr.map((q) => (q.id === questionId ? { ...q, type_id: typeId } : q))
      )
    },
    []
  )

  const typeName = (id: number | null): string => {
    if (id == null) return '未设'
    return types.find((t) => t.id === id)?.name ?? '?'
  }

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
          onChange={(e) =>
            setSelectedTemplate(e.target.value ? Number(e.target.value) : null)
          }
        >
          <option value="">（未选）</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
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
                width: 280,
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>题型：</span>
                <select
                  value={q.type_id ?? ''}
                  onChange={(e) =>
                    handleSetType(
                      q.id,
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                >
                  <option value="">未设</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 12, color: '#888' }}>{typeName(q.type_id)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PaperReviewView
