import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Select,
  Badge,
  TextInput,
  Button,
  LoadingOverlay,
  Stack,
  Drawer,
  Alert,
  Container,
  Box
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconTemplate, IconEdit, IconArrowLeft } from '@tabler/icons-react'
import type {
  ChapterDTO,
  QuestionDTO,
  QuestionTypeDTO,
  TemplateRuleDTO
} from '@shared/types'
import { ChapterPicker } from '../components/ChapterPicker'
import { KnowledgePointPicker } from '../components/KnowledgePointPicker'
import { applyTemplate } from '../services/TemplateService'
import TemplateRulesEditor from '../components/TemplateRulesEditor'

interface KpDTO { id: number; name: string; chapter_id: number | null }
interface DiffDTO { id: number; name: string; sort_order: number }

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
  const [qKps, setQKps] = useState<Record<number, Set<number>>>({})
  const [busy, setBusy] = useState(false)
  const [paperStatus, setPaperStatus] = useState<string | null>(null)
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)

  const reload = useCallback(async () => {
    const [paper, qs, ts, tpls, chs, kpsList, dfs] = await Promise.all([
      window.api.getPaper(pid),
      window.api.listQuestionsByPaper(pid),
      window.api.listQuestionTypes(),
      window.api.listTemplates(),
      window.api.listChapters(),
      window.api.listKnowledgePoints(),
      window.api.listDifficulties()
    ])
    setPaperStatus(paper?.status ?? null)
    setQuestions(qs)
    setTypes(ts)
    setTemplates(tpls)
    setChapters(chs)
    setKps(kpsList)
    setDiffs(dfs)
    const kpsMap: Record<number, Set<number>> = {}
    for (const q of qs) {
      kpsMap[q.id] = new Set(await window.api.getQuestionKnowledgePoints(q.id))
    }
    setQKps(kpsMap)
  }, [pid])

  useEffect(() => { reload() }, [reload])

  useEffect(() => {
    if (selectedTemplate == null) { setRules([]); return }
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
      notifications.show({ message: '模板已套用', color: 'green' })
    } finally {
      setBusy(false)
    }
  }, [selectedTemplate, questions, rules, reload])

  const handleSetType = useCallback(async (questionId: number, typeId: number | null) => {
    await window.api.setQuestionType(questionId, typeId)
    setQuestions((arr) => arr.map((q) => (q.id === questionId ? { ...q, type_id: typeId } : q)))
  }, [])

  const handleSetChapter = useCallback(async (qid: number, cid: number | null) => {
    await window.api.setQuestionChapter(qid, cid)
    setQuestions((arr) => arr.map((q) => (q.id === qid ? { ...q, chapter_id: cid } : q)))
  }, [])

  const handleSetDifficulty = useCallback(async (qid: number, did: number | null) => {
    await window.api.setQuestionDifficulty(qid, did)
    setQuestions((arr) => arr.map((q) => (q.id === qid ? { ...q, difficulty_id: did } : q)))
  }, [])

  // M13：单题年份/出处覆盖。空值 = 清除覆盖回退继承试卷默认值。
  // 写库后重取该题的 effective 值（继承计算在 SQL 层，前端不自己算）。
  const handleSetOverride = useCallback(
    async (qid: number, fields: { year_override?: number | null; source_override?: string | null }) => {
      await window.api.updateQuestionSourceOverride(qid, fields)
      const fresh = await window.api.listQuestionsByPaper(pid)
      setQuestions(fresh)
    },
    [pid]
  )

  const handleSetKps = async (qid: number, ids: number[]) => {
    await window.api.setQuestionKnowledgePoints(qid, ids)
    setQKps((current) => ({ ...current, [qid]: new Set(ids) }))
  }
  const handleCreateKp = async (qid: number, name: string) => {
    const id = await window.api.createKnowledgePoint(name, null)
    setKps(await window.api.listKnowledgePoints())
    const ids = new Set(await window.api.getQuestionKnowledgePoints(qid))
    ids.add(id)
    await handleSetKps(qid, Array.from(ids))
  }

  const typeData = types.map((t) => ({ value: String(t.id), label: t.name }))
  const diffData = diffs.map((d) => ({ value: String(d.id), label: d.name }))
  const templateData = templates.map((t) => ({ value: String(t.id), label: t.name }))

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <LoadingOverlay visible={busy} />

      {/* 未入库门禁：复查页定位为入库后最终复查 */}
      {paperStatus != null && paperStatus !== 'done' && (
        <Container p="xl">
          <Alert color="orange" variant="light" title="请先完成入库" icon={<IconArrowLeft size={18} />}>
            <Stack gap="sm">
              <Text size="sm">
                复查页用于入库后的最终检查。当前试卷尚未完成入库（状态：{paperStatus}），请先在「后期处理」页点「完成入库」生成题图后再来复查。
              </Text>
              <Button component={Link} to={`/post/${pid}`} variant="light" size="sm" leftSection={<IconArrowLeft size={14} />}>
                前往后期处理
              </Button>
            </Stack>
          </Alert>
        </Container>
      )}

      {paperStatus === 'done' && (
        <>
          {/* 顶部模板工具栏 */}
          <Group p="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            <IconTemplate size={18} />
            <Select
              placeholder="选择题型模板"
              data={templateData}
              value={selectedTemplate != null ? String(selectedTemplate) : null}
              onChange={(v) => setSelectedTemplate(v ? Number(v) : null)}
              size="sm"
              w={200}
              clearable
            />
            <Button size="sm" variant="light" onClick={handleApply} disabled={busy || selectedTemplate == null}>
              套用模板
            </Button>
            <Button
              size="sm"
              variant="subtle"
              leftSection={<IconEdit size={14} />}
              disabled={selectedTemplate == null}
              onClick={() => setTemplateDrawerOpen(true)}
            >
              编辑模板
            </Button>
            <Text size="sm" c="dimmed" ml="md">
              共 {questions.length} 题
            </Text>
          </Group>

          {/* 题目卡片网格 */}
          <div style={{ padding: 'var(--mantine-spacing-md)', overflow: 'auto' }}>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
              {questions.map((q) => {
                const curKps = qKps[q.id] ?? new Set<number>()
                return (
                  <Card key={q.id} shadow="xs" padding="sm" withBorder>
                    <Group justify="space-between" mb="xs">
                      <Text fw={600} size="sm">
                        第 {q.order_in_paper} 题
                      </Text>
                      {q.is_merged === 1 && <Badge size="xs" variant="light" color="orange">合并</Badge>}
                    </Group>

                    {/* 题图：有则显示，无则占位 */}
                    <Card.Section>
                      {q.image_path ? (
                        <img
                          src={`app://projects/${pid}/images/q_${q.id}.png`}
                          alt={`题${q.id}`}
                          style={{ width: '100%', display: 'block' }}
                        />
                      ) : (
                        <Box
                          style={{
                            width: '100%',
                            height: 120,
                            background: 'var(--mantine-color-gray-1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Text size="xs" c="dimmed">无题图</Text>
                        </Box>
                      )}
                    </Card.Section>

                    <Stack gap="xs" mt="sm">
                  <Select
                    label="题型"
                    data={typeData}
                    value={q.type_id != null ? String(q.type_id) : null}
                    onChange={(v) => handleSetType(q.id, v ? Number(v) : null)}
                    size="xs"
                    clearable
                    placeholder="未设"
                  />
                  <ChapterPicker chapters={chapters} value={q.chapter_id}
                    onChange={(id) => handleSetChapter(q.id, id)} onRefresh={setChapters} />
                  <Select
                    label="难度"
                    data={diffData}
                    value={q.difficulty_id != null ? String(q.difficulty_id) : null}
                    onChange={(v) => handleSetDifficulty(q.id, v ? Number(v) : null)}
                    size="xs"
                    clearable
                    placeholder="未设"
                  />

                  <KnowledgePointPicker points={kps} value={Array.from(curKps)}
                    onChange={(ids) => handleSetKps(q.id, ids)} onCreate={(name) => handleCreateKp(q.id, name)} />

                  {/* M13：年份/出处。留空 = 继承试卷默认值，填写 = 本题单独覆盖 */}
                  <QuestionOverrideFields question={q} onSave={handleSetOverride} />
                </Stack>
              </Card>
            )
          })}
        </SimpleGrid>
      </div>

      {/* 模板编辑 Drawer */}
      <Drawer
        opened={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        title="编辑模板规则"
        position="right"
        size="lg"
      >
        <TemplateRulesEditor
          templateId={selectedTemplate}
          types={types}
          onChange={() => {
            // 规则变更后刷新 rules state
            if (selectedTemplate != null) {
              window.api.listRules(selectedTemplate).then(setRules)
            }
          }}
        />
      </Drawer>
      </>
      )}
    </div>
  )
}

/**
 * 单题年份/出处覆盖输入（M13）。
 * 输入框留空 = 继承试卷默认值（placeholder 显示继承来的值）；填写 = 本题单独覆盖。
 * 失焦时提交，避免每敲一个字符就写库。
 */
function QuestionOverrideFields(props: {
  question: QuestionDTO
  onSave: (
    qid: number,
    fields: { year_override?: number | null; source_override?: string | null }
  ) => Promise<void>
}): React.JSX.Element {
  const { question: q, onSave } = props
  const [year, setYear] = useState<string>(q.year_override != null ? String(q.year_override) : '')
  const [source, setSource] = useState<string>(q.source_override ?? '')

  // 外部刷新（如改了试卷默认值后 reload）时同步回显
  useEffect(() => {
    setYear(q.year_override != null ? String(q.year_override) : '')
    setSource(q.source_override ?? '')
  }, [q.year_override, q.source_override])

  // 继承值作为 placeholder：让用户看到"不填会是什么"
  const inheritedYear = q.year_override == null && q.effective_year != null ? String(q.effective_year) : ''
  const inheritedSource = !q.source_override && q.effective_source ? q.effective_source : ''

  const commitYear = (): void => {
    const trimmed = year.trim()
    const next = trimmed === '' ? null : Number(trimmed)
    if (next != null && Number.isNaN(next)) return
    if (next === (q.year_override ?? null)) return
    onSave(q.id, { year_override: next })
  }

  const commitSource = (): void => {
    const next = source.trim() === '' ? null : source.trim()
    if (next === (q.source_override ?? null)) return
    onSave(q.id, { source_override: next })
  }

  return (
    <Group gap="xs" grow>
      <TextInput
        label="年份"
        placeholder={inheritedYear ? `继承 ${inheritedYear}` : '未设'}
        value={year}
        onChange={(e) => setYear(e.currentTarget.value)}
        onBlur={commitYear}
        size="xs"
      />
      <TextInput
        label="出处"
        placeholder={inheritedSource ? `继承 ${inheritedSource}` : '未设'}
        value={source}
        onChange={(e) => setSource(e.currentTarget.value)}
        onBlur={commitSource}
        size="xs"
      />
    </Group>
  )
}

export default PaperReviewView
