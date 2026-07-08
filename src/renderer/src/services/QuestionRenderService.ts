import type { SegmentDTO } from '@shared/types'
import { renderPageRegionAtDpi, type PdfDocument } from './RenderService'
import {
  computeComposedSize,
  computeSegmentXOffset,
  type PageGeom
} from './ColumnCropService'

export interface RenderedSegment {
  canvas: HTMLCanvasElement
  widthPx: number
  heightPx: number
  merge_order: number
}

export interface PageGeomExtended {
  page_index: number
  width_pt: number
  height_pt: number
  rotation?: number
}

/**
 * 渲染一个逻辑题的所有 segment 为高 DPI canvas 列表（按 merge_order 排序）。
 * mergeOrderMap: segmentId → merge_order（来自 question_segments）。
 */
export async function renderSegmentsAtDpi(
  doc: PdfDocument,
  segments: SegmentDTO[],
  pagesMap: Map<number, PageGeom | PageGeomExtended>,
  dpi: number,
  mergeOrderMap: Map<number, number>
): Promise<RenderedSegment[]> {
  const out: RenderedSegment[] = []
  for (const s of segments) {
    const page = pagesMap.get(s.page_id!)
    if (!page) continue
    const rotation = 'rotation' in page ? (page as PageGeomExtended).rotation ?? 0 : 0
    const { canvas, widthPx, heightPx } = await renderPageRegionAtDpi(
      doc,
      page.page_index,
      {
        x0: s.x_start_ratio,
        x1: s.x_end_ratio,
        y0: s.y_start_ratio,
        y1: s.y_end_ratio
      },
      { rotation, widthPt: page.width_pt, heightPt: page.height_pt, dpi }
    )
    out.push({
      canvas,
      widthPx,
      heightPx,
      merge_order: s.id !== undefined ? mergeOrderMap.get(s.id) ?? 0 : 0
    })
  }
  out.sort((a, b) => a.merge_order - b.merge_order)
  return out
}

/**
 * R1: 多段合成一张 canvas。取最大宽度，较窄段水平居中，按 merge_order 纵向拼接。
 * 单段直接返回。返回合成 canvas + 尺寸。
 */
export function composeQuestionCanvas(rendered: RenderedSegment[]): {
  canvas: HTMLCanvasElement
  widthPx: number
  heightPx: number
} {
  if (rendered.length === 0) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    return { canvas: c, widthPx: 1, heightPx: 1 }
  }
  const { widthPx: maxWidth, heightPx: totalHeight } = computeComposedSize(
    rendered.map((r) => ({ widthPx: r.widthPx, heightPx: r.heightPx }))
  )

  const out = document.createElement('canvas')
  out.width = maxWidth
  out.height = totalHeight
  const ctx = out.getContext('2d')!
  // 白色背景（R1：较窄段在白色背景上居中）
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, maxWidth, totalHeight)

  let y = 0
  for (const r of rendered) {
    const x = computeSegmentXOffset(r.widthPx, maxWidth) // 水平居中
    ctx.drawImage(r.canvas, x, y)
    y += r.heightPx
  }
  return { canvas: out, widthPx: maxWidth, heightPx: totalHeight }
}

/** canvas → PNG ArrayBuffer（A9: ArrayBuffer 可过 IPC）。 */
export function canvasToPngArrayBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('canvas.toBlob 失败'))
        return
      }
      blob.arrayBuffer().then(resolve, reject)
    }, 'image/png')
  })
}
