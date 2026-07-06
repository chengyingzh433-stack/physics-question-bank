import { useCallback, useEffect, useRef, useState } from 'react'
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
  /** 当前查看的页（用于工具栏显示，0-based） */
  onVisiblePageChange?: (pageIndex: number) => void
  /** 缩放/视图模式外部控制 */
  zoomMode: ZoomMode
  zoomPercent: number
  onZoomPercentChange: (pct: number) => void
  /** 为每页叠加覆盖层（裁切线/分隔线）。覆盖层用比例坐标自行换算。 */
  overlayForPage?: (page: PageDTO, widthCss: number, heightCss: number) => React.ReactNode
}

export type ZoomMode = 'fit-width' | 'fit-page' | 'percent'

const BASE_DPI = 96 // 适应宽度 scale 计算用（技术设计 4 节）
const MIN_PCT = 25
const MAX_PCT = 400

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200]

function PDFViewer(props: PDFViewerProps): React.JSX.Element | null {
  const { sourceUrl, pages, zoomMode, zoomPercent, onZoomPercentChange, overlayForPage } = props
  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [docDestroy, setDocDestroy] = useState<(() => Promise<void>) | null>(null)
  const [containerW, setContainerW] = useState(800)
  const [containerH, setContainerH] = useState(600)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 加载 PDF
  useEffect(() => {
    let cancelled = false
    loadPdf(sourceUrl).then(({ doc, destroy }) => {
      if (cancelled) {
        destroy()
        return
      }
      setDoc(doc)
      setDocDestroy(() => destroy)
    })
    return () => {
      cancelled = true
    }
  }, [sourceUrl])

  // 卸载销毁 doc
  useEffect(() => {
    return () => {
      docDestroy?.()
    }
  }, [docDestroy])

  // 观察容器尺寸（适应宽度/整页依赖）
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

  // 计算每页的显示尺寸
  const computePageState = useCallback(
    (page: PageDTO): PageRenderState => {
      const wpt = page.width_pt ?? 595
      const hpt = page.height_pt ?? 842
      // A6: rotation 暂用 0（数据库未存旋转，渲染时按页自身 rotate 已在 getViewport 处理）
      // 显示尺寸基于 zoomMode
      let widthCss: number
      if (zoomMode === 'fit-width') {
        widthCss = containerW - 24 // 留边距
      } else if (zoomMode === 'fit-page') {
        // 整页可见：宽高都不超
        const scaleW = (containerW - 24) / wpt
        const scaleH = (containerH - 24) / hpt
        const s = Math.min(scaleW, scaleH)
        widthCss = wpt * s
      } else {
        // percent：100% = wpt * BASE_DPI/72
        widthCss = (wpt * (zoomPercent / 100) * BASE_DPI) / 72
      }
      widthCss = Math.max(50, widthCss)
      const heightCss = (widthCss * hpt) / wpt
      return { widthCss, heightCss, rotation: 0, widthPt: wpt }
    },
    [zoomMode, zoomPercent, containerW, containerH]
  )

  if (!doc) return <div style={{ padding: 24 }}>加载 PDF…</div>

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
    >
      <ZoomToolbar
        zoomMode={zoomMode}
        zoomPercent={zoomPercent}
        onPct={onZoomPercentChange}
        onFitWidth={() => onZoomPercentChange(-1) /* 由 zoomMode 控制 */}
        onFitPage={() => onZoomPercentChange(-2)}
      />
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'auto',
          background: '#525659',
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

// ---- 工具栏 ----
function ZoomToolbar(props: {
  zoomMode: ZoomMode
  zoomPercent: number
  onPct: (pct: number) => void
  onFitWidth: () => void
  onFitPage: () => void
}): React.JSX.Element {
  const { zoomPercent, onPct, onFitWidth, onFitPage } = props
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        background: '#eee',
        borderBottom: '1px solid #ccc'
      }}
    >
      <button onClick={onFitWidth}>适应宽度</button>
      <button onClick={onFitPage}>适应整页</button>
      <button onClick={() => onPct(clampPct(prevStep(zoomPercent)))}>−</button>
      <span style={{ minWidth: 48, textAlign: 'center' }}>
        {zoomPercent < 0 ? (zoomPercent === -1 ? '适宽' : '适页') : `${zoomPercent}%`}
      </span>
      <button onClick={() => onPct(clampPct(nextStep(zoomPercent)))}>+</button>
      <select
        value={zoomPercent < 0 ? String(zoomPercent) : 'pct'}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (v > 0) onPct(v)
          else if (v === -1) onFitWidth()
          else if (v === -2) onFitPage()
        }}
      >
        <option value="pct">{zoomPercent > 0 ? `${zoomPercent}%` : '自定义'}</option>
        {ZOOM_STEPS.map((s) => (
          <option key={s} value={s}>
            {s}%
          </option>
        ))}
        <option value="-1">适应宽度</option>
        <option value="-2">适应整页</option>
      </select>
    </div>
  )
}

function prevStep(pct: number): number {
  if (pct <= 0) return 100
  let prev = ZOOM_STEPS[0]
  for (const s of ZOOM_STEPS) {
    if (s < pct) prev = s
  }
  return pct <= ZOOM_STEPS[0] ? Math.max(MIN_PCT, pct - 25) : prev
}

function nextStep(pct: number): number {
  if (pct <= 0) return 100
  let next = ZOOM_STEPS[ZOOM_STEPS.length - 1]
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] > pct) next = ZOOM_STEPS[i]
  }
  return pct >= ZOOM_STEPS[ZOOM_STEPS.length - 1]
    ? Math.min(MAX_PCT, pct + 25)
    : next
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
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const renderCancelRef = useRef<(() => void) | null>(null)

  // 虚拟化：IntersectionObserver
  useEffect(() => {
    const el = canvasHostRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.isIntersecting)
      },
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
        widthCss: state.widthCss,
        heightCss: state.heightCss,
        dpr,
        rotation: state.rotation,
        widthPt: state.widthPt
      }).then(({ result, cancel, done }) => {
        if (cancelled) {
          cancel()
          return
        }
        localCancel = cancel
        renderCancelRef.current = cancel
        const host = canvasHostRef.current
        if (host) {
          host.innerHTML = ''
          host.appendChild(result.canvas)
        }
        done.catch(() => {
          /* A3: cancel 导致的 reject 忽略 */
        })
      })
    })
    return () => {
      cancelled = true
      localCancel?.()
    }
  }, [doc, pageIndex, visible, state.widthCss, state.heightCss, state.rotation, state.widthPt])

  return (
    <div
      data-page-id={pageId}
      style={{
        width: state.widthCss,
        height: state.heightCss,
        margin: '0 auto 12px',
        background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        position: 'relative'
      }}
      ref={canvasHostRef}
    >
      {overlay}
    </div>
  )
}

export default PDFViewer
