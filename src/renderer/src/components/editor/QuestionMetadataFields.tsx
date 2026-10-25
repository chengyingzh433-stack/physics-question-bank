import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core'
import type { ChapterDTO, DifficultyDTO, KnowledgePointDTO, QuestionTypeDTO } from '@shared/types'
import type { QuestionMetadataInput } from '@shared/editable'
import { ChapterPicker } from '../ChapterPicker'
import { KnowledgePointPicker } from '../KnowledgePointPicker'
import { ocrErrorMessage } from './ocrMessages'

export function QuestionMetadataFields({ value, onChange, disabled, onBusy }: {
  value: QuestionMetadataInput; onChange: (value: QuestionMetadataInput) => void; disabled: boolean; onBusy: (busy: boolean) => void
}) {
  const [types, setTypes] = useState<QuestionTypeDTO[]>([]), [chapters, setChapters] = useState<ChapterDTO[]>([])
  const [points, setPoints] = useState<KnowledgePointDTO[]>([]), [difficulties, setDifficulties] = useState<DifficultyDTO[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    Promise.all([window.api.listQuestionTypes(), window.api.listChapters(), window.api.listKnowledgePoints(), window.api.listDifficulties()])
      .then(([ts, cs, ps, ds]) => { if (active) { setTypes(ts); setChapters(cs); setPoints(ps); setDifficulties(ds) } })
      .catch((e) => { if (active) setError(ocrErrorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [retry])
  const change = (patch: Partial<QuestionMetadataInput>) => onChange({ ...value, ...patch })
  const createPoint = async (name: string) => {
    onBusy(true)
    try {
      const id = await window.api.createKnowledgePoint(name, value.chapterId)
      setPoints(await window.api.listKnowledgePoints())
      change({ knowledgePointIds: [...new Set([...value.knowledgePointIds, id])] })
    } finally { onBusy(false) }
  }
  const refreshChapters = useCallback((rows: ChapterDTO[]) => setChapters(rows), [])
  const locked = disabled || loading || Boolean(error)
  return <Paper withBorder p="md"><Stack gap="sm">
    <Group justify="space-between"><Text fw={600}>标签与来源</Text><Badge variant="light" color="gray">选填 · 与题目一起保存</Badge></Group>
    {error && <Alert color="red">{error}<Button size="xs" ml="sm" disabled={disabled} onClick={() => setRetry((v) => v + 1)}>重新读取标签</Button></Alert>}
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
      <Select label="题型" searchable clearable size="xs" disabled={locked} placeholder="选择题型"
        data={types.map((r) => ({ value: String(r.id), label: r.name }))} value={value.typeId === null ? null : String(value.typeId)}
        onChange={(v) => change({ typeId: v ? Number(v) : null })} />
      <ChapterPicker chapters={chapters} value={value.chapterId} disabled={locked} onRefresh={refreshChapters}
        onChange={(id) => change({ chapterId: id })} />
      <Select label="难度" clearable size="xs" disabled={locked} placeholder="选择难度"
        data={difficulties.map((r) => ({ value: String(r.id), label: r.name }))} value={value.difficultyId === null ? null : String(value.difficultyId)}
        onChange={(v) => change({ difficultyId: v ? Number(v) : null })} />
    </SimpleGrid>
    <KnowledgePointPicker points={points} value={value.knowledgePointIds} disabled={locked}
      onChange={(ids) => change({ knowledgePointIds: ids })} onCreate={createPoint} />
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      <NumberInput label="年份" size="xs" value={value.year ?? ''} min={1900} max={2100} allowDecimal={false} allowNegative={false}
        disabled={disabled} placeholder="留空沿用原资料年份" onChange={(v) => change({ year: typeof v === 'number' ? v : null })} />
      <TextInput label="出处" size="xs" value={value.source ?? ''} maxLength={300} disabled={disabled}
        placeholder="例如：期末卷、某校模拟题；留空沿用原资料出处" onChange={(e) => change({ source: e.currentTarget.value || null })} />
    </SimpleGrid>
  </Stack></Paper>
}
