import type {
  ColumnDividerDTO,
  CutLineDTO,
  ManualBoxDTO,
  SegmentDTO
} from '@shared/types'

export interface PageCropInput {
  page_id: number
  paper_id: number
  column_mode: number // 1/2/3
}

/**
 * 由 分列(column_mode + dividers) 与 横切(cutLines) 派生片段。
 *
 * 规则：
 * - n 列 = n-1 条分隔线，列 x 区间由分隔线切分：[0, d1, d2, ..., 1]。
 * - 每列内 y 边界 = [0, ...该列 cutLines 的 y_ratio 升序, 1]，相邻两值成一段。
 * - order_index 按 页→列(左→右)→y(上→下) 排序。
 * - A13: 过滤零高/零宽退化段（y_start>=y_end 或 x_start>=x_end）。
 *
 * 输出比例坐标，渲染时再按 A5 共用边界像素换算。
 */
export function deriveSegments(
  page: PageCropInput,
  dividers: ColumnDividerDTO[],
  cutLines: CutLineDTO[]
): SegmentDTO[] {
  const mode = Math.max(1, Math.min(3, Math.floor(page.column_mode)))

  // 列 x 边界：n 列 = n+1 个边界点（含 0 与 1）
  // 分隔线先夹到 (eps, 1-eps) 不碰端点，避免越界与端点去重导致列数变化（A13）
  const eps = 1e-6
  const sortedDivX = dividers
    .map((d) => Math.max(eps, Math.min(1 - eps, d.x_ratio)))
    .sort((a, b) => a - b)
  // 仅取前 mode-1 条（多余的分隔线忽略，不足则补均分）
  const xs: number[] = [0]
  if (sortedDivX.length >= mode - 1) {
    xs.push(...sortedDivX.slice(0, mode - 1))
  } else {
    // 不足：补均分点
    for (let i = 1; i < mode; i++) {
      if (i - 1 < sortedDivX.length) {
        xs.push(sortedDivX[i - 1])
      } else {
        xs.push(i / mode)
      }
    }
  }
  xs.push(1)
  // 边界点保证严格递增（分隔线已夹离端点，这里只防分隔线彼此过近）
  const clampedXs = clampStrictlyIncreasing(xs, 0, 1)

  const segments: SegmentDTO[] = []
  let order = 0

  for (let col = 0; col < mode; col++) {
    const xStart = clampedXs[col]
    const xEnd = clampedXs[col + 1]
    if (xEnd - xStart <= 0) continue // 退化列跳过

    // 该列的横切线，按 y 升序
    const ys = cutLines
      .filter((l) => l.col_index === col)
      .map((l) => l.y_ratio)
      .sort((a, b) => a - b)

    // y 边界 = [0, ...ys, 1]，相邻成段
    const yBounds = clampStrictlyIncreasing([0, ...ys, 1], 0, 1)
    for (let i = 0; i < yBounds.length - 1; i++) {
      const yStart = yBounds[i]
      const yEnd = yBounds[i + 1]
      if (yEnd - yStart <= 0) continue // A13 退化段跳过
      segments.push({
        paper_id: page.paper_id,
        page_id: page.page_id,
        col_index: col,
        x_start_ratio: xStart,
        x_end_ratio: xEnd,
        y_start_ratio: yStart,
        y_end_ratio: yEnd,
        order_index: order++,
        is_deleted: 0
      })
    }
  }

  return segments
}

/** 把一组边界点夹紧到 [min,max] 并保证严格递增（去重 + 微扰），用于消除浮点/越界。 */
function clampStrictlyIncreasing(values: number[], min: number, max: number): number[] {
  const eps = 1e-9
  const out: number[] = []
  for (let v of values) {
    v = Math.max(min, Math.min(max, v))
    if (out.length === 0) {
      out.push(v)
      continue
    }
    const prev = out[out.length - 1]
    // 重复或极近的值：去重（合并为同一边界），不产生退化段
    if (v - prev < eps) continue
    out.push(v)
  }
  return out
}

// ---- 像素换算工具（A5: 相邻段共用边界像素，避免 1px 白缝/重叠）----

/** px = ratio * size_pt * (dpi/72)（R8）。 */
export function ratioToPx(ratio: number, sizePt: number, dpi: number): number {
  return ratio * sizePt * (dpi / 72)
}

/**
 * 把某段在高度方向上的像素区间换算为整数，使相邻段首尾相接（A5）。
 * 上段区间 [floor(y0px), floor(y1px))，下段从 floor(y1px) 开始，共用 floor(y1px)。
 */
export function segmentPixelRows(
  yStartRatio: number,
  yEndRatio: number,
  sizePt: number,
  dpi: number,
  y0Floor?: number
): { startPx: number; endPx: number } {
  const y0px = ratioToPx(yStartRatio, sizePt, dpi)
  const y1px = ratioToPx(yEndRatio, sizePt, dpi)
  const startPx = y0Floor ?? Math.floor(y0px)
  const endPx = Math.floor(y1px)
  return { startPx, endPx: Math.max(endPx, startPx + 1) }
}

