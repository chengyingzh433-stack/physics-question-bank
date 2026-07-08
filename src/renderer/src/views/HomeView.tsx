import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SimpleGrid,
  Card,
  Text,
  Group,
  Button,
  ActionIcon,
  Tooltip,
  LoadingOverlay
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconUpload, IconTrash, IconArrowRight } from '@tabler/icons-react'
import type { PaperDTO } from '@shared/types'
import { importPagesFromPdf } from '../services/ImportService'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyState } from '../components/EmptyState'

function HomeView(): React.JSX.Element {
  const [papers, setPapers] = useState<PaperDTO[]>([])
  const [busy, setBusy] = useState(false)
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

  const handleImport = useCallback(async () => {
    setBusy(true)
    let paper: PaperDTO | null = null
    try {
      paper = await window.api.importPaper('')
      if (!paper) return // 用户取消选择
      await importPagesFromPdf(paper)
      await refresh()
      notifications.show({ message: '导入成功', color: 'green' })
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
        message: e instanceof Error ? e.message : String(e),
        color: 'red'
      })
    } finally {
      setBusy(false)
    }
  }, [refresh])

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

  if (papers.length === 0 && !busy) {
    return (
      <EmptyState
        icon={IconUpload}
        title="还没有试卷"
        description="导入一份 PDF 试卷开始裁切和入库"
        actionLabel="导入试卷 PDF"
        onAction={handleImport}
      />
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <LoadingOverlay visible={busy} />
      <Group justify="space-between" mb="md">
        <Text size="xl" fw={700}>
          试卷列表
        </Text>
        <Button
          leftSection={<IconUpload size={16} />}
          onClick={handleImport}
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
    </div>
  )
}

export default HomeView
