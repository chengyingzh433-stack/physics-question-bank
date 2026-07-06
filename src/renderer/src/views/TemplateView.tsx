import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { QuestionTypeDTO, TemplateRuleDTO } from '@shared/types'

function TemplateView(): React.JSX.Element {
  const [types, setTypes] = useState<QuestionTypeDTO[]>([])
  const [templates, setTemplates] = useState<{ id: number; name: string }[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [rules, setRules] = useState<TemplateRuleDTO[]>([])
  // 新题型
  const [newTypeName, setNewTypeName] = useState('')
  // 新模板
  const [newTplName, setNewTplName] = useState('')
  // 新规则
  const [fromNo, setFromNo] = useState('1')
  const [toNo, setToNo] = useState('5')
  const [ruleType, setRuleType] = useState<number | null>(null)

  const reloadTypes = useCallback(async () => {
    setTypes(await window.api.listQuestionTypes())
  }, [])
  const reloadTemplates = useCallback(async () => {
    const tpls = await window.api.listTemplates()
    setTemplates(tpls)
  }, [])

  useEffect(() => {
    reloadTypes()
    reloadTemplates()
  }, [reloadTypes, reloadTemplates])

  useEffect(() => {
    if (selected == null) {
      setRules([])
      return
    }
    window.api.listRules(selected).then(setRules)
  }, [selected])

  const handleCreateType = useCallback(async () => {
    if (!newTypeName.trim()) return
    await window.api.createQuestionType(newTypeName.trim())
    setNewTypeName('')
    await reloadTypes()
  }, [newTypeName, reloadTypes])

  const handleDeleteType = useCallback(
    async (id: number) => {
      const ok = await window.api.deleteQuestionType(id)
      if (!ok) {
        alert('内置题型不可删除')
        return
      }
      await reloadTypes()
    },
    [reloadTypes]
  )

  const handleCreateTemplate = useCallback(async () => {
    if (!newTplName.trim()) return
    const id = await window.api.createTemplate(newTplName.trim())
    setNewTplName('')
    await reloadTemplates()
    setSelected(id)
  }, [newTplName, reloadTemplates])

  const handleDeleteTemplate = useCallback(
    async (id: number) => {
      await window.api.deleteTemplate(id)
      if (selected === id) setSelected(null)
      await reloadTemplates()
    },
    [selected, reloadTemplates]
  )

  const handleAddRule = useCallback(async () => {
    if (selected == null || ruleType == null) return
    await window.api.addRule(selected, {
      from_no: Number(fromNo),
      to_no: Number(toNo),
      type_id: ruleType,
      rule_order: rules.length
    })
    setRules(await window.api.listRules(selected))
  }, [selected, ruleType, fromNo, toNo, rules.length])

  const handleDeleteRule = useCallback(
    async (ruleId: number) => {
      await window.api.deleteRule(ruleId)
      if (selected != null) setRules(await window.api.listRules(selected))
    },
    [selected]
  )

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/">← 返回主页</Link>
      </div>
      <h2>题型与模板管理</h2>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* 题型 */}
        <div style={{ flex: 1 }}>
          <h3>题型</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {types.map((t) => (
              <li key={t.id} style={{ marginBottom: 4 }}>
                {t.name}
                {t.is_builtin ? '（内置）' : ''}
                {!t.is_builtin && (
                  <button
                    style={{ marginLeft: 8 }}
                    onClick={() => handleDeleteType(t.id)}
                  >
                    删除
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div>
            <input
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="新题型名"
            />
            <button onClick={handleCreateType}>新增题型</button>
          </div>
        </div>

        {/* 模板 */}
        <div style={{ flex: 1 }}>
          <h3>模板</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {templates.map((t) => (
              <li key={t.id} style={{ marginBottom: 4 }}>
                <span
                  onClick={() => setSelected(t.id)}
                  style={{
                    cursor: 'pointer',
                    fontWeight: selected === t.id ? 700 : 400
                  }}
                >
                  {t.name}
                </span>
                <button
                  style={{ marginLeft: 8 }}
                  onClick={() => handleDeleteTemplate(t.id)}
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
          <div>
            <input
              value={newTplName}
              onChange={(e) => setNewTplName(e.target.value)}
              placeholder="新模板名"
            />
            <button onClick={handleCreateTemplate}>新增模板</button>
          </div>

          {selected != null && (
            <div style={{ marginTop: 16 }}>
              <h4>区间规则</h4>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {rules.map((r) => (
                  <li key={r.id}>
                    第 {r.from_no}–{r.to_no} 题 →{' '}
                    {types.find((t) => t.id === r.type_id)?.name ?? '?'}
                    <button
                      style={{ marginLeft: 8 }}
                      onClick={() => handleDeleteRule(r.id)}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span>第</span>
                <input
                  value={fromNo}
                  onChange={(e) => setFromNo(e.target.value)}
                  style={{ width: 40 }}
                />
                <span>–</span>
                <input
                  value={toNo}
                  onChange={(e) => setToNo(e.target.value)}
                  style={{ width: 40 }}
                />
                <span>题 =</span>
                <select
                  value={ruleType ?? ''}
                  onChange={(e) =>
                    setRuleType(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">选题型</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <button onClick={handleAddRule}>添加规则</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TemplateView
