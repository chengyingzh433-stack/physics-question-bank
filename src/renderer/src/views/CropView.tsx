import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { sourcePdfUrl } from '../services/ImportService'
import { useCropData } from '../services/useCropData'
import PDFViewer, { type ZoomMode } from './PDFViewer'
import CropOverlay from './CropOverlay'

export type ToolMode = 'pan' | 'cut'

function CropView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId)
  const crop = useCropData(pid)

  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width')
  const [zoomPercent, setZoomPercent] = useState(100)
  const [toolMode, setToolMode] = useState<ToolMode>('pan')
  const [activePageId, setActivePageId] = useState<number | null>(null)

  // 选当前页：默认第一页
  useEffect(() => {
    if (crop.pages.length > 0 && activePageId === null) {
      setActivePageId(crop.pages[0].id)
    }
  }, [crop.pages, activePageId])

  const activePage = crop.pages.find((p) => p.id === activePageId) ?? null

  // Ctrl+滚轮缩放（A4: 以光标锚点不在此实现缩放值，仅改百分比；滚动交给容器）
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 25 : -25
      setZoomMode('percent')
      setZoomPercent((p) => {
        const base = p <= 0 ? 100 : p
        return Math.max(25, Math.min(400, base + delta))
      })
    },
    []
  )

  // 工具栏操作
  const handleFitWidth = () => {
    setZoomMode('fit-width')
    setZoomPercent(-1)
  }
  const handleFitPage = () => {
    setZoomMode('fit-page')
    setZoomPercent(-2)
  }
  const handleZoomPct = (pct: number) => {
    if (pct === -1) return handleFitWidth()
    if (pct === -2) return handleFitPage()
    setZoomMode('percent')
    setZoomPercent(pct)
  }

  if (!crop.loaded) {
    return <div style={{ padding: 24 }}>加载中…</div>
  }
  if (!crop.paper) {
    return <div style={{ padding: 24 }}>未找到试卷 (id={pid})</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 顶栏 */}
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
        <a href="#/" style={{ textDecoration: 'none', color: '#333' }}>
          ← 返回
        </a>
        <strong style={{ marginLeft: 8 }}>{crop.paper.name}</strong>
        <span style={{ color: '#999' }}>{crop.pages.length} 页</span>
        <div style={{ flex: 1 }} />
        {/* 列模式 */}
        <span>列模式：</span>
        {[1, 2, 3].map((m) => (
          <button
            key={m}
            disabled={!activePage}
            onClick={() => activePage && crop.setColumnMode(activePage.id, m)}
            style={{
              fontWeight: activePage?.column_mode === m ? 700 : 400
            }}
          >
            {m}
          </button>
        ))}
        <span style={{ width: 1, background: '#ccc', height: 20, margin: '0 8px' }} />
        {/* 工具模式 */}
        <button
          onClick={() => setToolMode('pan')}
          style={{ fontWeight: toolMode === 'pan' ? 700 : 400 }}
        >
          平移
        </button>
        <button
          onClick={() => setToolMode('cut')}
          style={{ fontWeight: toolMode === 'cut' ? 700 : 400 }}
        >
          横切
        </button>
        <button
          disabled={!activePage}
          onClick={() => activePage && crop.undoLastCutLine(activePage.id)}
        >
          撤销上一刀
        </button>
      </div>

      {/* 查看器 + 覆盖层 */}
      <div onWheel={onWheel} style={{ flex: 1, display: 'flex', minHeight: 0 }}>
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
              toolMode={toolMode}
              onReplaceDividers={(xs) => crop.replaceDividers(page.id, xs)}
              onAddCutLine={(col, y) => crop.addCutLine(page.id, col, y)}
              onDeleteCutLine={(id) => crop.deleteCutLine(id, page.id)}
            />
          )}
        />
      </div>
    </div>
  )
}

export default CropView
