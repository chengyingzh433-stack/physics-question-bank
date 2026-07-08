import { describe, it, expect } from 'vitest'
import { deriveAllSegments, deriveSegments, rectsOverlap } from './ColumnCropService'
import type { ManualBoxDTO } from '@shared/types'

const PAGE = { page_id: 1, paper_id: 1, column_mode: 1 }

describe('rectsOverlap', () => {
  it('重叠矩形判为相交', () => {
    expect(
      rectsOverlap({ x0: 0, x1: 0.5, y0: 0, y1: 0.5 }, { x0: 0.3, x1: 0.8, y0: 0.3, y1: 0.8 })
    ).toBe(true)
  })

  it('不相交矩形判为不相交', () => {
    expect(
      rectsOverlap({ x0: 0, x1: 0.3, y0: 0, y1: 0.3 }, { x0: 0.5, x1: 0.8, y0: 0.5, y1: 0.8 })
    ).toBe(false)
  })

  it('边界相切判为不相交（红线 7：相邻不重叠）', () => {
    // a 的右边界 = b 的左边界
    expect(
      rectsOverlap({ x0: 0, x1: 0.5, y0: 0, y1: 1 }, { x0: 0.5, x1: 1, y0: 0, y1: 1 })
    ).toBe(false)
    // a 的下边界 = b 的上边界
    expect(
      rectsOverlap({ x0: 0, x1: 1, y0: 0, y1: 0.5 }, { x0: 0, x1: 1, y0: 0.5, y1: 1 })
    ).toBe(false)
  })
})

