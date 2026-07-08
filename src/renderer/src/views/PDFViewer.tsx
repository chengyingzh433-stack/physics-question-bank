import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Group, ActionIcon, Select, Text, Tooltip } from '@mantine/core'
import { IconZoomIn, IconZoomOut, IconArrowsHorizontal, IconArrowsVertical } from '@tabler/icons-react'
import type { PageDTO } from '@shared/types'
import { loadPdf, type PdfDocument } from '../services/RenderService'

interface PageRenderState {
  widthCss: number
  heightCss: number
  rotation: number
  widthPt: number
}

interface PDFViewerProps {
  sourceUrl: string
  pages: PageDTO[]
  onVisiblePageChange?: (pageIndex: number) => void
  zoomMode: ZoomMode
  zoomPercent: number
  onZoomPercentChange: (pct: number) => void
  overlayForPage?: (page: PageDTO, widthCss: number, heightCss: number) => React.ReactNode
}

export type ZoomMode = 'fit-width' | 'fit-page' | 'percent'

const BASE_DPI = 96
const MIN_PCT = 25
const MAX_PCT = 400

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200]

/** 光标锚点缩放（T4）：缩放前记录光标相对滚动内容的点，
 *  缩放后按新尺寸比例恢复，使光标下的内容点保持在原地。 */
interface ZoomAnchor {
  clientX: number
  clientY: number
  scrollLeft: number
  scrollTop: number
  contentW: number
  contentH: number
}

