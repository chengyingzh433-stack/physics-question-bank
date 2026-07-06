import { describe, it, expect } from 'vitest'
import {
  deriveSegments,
  segmentPixelRows,
  ratioToPx,
  computeComposedSize,
  computeSegmentXOffset
} from './ColumnCropService'

describe('deriveSegments', () => {
  it('单栏 0 刀 = 1 段（整页）', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 1 },
      [],
      []
    )
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({
      col_index: 0,
      x_start_ratio: 0,
      x_end_ratio: 1,
      y_start_ratio: 0,
      y_end_ratio: 1,
      order_index: 0
    })
  })

  it('单栏 2 刀 = 3 段，按 y 升序', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 1 },
      [],
      [
        { col_index: 0, y_ratio: 0.3 },
        { col_index: 0, y_ratio: 0.6 }
      ]
    )
    expect(segs).toHaveLength(3)
    expect(segs.map((s) => s.y_start_ratio)).toEqual([0, 0.3, 0.6])
    expect(segs.map((s) => s.y_end_ratio)).toEqual([0.3, 0.6, 1])
    expect(segs.map((s) => s.order_index)).toEqual([0, 1, 2])
  })

  it('双栏各 1 刀 = 4 段，顺序为 左上/左下/右上/右下', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 2 },
      [{ x_ratio: 0.5 }],
      [
        { col_index: 0, y_ratio: 0.4 },
        { col_index: 1, y_ratio: 0.7 }
      ]
    )
    expect(segs).toHaveLength(4)
    // 左列
    expect(segs[0]).toMatchObject({ col_index: 0, y_start_ratio: 0, y_end_ratio: 0.4 })
    expect(segs[1]).toMatchObject({ col_index: 0, y_start_ratio: 0.4, y_end_ratio: 1 })
    // 右列
    expect(segs[2]).toMatchObject({ col_index: 1, y_start_ratio: 0, y_end_ratio: 0.7 })
    expect(segs[3]).toMatchObject({ col_index: 1, y_start_ratio: 0.7, y_end_ratio: 1 })
    // 顺序
    expect(segs.map((s) => s.order_index)).toEqual([0, 1, 2, 3])
    // 双列 x 区间
    expect(segs[0].x_start_ratio).toBe(0)
    expect(segs[0].x_end_ratio).toBe(0.5)
    expect(segs[2].x_start_ratio).toBe(0.5)
    expect(segs[2].x_end_ratio).toBe(1)
  })

  it('双栏左右列横切线互不干扰', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 2 },
      [{ x_ratio: 0.5 }],
      [
        { col_index: 0, y_ratio: 0.3 },
        { col_index: 0, y_ratio: 0.6 },
        { col_index: 1, y_ratio: 0.2 }
      ]
    )
    const left = segs.filter((s) => s.col_index === 0)
    const right = segs.filter((s) => s.col_index === 1)
    expect(left).toHaveLength(3) // 2 刀 = 3 段
    expect(right).toHaveLength(2) // 1 刀 = 2 段
  })

  it('三栏 0 刀 = 3 段，x 均分', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 3 },
      [],
      []
    )
    expect(segs).toHaveLength(3)
    // 分隔线不足时补均分：1/3, 2/3
    expect(segs[0].x_start_ratio).toBe(0)
    expect(Math.abs(segs[0].x_end_ratio - 1 / 3)).toBeLessThan(1e-9)
    expect(Math.abs(segs[1].x_start_ratio - 1 / 3)).toBeLessThan(1e-9)
    expect(Math.abs(segs[1].x_end_ratio - 2 / 3)).toBeLessThan(1e-9)
    expect(segs[2].x_end_ratio).toBe(1)
  })

  it('拖动分隔线后横切线仍归属各自列（解耦）', () => {
    // 分隔线从 0.5 拖到 0.4，左列刀仍在左列
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 2 },
      [{ x_ratio: 0.4 }],
      [{ col_index: 0, y_ratio: 0.5 }]
    )
    const left = segs.filter((s) => s.col_index === 0)
    expect(left).toHaveLength(2)
    expect(left[0].x_end_ratio).toBe(0.4)
  })

  it('过滤零高退化段（重复 y_ratio）', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 1 },
      [],
      [
        { col_index: 0, y_ratio: 0.5 },
        { col_index: 0, y_ratio: 0.5 } // 重复
      ]
    )
    // 重复刀应被去重为一条边界，得到 2 段而非 3 段
    expect(segs).toHaveLength(2)
  })

  it('clamp 越界分隔线', () => {
    const segs = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 2 },
      [{ x_ratio: 1.5 }], // 越界
      []
    )
    expect(segs.length).toBeGreaterThanOrEqual(1)
    // 所有 x_ratio 都应在 [0,1]
    for (const s of segs) {
      expect(s.x_start_ratio).toBeGreaterThanOrEqual(0)
      expect(s.x_end_ratio).toBeLessThanOrEqual(1)
    }
  })
})

describe('segmentPixelRows (A5 相邻段像素相接)', () => {
  it('相邻两段共用边界像素，无白缝无重叠', () => {
    const sizePt = 842
    const dpi = 300
    // 上段 [0, 0.5)，下段 [0.5, 1)
    const upper = segmentPixelRows(0, 0.5, sizePt, dpi)
    const lower = segmentPixelRows(0.5, 1, sizePt, dpi, upper.endPx)
    // 上段 endPx == 下段 startPx（首尾相接）
    expect(lower.startPx).toBe(upper.endPx)
    // 都为正整数
    expect(Number.isInteger(upper.startPx)).toBe(true)
    expect(Number.isInteger(upper.endPx)).toBe(true)
    expect(upper.endPx).toBeGreaterThan(upper.startPx)
    expect(lower.endPx).toBeGreaterThan(lower.startPx)
  })

  it('ratioToPx 换算正确', () => {
    // R8: px = ratio * size_pt * (dpi/72)
    expect(ratioToPx(1, 842, 300)).toBeCloseTo(842 * (300 / 72), 5)
    expect(ratioToPx(0.5, 842, 72)).toBeCloseTo(421, 5)
  })
})

describe('composeQuestionCanvas 尺寸数学 (R1)', () => {
  it('取最大宽度，总高=各段高度之和', () => {
    const r = computeComposedSize([
      { widthPx: 200, heightPx: 100 },
      { widthPx: 300, heightPx: 150 },
      { widthPx: 250, heightPx: 120 }
    ])
    expect(r.widthPx).toBe(300) // 最大宽度
    expect(r.heightPx).toBe(370) // 100+150+120
  })

  it('较窄段水平居中（x 偏移 = floor((maxW-segW)/2)）', () => {
    expect(computeSegmentXOffset(200, 300)).toBe(50)
    expect(computeSegmentXOffset(300, 300)).toBe(0)
    expect(computeSegmentXOffset(201, 300)).toBe(49) // floor(99/2)=49
  })

  it('空列表返回 1x1', () => {
    const r = computeComposedSize([])
    expect(r.widthPx).toBe(1)
    expect(r.heightPx).toBe(1)
  })

  it('单段：宽=段宽，高=段高', () => {
    const r = computeComposedSize([{ widthPx: 400, heightPx: 200 }])
    expect(r.widthPx).toBe(400)
    expect(r.heightPx).toBe(200)
  })
})
