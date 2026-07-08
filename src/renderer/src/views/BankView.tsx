import { useCallback, useEffect, useState } from 'react'
import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Select,
  Chip,
  Badge,
  ActionIcon,
  Checkbox,
  Paper,
  Stack,
  ScrollArea,
  Button,
  Tooltip
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconShoppingCart, IconX, IconFilter } from '@tabler/icons-react'
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
    setTypes(ts); setChapters(chs); setKps(kpsList); setDiffs(dfs); setPapers(ps); setDraftSetId(sid)
    const ids = await window.api.listSetQuestionIds(sid)
    setInBasket(new Set(ids))
  }, [])

  const reloadBank = useCallback(async () => {
    const c: QuestionFilterCriteria = { ...criteria }
    if (selectedKps.size > 0) c.kp_ids = Array.from(selectedKps)
    setQuestions(await window.api.listBankQuestions(c))
  }, [criteria, selectedKps])

  useEffect(() => { reloadMeta() }, [reloadMeta])
  useEffect(() => { reloadBank() }, [reloadBank])

  const toggleKp = (id: number) => {
    setSelectedKps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const clearAll = () => {
    setCriteria({})
    setSelectedKps(new Set())
  }

  const toggleBasket = useCallback(async (questionId: number) => {
    if (draftSetId == null) return
    if (inBasket.has(questionId)) return
    await window.api.addToSet(draftSetId, questionId)
    setInBasket((prev) => new Set(prev).add(questionId))
    notifications.show({ message: '已加入组卷篮', color: 'green' })
  }, [draftSetId, inBasket])

  const typeName = (id: number | null) =>
    id == null ? '' : types.find((t) => t.id === id)?.name ?? ''

  const typeData = types.map((t) => ({ value: String(t.id), label: t.name }))
  const paperData = papers.map((p) => ({ value: String(p.id), label: p.name }))
  const chapterData = chapters.map((c) => ({ value: String(c.id), label: c.name }))
  const diffData = diffs.map((d) => ({ value: String(d.id), label: d.name }))

  // 已选条件 chips
  const activeFilters: { label: string; onClear: () => void }[] = []
  if (criteria.type_id != null) {
    const t = types.find((x) => x.id === criteria.type_id)
    activeFilters.push({ label: `题型: ${t?.name ?? '?'}`, onClear: () => setCriteria((c) => ({ ...c, type_id: null })) })
  }
  if (criteria.paper_id != null) {
    const p = papers.find((x) => x.id === criteria.paper_id)
    activeFilters.push({ label: `试卷: ${p?.name ?? '?'}`, onClear: () => setCriteria((c) => ({ ...c, paper_id: null })) })
  }
  if (criteria.chapter_id != null) {
    const c = chapters.find((x) => x.id === criteria.chapter_id)
    activeFilters.push({ label: `章节: ${c?.name ?? '?'}`, onClear: () => setCriteria((v) => ({ ...v, chapter_id: null })) })
  }
  if (criteria.difficulty_id != null) {
    const d = diffs.find((x) => x.id === criteria.difficulty_id)
    activeFilters.push({ label: `难度: ${d?.name ?? '?'}`, onClear: () => setCriteria((v) => ({ ...v, difficulty_id: null })) })
  }
  selectedKps.forEach((kpId) => {
    const kp = kps.find((x) => x.id === kpId)
    activeFilters.push({ label: `知识点: ${kp?.name ?? '?'}`, onClear: () => toggleKp(kpId) })
  })

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 侧栏筛选 */}
      <Paper w={260} p="md" withBorder radius={0} style={{ borderRight: '1px solid var(--mantine-color-default-border)', overflow: 'auto' }}>
        <Group justify="space-between" mb="sm">
          <Group gap={4}><IconFilter size={16} /><Text size="sm" fw={600}>筛选</Text></Group>
          <Button variant="subtle" size="xs" onClick={clearAll}>清除全部</Button>
        </Group>

        <Stack gap="sm">
          <Select
            label="题型"
            data={typeData}
            value={criteria.type_id != null ? String(criteria.type_id) : null}
            onChange={(v) => setCriteria((c) => ({ ...c, type_id: v ? Number(v) : null }))}
            size="sm"
            clearable
            placeholder="全部"
          />
          <Select
            label="来源试卷"
            data={paperData}
            value={criteria.paper_id != null ? String(criteria.paper_id) : null}
            onChange={(v) => setCriteria((c) => ({ ...c, paper_id: v ? Number(v) : null }))}
            size="sm"
            clearable
            placeholder="全部"
          />
          <Select
            label="章节"
            data={chapterData}
            value={criteria.chapter_id != null ? String(criteria.chapter_id) : null}
            onChange={(v) => setCriteria((c) => ({ ...c, chapter_id: v ? Number(v) : null }))}
            size="sm"
            clearable
            placeholder="全部"
          />
          <Select
            label="难度"
            data={diffData}
            value={criteria.difficulty_id != null ? String(criteria.difficulty_id) : null}
            onChange={(v) => setCriteria((c) => ({ ...c, difficulty_id: v ? Number(v) : null }))}
            size="sm"
            clearable
            placeholder="全部"
          />

          <div>
            <Text size="sm" fw={500} mb={4}>知识点（命中任一）</Text>
            <Group gap={4}>
              {kps.map((kp) => (
                <Chip
                  key={kp.id}
                  checked={selectedKps.has(kp.id)}
                  onChange={() => toggleKp(kp.id)}
                  size="xs"
                  variant="light"
                >
                  {kp.name}
                </Chip>
              ))}
            </Group>
          </div>
        </Stack>
      </Paper>

      {/* 主内容 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 已选条件 */}
        {activeFilters.length > 0 && (
          <Group gap={4} p="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
            {activeFilters.map((f, i) => (
              <Badge
                key={i}
                variant="light"
                color="sky"
                rightSection={
                  <ActionIcon size="xs" variant="transparent" color="sky" onClick={f.onClear}>
                    <IconX size={10} />
                  </ActionIcon>
                }
              >
                {f.label}
              </Badge>
            ))}
          </Group>
        )}

        {/* 题目网格 */}
        <ScrollArea style={{ flex: 1 }} p="md">
          <Text size="sm" c="dimmed" mb="sm">共 {questions.length} 题</Text>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 5, xl: 6 }} spacing="sm">
            {questions.map((q) => (
              <Card
                key={q.id}
                shadow="xs"
                padding="xs"
                withBorder
                style={{
                  borderColor: inBasket.has(q.id) ? 'var(--mantine-color-sky-4)' : undefined,
                  borderWidth: inBasket.has(q.id) ? 2 : undefined
                }}
              >
                <Checkbox
                  size="xs"
                  label="加入组卷篮"
                  checked={inBasket.has(q.id)}
                  onChange={() => toggleBasket(q.id)}
                  mb={4}
                />
                {q.image_path && (
                  <Card.Section>
                    <img
                      src={`app://projects/${q.paper_id}/images/q_${q.id}.png`}
                      alt={`题${q.id}`}
                      style={{ width: '100%', display: 'block' }}
                    />
                  </Card.Section>
                )}
                <Group justify="space-between" mt={4}>
                  <Text size="xs" c="dimmed">
                    {q.paper_name} · 第{q.order_in_paper}题
                  </Text>
                  {inBasket.has(q.id) && (
                    <Tooltip label="已在篮中">
                      <IconShoppingCart size={14} color="var(--mantine-color-sky-5)" />
                    </Tooltip>
                  )}
                </Group>
                <Text size="xs" c="dimmed">{typeName(q.type_id)}</Text>
              </Card>
            ))}
          </SimpleGrid>
        </ScrollArea>
      </div>
    </div>
  )
}

export default BankView
