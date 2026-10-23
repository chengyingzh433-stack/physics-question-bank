import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Button,
  ActionIcon,
  Tooltip,
  LoadingOverlay,
  Badge,
  Popover,
  Stack,
  NumberInput,
  TextInput
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconUpload, IconTrash, IconArrowRight, IconTag } from '@tabler/icons-react'
import type { PaperDTO } from '@shared/types'
import { importPagesFromPdf } from '../services/ImportService'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'

function HomeView(): React.JSX.Element {
  const [papers, setPapers] = useState<PaperDTO[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const importing = useRef(false)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    try {
      setPapers(await window.api.listPapers())
    } catch (e) {
      notifications.show({
        title: '加载失败',
        message: String(e),
        color: 'red'
      })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const importOne = useCallback(async (create: () => Promise<PaperDTO | null>) => {
    let paper: PaperDTO | null = null
    try {
      paper = await create()
      if (!paper) return false
      await importPagesFromPdf(paper)
      return true
    } catch (e) {
      // 回滚：若已建 paper 行但后续读尺寸/写页失败，删掉这条脏数据（含磁盘文件，T3 后 deletePaper 一并清）
      if (paper) {
        try {
          await window.api.deletePaper(paper.id)
          await refresh()
        } catch {
          // 回滚失败不掩盖原错误，仅记录
          console.error('[import] 回滚 paper 失败', paper.id)
        }
      }
      notifications.show({
        title: '导入失败',
        message: `${paper ? paper.name + '：' : ''}${e instanceof Error ? e.message : String(e)}`,
        color: 'red'
      })
      return false
    }
  }, [refresh])

  const handleImport = useCallback(async () => {
    if (importing.current) return
    importing.current = true
    setBusy(true); setImportStatus('正在导入试卷…')
    try {
      if (await importOne(() => window.api.importPaper(''))) {
        notifications.show({ message: '导入成功', color: 'green' })
      }
      await refresh()
    } finally {
      importing.current = false
      setBusy(false); setImportStatus('')
    }
  }, [importOne, refresh])

  const importDroppedFiles = useCallback(async (files: File[]) => {
    if (importing.current) {
      notifications.show({ message: '正在导入，请等待当前任务完成。', color: 'blue' })
      return
    }
    const pdfs = files.filter((file) => /\.pdf$/i.test(file.name))
    if (pdfs.length !== files.length || files.length === 0) {
      notifications.show({ message: '仅支持 PDF 文件，其他格式和文件夹已跳过。', color: 'orange' })
    }
    if (pdfs.length === 0) return
    importing.current = true
    setBusy(true)
    let imported = 0
    try {
      for (const [index, file] of pdfs.entries()) {
        setImportStatus(`正在导入 ${index + 1}/${pdfs.length}：${file.name}`)
        if (await importOne(() => window.api.importDroppedPaper(file))) imported++
      }
      await refresh()
      if (imported) notifications.show({ message: `已导入 ${imported} 份试卷，点击试卷即可开始裁切。`, color: 'green' })
    } finally {
      importing.current = false
      setBusy(false); setImportStatus('')
    }
  }, [importOne, refresh])

  useEffect(() => {
    let depth = 0
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault(); depth++
      if (!importing.current) setDragging(true)
    }
    const over = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = importing.current ? 'none' : 'copy'
    }
    const leave = () => { depth = Math.max(0, depth - 1); if (depth === 0) setDragging(false) }
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault(); depth = 0; setDragging(false)
      void importDroppedFiles(Array.from(event.dataTransfer.files))
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [importDroppedFiles])

  const handleOpen = useCallback(
    (id: number) => {
      navigate(`/crop/${id}`)
    },
    [navigate]
  )

  const handleDelete = useCallback(
    (id: number, name: string) => {
      modals.openConfirmModal({
        title: '删除试卷',
        children: (
          <Text size="sm">
            确定删除试卷「<strong>{name}</strong>」吗？
            <br />
            将级联删除其所有页、裁切线、片段、入库题目及图片文件，且不可恢复。
          </Text>
        ),
        labels: { confirm: '确认删除', cancel: '取消' },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          try {
            await window.api.deletePaper(id)
            await refresh()
            notifications.show({ message: '已删除', color: 'green' })
          } catch (e) {
            notifications.show({
              title: '删除失败',
              message: String(e),
              color: 'red'
            })
          }
        }
      })
    },
    [refresh]
  )

  const handleSaveMeta = useCallback(
    async (paperId: number, year: number | null, source: string | null) => {
      // A12：先写库，再更新 state
      await window.api.updatePaperMeta(paperId, { year, source })
      setPapers((arr) =>
        arr.map((p) => (p.id === paperId ? { ...p, year, source: source?.trim() || null } : p))
      )
      notifications.show({ message: '年份/出处已保存', color: 'green' })
    },
    []
  )

  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 100px)' }}>
      <LoadingOverlay visible={busy} loaderProps={{ children: <Stack align="center"><Text fw={600}>{importStatus}</Text><Text size="sm">请稍候，导入后会自动出现在列表中</Text></Stack> }} />
      {dragging && <div role="status" data-testid="pdf-drop-overlay" style={{
        position: 'fixed', inset: 16, zIndex: 500, pointerEvents: 'none', border: '3px dashed var(--mantine-color-sky-5)',
        borderRadius: 12, background: 'var(--mantine-color-body)', opacity: 0.95,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}><Stack align="center"><IconUpload size={48} /><Text size="xl" fw={700}>松开鼠标，导入 PDF 试卷</Text><Text>支持一次拖入多份 PDF</Text></Stack></div>}
      <Text size="sm" c="dimmed" mb="md">将 PDF 文件拖到此页面即可导入，支持一次拖入多份。</Text>
      {papers.length === 0 ? (
      <EmptyState
        icon={IconUpload}
        title="还没有试卷"
        description="拖入 PDF，或点击下方按钮选择文件，开始裁切和入库"
        actionLabel="导入试卷 PDF"
        onAction={handleImport}
      />
      ) : <>
      <Group justify="space-between" mb="md">
        <Text size="xl" fw={700}>
          试卷列表
        </Text>
        <Button
          leftSection={<IconUpload size={16} />}
          onClick={() => { void handleImport() }}
          loading={busy}
        >
          导入试卷 PDF
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="md">
        {papers.map((p) => (
          <Card
            key={p.id}
            shadow="sm"
            padding="md"
            style={{ cursor: 'pointer' }}
            onClick={() => handleOpen(p.id)}
          >
            <Group justify="space-between" mb="xs">
              <Text fw={600} lineClamp={1} style={{ flex: 1 }}>
                {p.name}
              </Text>
              <StatusBadge status={p.status} />
            </Group>
            <Text size="sm" c="dimmed">
              {p.page_count} 页
            </Text>
            {(p.year != null || p.source) && (
              <Group gap={4} mt={4}>
                {p.year != null && (
                  <Badge size="xs" variant="light" color="grape">{p.year}</Badge>
                )}
                {p.source && (
                  <Badge size="xs" variant="light" color="blue">{p.source}</Badge>
                )}
              </Group>
            )}
            <Text size="xs" c="dimmed">
              {p.created_at ? new Date(p.created_at).toLocaleString() : ''}
            </Text>
            <Group mt="sm" gap="xs">
              <Tooltip label="打开裁切">
                <ActionIcon
                  variant="subtle"
                  color="sky"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOpen(p.id)
                  }}
                >
                  <IconArrowRight size={16} />
                </ActionIcon>
              </Tooltip>
              <PaperMetaPopover paper={p} onSave={handleSaveMeta} />
              <Tooltip label="删除">
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(p.id, p.name)
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      </>}
    </div>
  )
}