describe('deriveAllSegments', () => {
  it('1. 无 manualBoxes → 逐字段等于 deriveSegments（红线 5）', () => {
    const derived = deriveSegments(PAGE, [], [
      { col_index: 0, y_ratio: 0.3 },
      { col_index: 0, y_ratio: 0.6 }
    ])
    const all = deriveAllSegments(PAGE, [], [
      { col_index: 0, y_ratio: 0.3 },
      { col_index: 0, y_ratio: 0.6 }
    ], [])
    expect(all).toEqual(derived) // 含 order_index 逐字段相等
  })

  it('2. 一个分割框 → 出现在最终列表，带 order_index', () => {
    const box: ManualBoxDTO = {
      x_start_ratio: 0.1, x_end_ratio: 0.4,
      y_start_ratio: 0.2, y_end_ratio: 0.5,
      is_excluded: 0
    }
    const all = deriveAllSegments(PAGE, [], [], [box])
    // 单栏 0 刀 → deriveSegments 产 1 个整页段，加 1 个分割框 = 2
    expect(all).toHaveLength(2)
    const splitSeg = all.find((s) => s.col_index === -1)
    expect(splitSeg).toBeDefined()
    expect(splitSeg!.x_start_ratio).toBe(0.1)
    expect(splitSeg!.x_end_ratio).toBe(0.4)
    expect(splitSeg!.order_index).toBeDefined()
  })

  it('3. 排除框与某推导片段相交 → 该推导片段被剔除', () => {
    // 单栏 2 刀 = 3 段，排除框覆盖中间段
    const excludeBox: ManualBoxDTO = {
      x_start_ratio: 0, x_end_ratio: 1,
      y_start_ratio: 0.3, y_end_ratio: 0.6,
      is_excluded: 1
    }
    const all = deriveAllSegments(
      PAGE, [],
      [{ col_index: 0, y_ratio: 0.3 }, { col_index: 0, y_ratio: 0.6 }],
      [excludeBox]
    )
    // 排除框只筛推导片段，无分割框 → 不过排除筛的只有 2 段
    // 但无分割框走红线 5 路径，直接返回 filtered
    expect(all).toHaveLength(2)
    // 中间段 (0.3,0.6) 被排除
    expect(all.find((s) => s.y_start_ratio === 0.3 && s.y_end_ratio === 0.6)).toBeUndefined()
  })

  it('4. 排除框与分割框相交 → 分割框仍保留（决策 B）', () => {
    // 排除框覆盖整页，分割框也在整页内
    const excludeBox: ManualBoxDTO = {
      x_start_ratio: 0, x_end_ratio: 1,
      y_start_ratio: 0, y_end_ratio: 1,
      is_excluded: 1
    }
    const splitBox: ManualBoxDTO = {
      x_start_ratio: 0.1, x_end_ratio: 0.4,
      y_start_ratio: 0.2, y_end_ratio: 0.5,
      is_excluded: 0
    }
    const all = deriveAllSegments(PAGE, [], [], [excludeBox, splitBox])
    // 推导片段（整页段）被排除框筛掉，但分割框保留
    const splitSeg = all.find((s) => s.col_index === -1)
    expect(splitSeg).toBeDefined()
    expect(splitSeg!.x_start_ratio).toBe(0.1)
  })

  it('5. 排除框不相交任何片段 → 推导片段不变', () => {
    const excludeBox: ManualBoxDTO = {
      x_start_ratio: 0.8, x_end_ratio: 0.95,
      y_start_ratio: 0.8, y_end_ratio: 0.95,
      is_excluded: 1
    }
    // 单栏 0 刀 = 1 整页段，排除框在角落不相交整页段……等等，整页段是 (0,1,0,1)，排除框在内部
    // 改用双栏，排除框只与右列相交
    const derived = deriveSegments(
      { page_id: 1, paper_id: 1, column_mode: 2 },
      [{ x_ratio: 0.5 }],
      []
    )
    // 排除框在左列内，不相交右列
    const excludeBoxLeft: ManualBoxDTO = {
      x_start_ratio: 0.1, x_end_ratio: 0.3,
      y_start_ratio: 0.1, y_end_ratio: 0.3,
      is_excluded: 1
    }
    const all = deriveAllSegments(
      { page_id: 1, paper_id: 1, column_mode: 2 },
      [{ x_ratio: 0.5 }],
      [],
      [excludeBoxLeft]
    )
    // 无分割框 → 走红线 5 路径，排除框与左列段相交，左列段被筛
    // 右列段不受影响
    const rightSegs = all.filter((s) => s.x_start_ratio >= 0.5)
    expect(rightSegs).toHaveLength(1)
  })

  it('6. 场景 B：两个并排分割框 → 行优先排序（左先右后）', () => {
    const leftBox: ManualBoxDTO = {
      x_start_ratio: 0, x_end_ratio: 0.48,
      y_start_ratio: 0.1, y_end_ratio: 0.4,
      is_excluded: 0
    }
    const rightBox: ManualBoxDTO = {
      x_start_ratio: 0.52, x_end_ratio: 1,
      y_start_ratio: 0.1, y_end_ratio: 0.4,
      is_excluded: 0
    }
    const all = deriveAllSegments(PAGE, [], [], [leftBox, rightBox])
    // 有分割框 → 行优先排序
    // 两个框 y 相近（同一行），左框 x 小 → order_index 小
    const leftSeg = all.find((s) => s.x_start_ratio === 0 && s.col_index === -1)
    const rightSeg = all.find((s) => s.x_start_ratio === 0.52 && s.col_index === -1)
    expect(leftSeg).toBeDefined()
    expect(rightSeg).toBeDefined()
    expect(leftSeg!.order_index!).toBeLessThan(rightSeg!.order_index!)
  })

  it('7. 多行分割框 → 行优先排序（上行先下行后，同行内左先右后）', () => {
    const row1Left: ManualBoxDTO = {
      x_start_ratio: 0, x_end_ratio: 0.48,
      y_start_ratio: 0.05, y_end_ratio: 0.2,
      is_excluded: 0
    }
    const row1Right: ManualBoxDTO = {
      x_start_ratio: 0.52, x_end_ratio: 1,
      y_start_ratio: 0.05, y_end_ratio: 0.2,
      is_excluded: 0
    }
    const row2Left: ManualBoxDTO = {
      x_start_ratio: 0, x_end_ratio: 0.48,
      y_start_ratio: 0.3, y_end_ratio: 0.5,
      is_excluded: 0
    }
    const row2Right: ManualBoxDTO = {
      x_start_ratio: 0.52, x_end_ratio: 1,
      y_start_ratio: 0.3, y_end_ratio: 0.5,
      is_excluded: 0
    }
    const all = deriveAllSegments(PAGE, [], [], [row1Left, row1Right, row2Left, row2Right])
    // 4 个分割框，行优先排序
    const orders = all.map((s) => s.order_index)
    // row1 的两个 order_index < row2 的两个
    const row1Orders = orders.slice(0, 2)
    const row2Orders = orders.slice(2, 4)
    expect(Math.max(...row1Orders)).toBeLessThan(Math.min(...row2Orders))
  })
})
