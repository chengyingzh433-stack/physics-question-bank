import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core'
import type { IntakeDraft, IntakeSummary } from '@shared/intake'

export function IntakeSession({ draft }: { draft: IntakeDraft }) {
  const [rows, setRows] = useState<IntakeSummary[]>([]), [error, setError] = useState('')
  const [inherited, setInherited] = useState<string[]>([])
  useEffect(() => {
    let active = true
    window.api.listIntakeSession(draft.id).then((value) => { if (active) setRows(value) }).catch((e) => { if (active) setError(String(e)) })
    const m = draft.inherited
    if (m) Promise.all([window.api.listQuestionTypes(), window.api.listChapters(), window.api.listDifficulties(), window.api.listKnowledgePoints()]).then(([types, chapters, difficulties, points]) => {
      if (!active) return
      const label = (rows: { id: number; name: string }[], id: number) => rows.find((r) => r.id === id)?.name ?? `已删除标签 #${id}`
      setInherited([
        ...(m.source ? [`来源：${m.source}`] : []), ...(m.year ? [`年份：${m.year}`] : []),
        ...(m.typeId ? [`题型：${label(types, m.typeId)}`] : []), ...(m.chapterId ? [`章节：${label(chapters, m.chapterId)}`] : []),
        ...(m.difficultyId ? [`难度：${label(difficulties, m.difficultyId)}`] : []),
        ...(m.knowledgePointIds.length ? [`知识点：${m.knowledgePointIds.map((id) => label(points, id)).join('、')}`] : [])
      ])
    }).catch((e) => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [draft.id, draft.status])
  return <Stack gap={6}>
    {draft.inherited && <Text size="xs" c="dimmed">本题创建时沿用：{inherited.length ? inherited.join('；') : '无非空标签'}。可在校对页修改。</Text>}
    <details><summary>本次连续录题 · 已入库 {rows.filter((r) => r.status === 'published').length} 题</summary>
      <Stack gap="xs" mt="xs">{error && <Alert color="orange">{error}</Alert>}{rows.map((row, i) => <Group key={row.id} gap="xs">
        <Badge variant="light" color={row.id === draft.id ? 'sky' : 'gray'}>{i + 1}</Badge><Text size="sm">{row.title}</Text>
        {row.id === draft.id ? <Text size="xs">当前题</Text> : <Button size="compact-xs" variant="subtle" component={Link}
          to={row.status === 'published' || row.status === 'reviewing' ? `/questions/${row.questionId}/edit?from=/intake` : `/intake/${row.id}`}>{row.status === 'published' ? '修改已录题' : '返回草稿'}</Button>}
      </Group>)}</Stack>
    </details>
  </Stack>
}