// 试卷年份/出处编辑（M13）。这里是"默认值"，题目未单独覆盖时继承它。
function PaperMetaPopover(props: {
  paper: PaperDTO
  onSave: (paperId: number, year: number | null, source: string | null) => Promise<void>
}): React.JSX.Element {
  const { paper, onSave } = props
  const [opened, setOpened] = useState(false)
  const [year, setYear] = useState<number | string>(paper.year ?? '')
  const [source, setSource] = useState(paper.source ?? '')

  const handleSave = async (): Promise<void> => {
    const y = typeof year === 'number' ? year : year.trim() === '' ? null : Number(year)
    await onSave(paper.id, Number.isNaN(y as number) ? null : y, source)
    setOpened(false)
  }

  return (
    <Popover
      width={260}
      position="bottom"
      withArrow
      shadow="md"
      opened={opened}
      onChange={setOpened}
    >
      <Popover.Target>
        <Tooltip label="编辑年份/出处">
          <ActionIcon
            variant="subtle"
            color="grape"
            onClick={(e) => {
              e.stopPropagation()
              setYear(paper.year ?? '')
              setSource(paper.source ?? '')
              setOpened((o) => !o)
            }}
          >
            <IconTag size={16} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown onClick={(e) => e.stopPropagation()}>
        <Stack gap="xs">
          <NumberInput
            label="年份"
            placeholder="如 2023"
            value={year}
            onChange={setYear}
            size="xs"
            min={1900}
            max={2200}
            hideControls
          />
          <TextInput
            label="出处"
            placeholder="如 新课标 I 卷"
            value={source}
            onChange={(e) => setSource(e.currentTarget.value)}
            size="xs"
          />
          <Text size="xs" c="dimmed">
            这是本卷所有题的默认值，单题可在复查页单独覆盖。
          </Text>
          <Button size="xs" onClick={handleSave}>
            保存
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}

export default HomeView
