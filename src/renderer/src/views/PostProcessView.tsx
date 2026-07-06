import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { SegmentDTO, QuestionDTO } from '@shared/types'
import { EXPORT_DPI } from '@shared/constants'
import { sourcePdfUrl } from '../services/ImportService'
import { loadPdf, renderPageRegion, type PdfDocument } from '../services/RenderService'
import {
  renderSegmentsAtDpi,
  composeQuestionCanvas,
  canvasToPngArrayBuffer
} from '../services/QuestionRenderService'
import type { PageGeom } from '../services/ColumnCropService'

interface ThumbState {
  loaded: boolean
  error?: string
}

function PostProcessView(): React.JSX.Element | null {
  const { paperId } = useParams<{ paperId: string }>()
  const pid = Number(paperId)

  const [doc, setDoc] = useState<PdfDocument | null>(null)
  const [docDestroy, setDocDestroy] = useState<(() => Promise<void>) | null>(null)
  const [pages, setPages] = useState<{ id: number; page_index: number; width_pt: number; height_pt: number }[]>([])
  const [segments, setSegments] = useState<SegmentDTO[]>([])
  const [showDeleted, setShowDeleted] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [questions, setQuestions] = useState<QuestionDTO[]>([])
  // segment id -> question id
  const [segToQuestion, setSegToQuestion] = useState<Record<number, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 加载 doc
  useEffect(() => {
    let cancelled = false
    loadPdf(sourcePdfUrl(pid)).then(({ doc, destroy }) => {
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
  }, [pid])

  useEffect(() => {
    return () => {
      docDestroy?.()
    }
  }, [docDestroy])

  const reloadAll = useCallback(async () => {
    const pgs = await window.api.getPages(pid)
    setPages(pgs.map((p) => ({ id: p.id, page_index: p.page_index, width_pt: p.width_pt ?? 0, height_pt: p.height_pt ?? 0 })))
    const allSegs = await window.api.getSegmentsByPaper(pid)
    setSegments(allSegs)
    const qs = await window.api.listQuestionsByPaper(pid)
    setQuestions(qs)
    // 建立 segment→question 映射
    const map: Record<number, number> = {}
    for (const q of qs) {
      const segs = await window.api.getQuestionSegments(q.id)
      for (const s of segs) {
        if (s.id !== undefined) map[s.id] = q.id
      }
    }
    setSegToQuestion(map)
  }, [pid])

  useEffect(() => {
    reloadAll()
  }, [reloadAll])

  const visibleSegs = segments.filter((s) => (s.is_deleted ? showDeleted : true))

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDelete = useCallback(async (id: number) => {
    await window.api.setSegmentDeleted(id, true)
    setSegments((arr) => arr.map((s) => (s.id === id ? { ...s, is_deleted: 1 } : s)))
  }, [])

  const handleRestore = useCallback(async (id: number) => {
    await window.api.setSegmentDeleted(id, false)
    setSegments((arr) => arr.map((s) => (s.id === id ? { ...s, is_deleted: 0 } : s)))
  }, [])

  // 合并：把选中的若干 segment 建一个 question（按选中顺序为 merge_order）
  const handleMerge = useCallback(async () => {
    if (selected.size < 2) {
      setError('请至少选择 2 个片段')
      return
    }
    setError(null)
    setBusy(true)
    try {
      // 按当前可见顺序排序选中项
      const ordered = visibleSegs.filter((s) => selected.has(s.id!) && !s.is_deleted)
      const segIds = ordered.map((s) => s.id!)
      await window.api.createQuestionWithSegments(pid, segIds, null)
      setSelected(new Set())
      await reloadAll()
    } catch (e) {
      setError('合并失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [selected, visibleSegs, pid, reloadAll])

  // 取消合并：删该 question（占位行+映射），片段回到独立
  const handleUnmerge = useCallback(
    async (questionId: number) => {
      await window.api.deleteQuestion(questionId)
      await reloadAll()
    },
    [reloadAll]
  )

  /**
   * 完成入库（M4-2）：
   * 1. 未删除且未成组的单片段各建一题；已合并用现有题。
   * 2. 给每题赋 order_in_paper（取其 segments 最小 order_index 为代表序）。
   * 3. renumber 为 1..N 连续。
   * 4. 逐题 300DPI 渲染→R1 拼接→PNG→落盘→回写 image_path/尺寸。
   * 5. status='done'。
   */
  const handleFinalize = useCallback(async () => {
    if (!doc) return
    setBusy(true)
    setError(null)
    try {
      const allSegs = await window.api.getSegmentsByPaper(pid)
      const liveSegs = allSegs.filter((s) => !s.is_deleted)
      const existingQs = await window.api.listQuestionsByPaper(pid)

      // 1. 未成组的单片段各建题
      const groupedSegIds = new Set<number>()
      for (const q of existingQs) {
        const qs = await window.api.getQuestionSegments(q.id)
        qs.forEach((s) => s.id !== undefined && groupedSegIds.add(s.id))
      }
      const newQuestionIds: number[] = [...existingQs.map((q) => q.id)]
      for (const s of liveSegs) {
        if (s.id !== undefined && !groupedSegIds.has(s.id)) {
          const qid = await window.api.createQuestionWithSegments(pid, [s.id], null)
          newQuestionIds.push(qid)
          groupedSegIds.add(s.id)
        }
      }

      // 2. 给每题赋代表 order（其 segments 最小 order_index）
      const pagesMap = new Map<number, PageGeom>()
      const pgs = await window.api.getPages(pid)
      for (const p of pgs) {
        pagesMap.set(p.id, {
          page_index: p.page_index,
          width_pt: p.width_pt ?? 0,
          height_pt: p.height_pt ?? 0
        })
      }

      type QOrder = { qid: number; segs: SegmentDTO[]; order: number }
      const qOrders: QOrder[] = []
      for (const qid of newQuestionIds) {
        const segs = await window.api.getQuestionSegments(qid)
        const order = segs.reduce((m, s) => Math.min(m, s.order_index ?? 0), Infinity)
        qOrders.push({ qid, segs, order: order === Infinity ? 0 : order })
      }
      // 按 order 排序赋 order_in_paper
      qOrders.sort((a, b) => a.order - b.order)
      for (let i = 0; i < qOrders.length; i++) {
        await window.api.setQuestionOrder(qOrders[i].qid, i + 1)
      }

      // 3. 逐题出图
      for (const qo of qOrders) {
        const segMap = await window.api.getQuestionSegmentMap(qo.qid)
        const mergeOrderMap = new Map<number, number>(
          segMap.map((m) => [m.segment_id, m.merge_order])
        )
        const rendered = await renderSegmentsAtDpi(doc, qo.segs, pagesMap, EXPORT_DPI, mergeOrderMap)
        const { canvas, widthPx, heightPx } = composeQuestionCanvas(rendered)
        const buf = await canvasToPngArrayBuffer(canvas)
        const { relPath } = await window.api.saveQuestionPng(pid, qo.qid, buf)
        await window.api.setQuestionImage(qo.qid, relPath, widthPx, heightPx)
        // 释放离屏 canvas（A11）
        canvas.width = 0
        canvas.height = 0
        rendered.forEach((r) => {
          r.canvas.width = 0
          r.canvas.height = 0
        })
      }

      // 4. status=done
      await window.api.setPaperStatus(pid, 'done')
      await reloadAll()
    } catch (e) {
      setError('入库失败：' + String(e))
    } finally {
      setBusy(false)
    }
  }, [doc, pid, reloadAll])

  // 把每个 segment 按 question 分组（未合并的各自独立）
  const mergedGroups = questions.filter((q) => q.is_merged)

  if (!doc) {
    return <div style={{ padding: 24 }}>加载 PDF…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
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
        <Link to="/" style={{ textDecoration: 'none', color: '#333' }}>← 返回</Link>
        <Link to={`/crop/${pid}`} style={{ textDecoration: 'none', color: '#333' }}>裁切</Link>
        <strong style={{ marginLeft: 8 }}>后期处理</strong>
        <div style={{ flex: 1 }} />
        <span>已选 {selected.size}</span>
        <button onClick={handleMerge} disabled={busy || selected.size < 2}>
          合并选中
        </button>
        <button onClick={handleFinalize} disabled={busy} style={{ fontWeight: 700 }}>
          {busy ? '入库中…' : '完成入库'}
        </button>
        <label style={{ marginLeft: 8 }}>
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
          />
          显示已删除
        </label>
      </div>

      {error && <div style={{ color: 'crimson', padding: 8 }}>{error}</div>}

      {/* 合并组列表 */}
      {mergedGroups.length > 0 && (
        <div style={{ padding: 8, background: '#fffde7', borderBottom: '1px solid #ddd' }}>
          <strong>合并的题目（{mergedGroups.length} 组）：</strong>
          {mergedGroups.map((q) => (
            <span key={q.id} style={{ marginLeft: 12 }}>
              题#{q.id}
              <button
                style={{ marginLeft: 4 }}
                onClick={() => handleUnmerge(q.id)}
              >
                取消合并
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: '#eee' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {visibleSegs.map((s) => {
            const id = s.id!
            const isSelected = selected.has(id)
            const qid = segToQuestion[id]
            return (
              <div
                key={id}
                style={{
                  width: 180,
                  border: isSelected ? '2px solid #0078d7' : '1px solid #bbb',
                  borderRadius: 6,
                  background: '#fff',
                  padding: 4,
                  opacity: s.is_deleted ? 0.4 : 1
                }}
              >
                <div
                  onClick={() => !s.is_deleted && toggleSelect(id)}
                  style={{ cursor: s.is_deleted ? 'default' : 'pointer' }}
                >
                  <SegmentThumb
                    doc={doc}
                    segment={s}
                    pages={pages}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                  seg#{id} · 第{(s.order_index ?? 0)}序
                  {qid !== undefined && ` · 题#${qid}`}
                  {s.is_deleted && ' · 已删'}
                </div>
                <div style={{ marginTop: 2 }}>
                  {s.is_deleted ? (
                    <button onClick={() => handleRestore(id)}>恢复</button>
                  ) : (
                    <button onClick={() => handleDelete(id)}>删除</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- 单个片段缩略图 ----
function SegmentThumb(props: {
  doc: PdfDocument
  segment: SegmentDTO
  pages: { id: number; page_index: number; width_pt: number; height_pt: number }[]
}): React.JSX.Element | null {
  const { doc, segment, pages } = props
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<ThumbState>({ loaded: false })
  const cancelRef = useRef<(() => void) | null>(null)

  const page = pages.find((p) => p.id === segment.page_id)
  useEffect(() => {
    if (!page) return
    let cancelled = false
    renderPageRegion(
      doc,
      page.page_index,
      {
        x0: segment.x_start_ratio,
        x1: segment.x_end_ratio,
        y0: segment.y_start_ratio,
        y1: segment.y_end_ratio
      },
      { rotation: 0, widthPt: page.width_pt, heightPt: page.height_pt, maxPx: 1000 }
    )
      .then(({ result, cancel, done }) => {
        if (cancelled) {
          cancel()
          return
        }
        cancelRef.current = cancel
        const host = hostRef.current
        if (host) {
          host.innerHTML = ''
          const c = result.canvas
          // 等比缩放到缩略图宽度
          const maxW = 172
          const scale = Math.min(1, maxW / c.width)
          c.style.width = `${c.width * scale}px`
          c.style.height = `${c.height * scale}px`
          host.appendChild(c)
        }
        setState({ loaded: true })
        done.catch(() => {})
      })
      .catch((e) => setState({ loaded: false, error: String(e) }))
    return () => {
      cancelled = true
      cancelRef.current?.()
    }
  }, [doc, segment.id, segment.x_start_ratio, segment.x_end_ratio, segment.y_start_ratio, segment.y_end_ratio, page?.page_index, page?.width_pt, page?.height_pt])

  return (
    <div ref={hostRef} style={{ minHeight: 60, background: '#f0f0f0' }}>
      {!state.loaded && !state.error && '渲染中…'}
      {state.error && '渲染失败'}
    </div>
  )
}

export default PostProcessView
