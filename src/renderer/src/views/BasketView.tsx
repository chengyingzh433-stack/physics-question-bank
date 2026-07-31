import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Text,
  Group,
  TextInput,
  Button,
  Paper,
  ActionIcon,
  Stack,
  Tooltip,
  Affix,
  LoadingOverlay,
  Select
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconArrowUp, IconArrowDown, IconTrash, IconFileExport } from '@tabler/icons-react'
import type { BankQuestionDTO, PaperSetItemDTO } from '@shared/types'
import { EmptyState } from '../components/EmptyState'
import { IconClipboardList } from '@tabler/icons-react'

function BasketView(): React.JSX.Element {
  const navigate = useNavigate()
  const [, setSetId] = useState<number | null>(null)
  const [items, setItems] = useState<PaperSetItemDTO[]>([])
  const [qMap, setQMap] = useState<Record<number, BankQuestionDTO>>({})
  const [groupHeaders, setGroupHeaders] = useState<Record<number, string>>({})
  const [exportTitle, setExportTitle] = useState('物理试卷')
  const [answerMode, setAnswerMode] = useState<'none' | 'append' | 'inline'>('none')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const sid = await window.api.getOrCreateDraftSet()
    setSetId(sid)
    const its = await window.api.listSetItems(sid)
    setItems(its)
    const gh: Record<number, string> = {}
    its.forEach((it) => { gh[it.id] = it.group_header ?? '' })
    setGroupHeaders(gh)
    const all = await window.api.listBankQuestions({})
    const m: Record<number, BankQuestionDTO> = {}
    all.forEach((q) => (m[q.id] = q))
    setQMap(m)
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleRemove = useCallback(async (itemId: number) => {
    await window.api.removeFromSet(itemId)
    await reload()
  }, [reload])

  const move = useCallback(async (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= items.length) return
    const a = items[idx]
    const b = items[target]
    const aOrder = a.order_index ?? idx
    const bOrder = b.order_index ?? target
    await window.api.updateSetItem(a.id, { order_index: bOrder })
    await window.api.updateSetItem(b.id, { order_index: aOrder })
    await reload()
  }, [items, reload])

  const handleGroupHeader = useCallback(async (itemId: number, value: string) => {
    setGroupHeaders((m) => ({ ...m, [itemId]: value }))
    await window.api.updateSetItem(itemId, { group_header: value || null })
  }, [])

  const handleExport = useCallback(async () => {
    setBusy(true)
    try {
      const sid = await window.api.getOrCreateDraftSet()
      const path = await window.api.exportBasketPdf(sid, exportTitle, answerMode)
      if (path) {
        notifications.show({ title: '导出成功', message: path, color: 'green' })
      }
    } catch (e) {
      notifications.show({ title: '导出失败', message: String(e), color: 'red' })
    } finally {
      setBusy(false)
    }
  }, [exportTitle, answerMode])

  if (items.length === 0) {
    return (
      <EmptyState
        icon={IconClipboardList}
        title="组卷篮为空"
        description="去题库浏览页勾选题目加入篮"
        actionLabel="去题库浏览"
        onAction={() => navigate('/bank')}
      />
    )
  }

  return (
    <div style={{ position: 'relative', minHeight: '100%', paddingBottom: 80 }}>
      <LoadingOverlay visible={busy} />

      <Stack gap="sm" p="md">
        <Group justify="space-between">
          <Text size="xl" fw={700}>组卷篮</Text>
          <Text size="sm" c="dimmed">{items.length} 题</Text>
        </Group>

        {items.map((it, idx) => {
          const q = qMap[it.question_id]
          return (
            <Paper key={it.id} p="sm" radius="md" withBorder>
              <Group align="flex-start" wrap="nowrap" gap="sm">
                {/* 上下移 */}
                <Stack gap={2}>
                  <Tooltip label="上移">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      disabled={idx === 0}
                      onClick={() => move(idx, -1)}
                    >
                      <IconArrowUp size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="下移">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      disabled={idx === items.length - 1}
                      onClick={() => move(idx, 1)}
                    >
                      <IconArrowDown size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Stack>

                {/* 题目内容 */}
                <div style={{ flex: 1 }}>
                  <Group gap="xs" mb={4}>
                    <Text fw={600} size="sm">第 {idx + 1} 项</Text>
                    {q && (
                      <Text size="xs" c="dimmed">
                        {q.paper_name} · 原第{q.order_in_paper}题
                      </Text>
                    )}
                  </Group>
                  <Group gap="xs" mb={4}>
                    <Text size="xs" c="dimmed">分组标题：</Text>
                    <TextInput
                      value={groupHeaders[it.id] ?? ''}
                      onChange={(e) => handleGroupHeader(it.id, e.currentTarget.value)}
                      placeholder="（可选）"
                      size="xs"
                      w={200}
                    />
                  </Group>
                  {q && q.image_path && (
                    <img
                      src={`app://projects/${q.paper_id}/images/q_${q.id}.png`}
                      alt={`题${q.id}`}
                      style={{ maxWidth: 300, display: 'block', borderRadius: 'var(--mantine-radius-sm)' }}
                    />
                  )}
                </div>

                {/* 移除 */}
                <Tooltip label="移除">
                  <ActionIcon variant="subtle" color="red" onClick={() => handleRemove(it.id)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Paper>
          )
        })}
      </Stack>

      {/* 固定底栏 */}
      <Affix position={{ bottom: 0, left: 220, right: 0 }}>
        <Paper shadow="md" p="md" radius={0} withBorder style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Group justify="space-between" wrap="wrap" gap="sm">
            <TextInput
              label="试卷标题"
              value={exportTitle}
              onChange={(e) => setExportTitle(e.currentTarget.value)}
              size="sm"
              w={200}
            />
            <Select
              label="包含答案"
              size="sm"
              w={160}
              value={answerMode}
              onChange={(v) => setAnswerMode((v as 'none' | 'append' | 'inline') ?? 'none')}
              data={[
                { value: 'none', label: '不含答案' },
                { value: 'append', label: '末尾参考答案' },
                { value: 'inline', label: '每题后紧跟' }
              ]}
              allowDeselect={false}
            />
            <Button
              color="sky"
              leftSection={<IconFileExport size={16} />}
              onClick={handleExport}
              loading={busy}
              disabled={items.length === 0}
              mt="lg"
            >
              导出 PDF
            </Button>
          </Group>
        </Paper>
      </Affix>
    </div>
  )
}

export default BasketView
