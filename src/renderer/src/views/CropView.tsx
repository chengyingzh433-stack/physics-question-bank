import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Group,
  SegmentedControl,
  ActionIcon,
  Tooltip,
  Text,
  Button,
  Badge
} from '@mantine/core'
import { IconArrowLeft, IconArrowBackUp, IconSquare, IconArrowRight } from '@tabler/icons-react'
import { sourcePdfUrl } from '../services/ImportService'
import { useCropData } from '../services/useCropData'
import PDFViewer, { type ZoomMode } from './PDFViewer'
import CropOverlay from './CropOverlay'

export type ToolMode = 'pan' | 'cut' | 'box-split' | 'box-exclude'

function CropView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId)
  const crop = useCropData(pid)

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [zoomPercent, setZoomPercent] = useState(100)
  const [toolMode, setToolMode] = useState<ToolMode>('pan')
  const [activePageId, setActivePageId] = useState<number | null>(null)

  useEffect(() => {
    if (crop.pages.length > 0 && activePageId === null) {
      setActivePageId(crop.pages[0].id)
    }
  }, [crop.pages, activePageId])

  const activePage = crop.pages.find((p) => p.id === activePageId) ?? null

  const handleFitWidth = () => { setZoomMode('fit-width'); setZoomPercent(-1) }
  const handleFitPage = () => { setZoomMode('fit-page'); setZoomPercent(-2) }
  const handleZoomPct = (pct: number) => {
    if (pct === -1) return handleFitWidth()
    if (pct === -2) return handleFitPage()
    setZoomMode('percent')
    setZoomPercent(pct)
  }

  if (!crop.loaded) {
    return <Text p="md" c="dimmed">加载中…</Text>
  }
  if (!crop.paper) {
    return <Text p="md" c="red">未找到试卷 (id={pid})</Text>
  }

  // M14.5：两种卷裁完都去后期处理（删无关片段 / 合并跨页）。
  // 答案卷的后期处理页跑答案模式，完成后才跳答案匹配页——
  // 所以这里对答案卷用【答案卷自己的 id】，不是 parent_paper_id。
  const isAnswer = crop.paper.kind === 'answer'
  const nextPath = `/post/${pid}`
  const nextLabel = isAnswer ? '去整理答案' : '去后期处理'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 工具栏 */}
      <Group
        gap="sm"
        p="xs"
        justify="space-between"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        {/* 左: 返回 + 试卷名 */}
        <Group gap="sm">
          <Tooltip label="返回主页">
            <ActionIcon variant="subtle" component="a" href="#/">
              <IconArrowLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <Text fw={600} size="sm">{crop.paper.name}</Text>
          {isAnswer && <Badge size="sm" variant="light" color="violet">答案卷</Badge>}
          <Text size="xs" c="dimmed">{crop.pages.length} 页</Text>
        </Group>

        {/* 中: 列模式 + 工具 + 撤销 */}
        <Group gap="md">
          <SegmentedControl
            size="xs"
            value={String(activePage?.column_mode ?? 1)}
            onChange={(v) => activePage && crop.setColumnMode(activePage.id, Number(v))}
            data={[
              { value: '1', label: '1 列' },
              { value: '2', label: '2 列' },
              { value: '3', label: '3 列' }
            ]}
            disabled={!activePage}
          />
          <SegmentedControl
            size="xs"
            value={toolMode}
            onChange={(v) => setToolMode(v as ToolMode)}
            data={[
              { value: 'pan', label: '🤚 平移' },
              { value: 'cut', label: '✂️ 横切' },
              { value: 'box-split', label: '⬚ 框选' },
              { value: 'box-exclude', label: '⛔ 排除' }
            ]}
          />
          <Tooltip label="撤销上一刀">
            <ActionIcon
              variant="subtle"
              color="orange"
              onClick={() => crop.undoLastCutLine(pid)}
            >
              <IconArrowBackUp size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="撤销上一框">
            <ActionIcon
              variant="subtle"
              color="violet"
              onClick={() => crop.undoLastManualBox(pid)}
            >
              <IconSquare size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {/* 右: 缩放控件由 PDFViewer 内置；下一步按 kind 分流 */}
        <Button
          size="xs"
          variant="light"
          rightSection={<IconArrowRight size={14} />}
          component={Link}
          to={nextPath}
        >
          {nextLabel}
        </Button>
      </Group>

      {/* 查看器 + 覆盖层（Ctrl+滚轮锚点缩放由 PDFViewer 内部处理，T4）*/}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <PDFViewer
          sourceUrl={sourcePdfUrl(pid)}
          pages={crop.pages}
          zoomMode={zoomMode}
          zoomPercent={zoomPercent}
          onZoomPercentChange={handleZoomPct}
          onVisiblePageChange={(idx) => {
            const p = crop.pages[idx]
            if (p) setActivePageId(p.id)
          }}
          overlayForPage={(page, _wCss, _hCss) => (
            <CropOverlay
              page={page}
              dividers={crop.dividers[page.id] ?? []}
              cutLines={crop.cutLines[page.id] ?? []}
              manualBoxes={crop.manualBoxes[page.id] ?? []}
              toolMode={toolMode}
              onReplaceDividers={(xs) => crop.replaceDividers(page.id, xs)}
              onAddCutLine={(col, y) => crop.addCutLine(page.id, col, y)}
              onDeleteCutLine={(id) => crop.deleteCutLine(id, page.id)}
              onAddManualBox={(x0, y0, x1, y1, isExcluded) =>
                crop.addManualBox(page.id, x0, y0, x1, y1, isExcluded)
              }
              onDeleteManualBox={(id) => crop.deleteManualBox(id, page.id)}
            />
          )}
        />
      </div>
    </div>
  )
}

export default CropView