function PDFViewer(props: PDFViewerProps): React.JSX.Element | null {
  const { sourceUrl, pages, zoomMode, zoomPercent, onZoomPercentChange, overlayForPage } = props
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [docDestroy, setDocDestroy] = useState<(() => Promise<void>) | null>(null)
  const [containerW, setContainerW] = useState(800)
  const [containerH, setContainerH] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // T4: 光标锚点缩放。wheel 时记录锚点，缩放生效后用 layoutEffect 补偿滚动。
  const pendingAnchorRef = useRef<ZoomAnchor | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPdf(sourceUrl).then(({ doc, destroy }) => {
      if (cancelled) { destroy(); return }
      setDoc(doc)
      setDocDestroy(() => destroy)
    })
    return () => { cancelled = true }
  }, [sourceUrl])

  useEffect(() => {
    return () => { docDestroy?.() }
  }, [docDestroy])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setContainerW(el.clientWidth)
      setContainerH(el.clientHeight)
    })
    ro.observe(el)
    setContainerW(el.clientWidth)
    setContainerH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const computePageState = useCallback(
    (page: PageDTO): PageRenderState => {
      const wpt = page.width_pt ?? 595
      const hpt = page.height_pt ?? 842
      let widthCss: number
      if (zoomMode === 'fit-width') {
        widthCss = containerW - 24
      } else if (zoomMode === 'fit-page') {
        const scaleW = (containerW - 24) / wpt
        const scaleH = (containerH - 24) / hpt
        const s = Math.min(scaleW, scaleH)
        widthCss = wpt * s
      } else {
        widthCss = (wpt * (zoomPercent / 100) * BASE_DPI) / 72
      }
      widthCss = Math.max(50, widthCss)
      const heightCss = (widthCss * hpt) / wpt
      return { widthCss, heightCss, rotation: page.rotation ?? 0, widthPt: wpt }
    },
    [zoomMode, zoomPercent, containerW, containerH]
  )

  // T4: 缩放生效后（zoomMode/zoomPercent 变化），在绘制前补偿滚动使光标锚点不动。
  useLayoutEffect(() => {
    const anchor = pendingAnchorRef.current
    pendingAnchorRef.current = null
    const scroller = scrollRef.current
    if (!anchor || !scroller) return
    // 取缩放后内容的实际尺寸（DOM 已更新但尚未绘制）
    const newContentW = scroller.scrollWidth
    const newContentH = scroller.scrollHeight
    if (anchor.contentW <= 0 || anchor.contentH <= 0) return
    // 光标相对旧内容的位置比例
    const ratioX = (anchor.scrollLeft + (anchor.clientX - scroller.getBoundingClientRect().left)) / anchor.contentW
    const ratioY = (anchor.scrollTop + (anchor.clientY - scroller.getBoundingClientRect().top)) / anchor.contentH
    // 按新内容尺寸恢复，使同一内容点仍在光标下
    scroller.scrollLeft = ratioX * newContentW - (anchor.clientX - scroller.getBoundingClientRect().left)
    scroller.scrollTop = ratioY * newContentH - (anchor.clientY - scroller.getBoundingClientRect().top)
  }, [zoomMode, zoomPercent, containerW, containerH, pages])

  // T4: Ctrl+滚轮以光标为锚点缩放
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const scroller = scrollRef.current
      if (!scroller) return
      const delta = e.deltaY < 0 ? 25 : -25
      // 记录锚点（旧尺寸 + 光标位置 + 旧滚动量），供 layoutEffect 补偿
      pendingAnchorRef.current = {
        clientX: e.clientX,
        clientY: e.clientY,
        scrollLeft: scroller.scrollLeft,
        scrollTop: scroller.scrollTop,
        contentW: scroller.scrollWidth,
        contentH: scroller.scrollHeight
      }
      setZoomPercentForWheel((p) => Math.max(MIN_PCT, Math.min(MAX_PCT, p + delta)))
    },
    []
  )

  // T4: 内部维护一个"待提交百分比"，通过 onZoomPercentChange 上抛给父组件。
  // 父组件回传 zoomPercent → 触发上面的 layoutEffect 补偿。
  const setZoomPercentForWheel = useCallback(
    (updater: (p: number) => number) => {
      const cur = zoomMode === 'percent' ? zoomPercent : 100
      const next = updater(cur)
      onZoomPercentChange(next)
    },
    [zoomMode, zoomPercent, onZoomPercentChange]
  )

  if (!doc) return <Text p="md" c="dimmed">加载 PDF…</Text>

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <ZoomToolbar
        zoomMode={zoomMode}
        zoomPercent={zoomPercent}
        onPct={onZoomPercentChange}
        onFitWidth={() => onZoomPercentChange(-1)}
        onFitPage={() => onZoomPercentChange(-2)}
      />
      <div
        ref={scrollRef}
        onWheel={onWheel}
        style={{
          flex: 1,
          overflow: 'auto',
          background: 'var(--mantine-color-dark-7)',
          padding: 12
        }}
      >
        <div style={{ margin: '0 auto', width: 'fit-content' }}>
          {pages.map((page) => {
            const ps = computePageState(page)
            return (
              <PageCanvas
                key={page.id}
                doc={doc}
                pageIndex={page.page_index}
                state={ps}
                pageId={page.id}
                page={page}
                overlay={overlayForPage?.(page, ps.widthCss, ps.heightCss)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- 缩放工具栏（Mantine 组件化）----
function ZoomToolbar(props: {
  zoomMode: ZoomMode
  zoomPercent: number
  onPct: (pct: number) => void
  onFitWidth: () => void
  onFitPage: () => void
}): React.JSX.Element {
  const { zoomMode, zoomPercent, onPct, onFitWidth, onFitPage } = props

  const zoomSelectData = [
    { value: '-1', label: '适应宽度' },
    { value: '-2', label: '适应整页' },
    ...ZOOM_STEPS.map((s) => ({ value: String(s), label: `${s}%` }))
  ]

  const currentValue =
    zoomMode === 'fit-width' ? '-1' : zoomMode === 'fit-page' ? '-2' : String(zoomPercent)

  return (
    <Group gap="xs" p="xs" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Tooltip label="适应宽度">
        <ActionIcon
          variant={zoomMode === 'fit-width' ? 'filled' : 'subtle'}
          color="sky"
          onClick={onFitWidth}
        >
          <IconArrowsHorizontal size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="适应整页">
        <ActionIcon
          variant={zoomMode === 'fit-page' ? 'filled' : 'subtle'}
          color="sky"
          onClick={onFitPage}
        >
          <IconArrowsVertical size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="缩小">
        <ActionIcon variant="subtle" onClick={() => onPct(clampPct(prevStep(zoomPercent)))}>
          <IconZoomOut size={16} />
        </ActionIcon>
      </Tooltip>
      <Select
        data={zoomSelectData}
        value={currentValue}
        onChange={(v) => {
          const n = Number(v)
          if (n === -1) onFitWidth()
          else if (n === -2) onFitPage()
          else onPct(n)
        }}
        size="xs"
        w={110}
        allowDeselect={false}
      />
      <Tooltip label="放大">
        <ActionIcon variant="subtle" onClick={() => onPct(clampPct(nextStep(zoomPercent)))}>
          <IconZoomIn size={16} />
        </ActionIcon>
      </Tooltip>
      <Text size="xs" c="dimmed" ml="xs">
        {zoomMode === 'fit-width' ? '适宽' : zoomMode === 'fit-page' ? '适页' : `${zoomPercent}%`}
      </Text>
    </Group>
  )
}

function prevStep(pct: number): number {
  if (pct <= 0) return 100
  let prev = ZOOM_STEPS[0]
  for (const s of ZOOM_STEPS) { if (s < pct) prev = s }
  return pct <= ZOOM_STEPS[0] ? Math.max(MIN_PCT, pct - 25) : prev
}

function nextStep(pct: number): number {
  if (pct <= 0) return 100
  let next = ZOOM_STEPS[ZOOM_STEPS.length - 1]
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) { if (ZOOM_STEPS[i] > pct) next = ZOOM_STEPS[i] }
  return pct >= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? Math.min(MAX_PCT, pct + 25) : next
}

function clampPct(pct: number): number {
  return Math.max(MIN_PCT, Math.min(MAX_PCT, pct))
}

// ---- 单页 canvas（带虚拟化与渲染取消）----
function PageCanvas(props: {
  doc: PdfDocument
  pageIndex: number
  state: PageRenderState
  pageId: number
  page: PageDTO
  overlay?: React.ReactNode
}): React.JSX.Element {
  const { doc, pageIndex, state, pageId, overlay } = props
  const containerRef = useRef<HTMLDivElement>(null)       // 外层容器，IntersectionObserver 用
  const canvasMountRef = useRef<HTMLDivElement>(null)     // canvas 专用挂载点，命令式代码独占
  const [visible, setVisible] = useState(false)
  const renderCancelRef = useRef<(() => void) | null>(null)

  // 虚拟化：IntersectionObserver（观察外层容器）
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => { for (const e of entries) setVisible(e.isIntersecting) },
      { rootMargin: '1000px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // 渲染（A3: 重渲染前 cancel 旧 task）
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const dpr = window.devicePixelRatio || 1
    renderCancelRef.current?.()
    let localCancel: (() => void) | null = null
    import('../services/RenderService').then(({ renderPage }) => {
      if (cancelled) return
      renderPage(doc, pageIndex, {
        widthCss: state.widthCss, heightCss: state.heightCss,
        dpr, rotation: state.rotation, widthPt: state.widthPt
      }).then(({ result, cancel, done }) => {
        if (cancelled) { cancel(); return }
        localCancel = cancel
        renderCancelRef.current = cancel
        const mount = canvasMountRef.current
        if (mount) {
          mount.innerHTML = ''
          mount.appendChild(result.canvas)
        }
        done.catch(() => {})
      })
    })
    return () => { cancelled = true; localCancel?.() }
  }, [doc, pageIndex, visible, state.widthCss, state.heightCss, state.rotation, state.widthPt])

  return (
    <div
      data-page-id={pageId}
      ref={containerRef}
      style={{
        width: state.widthCss,
        height: state.heightCss,
        margin: '0 auto 12px',
        background: '#fff',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        position: 'relative',
        borderRadius: 'var(--mantine-radius-xs)'
      }}
    >
      {/* canvas 专用挂载点：React 永不放子节点，命令式 innerHTML+appendChild 只操作这里 */}
      <div ref={canvasMountRef} style={{ position: 'absolute', inset: 0 }} />
      {/* overlay 作为兄弟，React 管理，靠自身 position:absolute;inset:0 覆盖在 canvas 上 */}
      {overlay}
    </div>
  )
}

export default PDFViewer