// ---- 入库标准图尺寸数学（纯函数；canvas 操作见 QuestionRenderService）----

export interface PageGeom {
  page_index: number
  width_pt: number
  height_pt: number
}

/**
 * R1 合成的尺寸数学（纯函数，便于单测）：取最大宽度，总高 = 各段高度之和。
 */
export function computeComposedSize(sizes: { widthPx: number; heightPx: number }[]): {
  widthPx: number
  heightPx: number
} {
  if (sizes.length === 0) return { widthPx: 1, heightPx: 1 }
  const maxWidth = Math.max(...sizes.map((s) => s.widthPx))
  const totalHeight = sizes.reduce((sum, s) => sum + s.heightPx, 0)
  return { widthPx: maxWidth, heightPx: totalHeight }
}

/** R1: 每段在合成 canvas 内的 x 偏移（水平居中）。 */
export function computeSegmentXOffset(segWidth: number, maxWidth: number): number {
  return Math.floor((maxWidth - segWidth) / 2)
}

// ---- 框选合并（deriveAllSegments）----

/** 两比例坐标矩形是否有面积重叠（AABB 相交判定）。边界相切不算重叠。 */
export function rectsOverlap(
  a: { x0: number; x1: number; y0: number; y1: number },
  b: { x0: number; x1: number; y0: number; y1: number }
): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
}

/** y 分桶容差：同容差内视为同一行（行优先排序用）。 */
const ROW_BUCKET_TOLERANCE = 0.02

/**
 * 合并「分列+横切推导片段」与「手画框」，产出最终片段列表。
 *
 * 合并语义（决策 B）：
 *   最终 = ( deriveSegments 推导片段 − 与任一排除框相交的 ) ∪ ( 所有分割框 )
 * 分割框不过排除筛——排除框只减推导片段，不减分割框。
 *
 * 排序（决策 C）：
 * - 无分割框时：原样返回 deriveSegments（含原 order_index），红线 5 保证。
 * - 有分割框时：全页片段按 (y 分桶, x) 行优先重排 order_index。
 */
export function deriveAllSegments(
  page: PageCropInput,
  dividers: ColumnDividerDTO[],
  cutLines: CutLineDTO[],
  manualBoxes: ManualBoxDTO[]
): SegmentDTO[] {
  // 1. 推导片段（deriveSegments 一行不改）
  const derived = deriveSegments(page, dividers, cutLines)

  // 2. 拆 manualBoxes
  const excludeBoxes = manualBoxes.filter((b) => b.is_excluded === 1)
  const splitBoxes = manualBoxes.filter((b) => b.is_excluded === 0)

  // 3. 推导片段过排除筛（只筛推导片段，决策 B）
  const filtered = derived.filter((seg) => {
    const segRect = {
      x0: seg.x_start_ratio,
      x1: seg.x_end_ratio,
      y0: seg.y_start_ratio,
      y1: seg.y_end_ratio
    }
    return !excludeBoxes.some((box) =>
      rectsOverlap(segRect, {
        x0: box.x_start_ratio,
        x1: box.x_end_ratio,
        y0: box.y_start_ratio,
        y1: box.y_end_ratio
      })
    )
  })

  // 4. 分割框转 SegmentDTO 直接加入（不过排除筛）
  const splitSegs: SegmentDTO[] = splitBoxes.map((box) => ({
    paper_id: page.paper_id,
    page_id: page.page_id,
    col_index: -1, // -1 标记手画
    x_start_ratio: box.x_start_ratio,
    x_end_ratio: box.x_end_ratio,
    y_start_ratio: box.y_start_ratio,
    y_end_ratio: box.y_end_ratio,
    order_index: 0, // 后面统一排
    is_deleted: 0
  }))

  const merged = [...filtered, ...splitSegs]

  // 5. 排序（决策 C）
  if (splitBoxes.length === 0) {
    // 无分割框 → 原样返回（红线 5：order_index 保持 deriveSegments 原值）
    return filtered
  }

  // 有分割框 → 行优先重排
  merged.sort((a, b) => {
    // y 分桶：差在容差内视为同一行
    const yDiff = a.y_start_ratio - b.y_start_ratio
    if (Math.abs(yDiff) > ROW_BUCKET_TOLERANCE) {
      return yDiff < 0 ? -1 : 1 // 跨行按 y 升序
    }
    // 同行内按 x 升序
    const xDiff = a.x_start_ratio - b.x_start_ratio
    return xDiff < 0 ? -1 : xDiff > 0 ? 1 : 0
  })

  // 重编 order_index
  for (let i = 0; i < merged.length; i++) {
    merged[i].order_index = i
  }

  return merged
}
