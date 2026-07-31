import { describe, it, expect } from 'vitest'
import { deriveAnswerItems, autoPairAnswers } from './AnswerMatchService'
import type { SegmentDTO } from '@shared/types'

function seg(id: number, orderIndex: number, pageId: number, isDeleted = 0): SegmentDTO {
  return {
    id,
    paper_id: 99,
    page_id: pageId,
    col_index: 0,
    x_start_ratio: 0,
    x_end_ratio: 1,
    y_start_ratio: 0,
    y_end_ratio: 1,
    order_index: orderIndex,
    is_deleted: isDeleted
  }
}

/** 取每个答案单元的 segment id 列表，便于断言。 */
function ids(items: { segmentIds: number[] }[]): number[][] {
  return items.map((i) => i.segmentIds)
}

describe('deriveAnswerItems — 散片段（无合并组）', () => {
  it('3 个片段 → 序号 1/2/3', () => {
    const items = deriveAnswerItems([seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10)])
    expect(items.map((i) => i.answerNumber)).toEqual([1, 2, 3])
    expect(ids(items)).toEqual([[1], [2], [3]])
  })

  it('散片段 key 用 segment id，稳定可作 React key', () => {
    const items = deriveAnswerItems([seg(7, 0, 10)])
    expect(items[0].key).toBe('a7')
    expect(items[0].questionId).toBeNull()
  })

  it('已删除片段被排除，且不占序号', () => {
    const items = deriveAnswerItems([
      seg(1, 0, 10),
      seg(2, 1, 10, 1), // 已删除
      seg(3, 2, 10)
    ])
    expect(ids(items)).toEqual([[1], [3]])
    expect(items.map((i) => i.answerNumber)).toEqual([1, 2])
  })

  it('跨页排序：先按 page_index，再按页内 order_index', () => {
    // page 20 是第 0 页，page 10 是第 1 页——故意让 page_id 大小与页序相反
    const pageIndexMap = new Map([[20, 0], [10, 1]])
    const items = deriveAnswerItems(
      [seg(1, 0, 10), seg(2, 1, 10), seg(3, 0, 20), seg(4, 1, 20)],
      new Map(),
      pageIndexMap
    )
    // 第 0 页的 3、4 在前，第 1 页的 1、2 在后
    expect(ids(items)).toEqual([[3], [4], [1], [2]])
    expect(items.map((i) => i.answerNumber)).toEqual([1, 2, 3, 4])
  })

  it('无 pageIndexMap 时退化为单页（全部 page_index=0），只按 order_index 排', () => {
    const items = deriveAnswerItems([seg(1, 2, 10), seg(2, 0, 10), seg(3, 1, 10)])
    expect(ids(items)).toEqual([[2], [3], [1]])
  })

  it('空列表 → 空结果', () => {
    expect(deriveAnswerItems([])).toEqual([])
  })
})

// M14.5：答案卷也会有 question 行（只承载合并组）。一个合并组 = 一个答案单元。
describe('deriveAnswerItems — 合并组（M14.5）', () => {
  it('3 片段 / 2 组（q1=[1,2], q2=[3]）→ 2 个答案单元，顺序按首片段', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10)]
    const map = new Map([
      [1, [1, 2]],
      [2, [3]]
    ])
    const items = deriveAnswerItems(segments, map)
    expect(items.map((i) => i.answerNumber)).toEqual([1, 2])
    expect(ids(items)).toEqual([[1, 2], [3]])
    expect(items.map((i) => i.key)).toEqual(['q1', 'q2'])
    expect(items.map((i) => i.questionId)).toEqual([1, 2])
    expect(items[0].segments.map((s) => s.id)).toEqual([1, 2])
  })

  it('不在任何合并组里的片段退化为单片段单元（老答案卷兼容）', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10), seg(3, 2, 10)]
    const map = new Map([[5, [2, 3]]])
    const items = deriveAnswerItems(segments, map)
    // seg1 散着，seg2+3 是一组；按首片段 order_index 排 → 散片段在前
    expect(ids(items)).toEqual([[1], [2, 3]])
    expect(items.map((i) => i.key)).toEqual(['a1', 'q5'])
    expect(items.map((i) => i.questionId)).toEqual([null, 5])
  })

  it('合并组内片段按 merge_order 拼，不按 order_index', () => {
    // map 里故意倒序：[3,1] —— 拼合顺序应尊重 merge_order
    const segments = [seg(1, 0, 10), seg(3, 2, 10)]
    const items = deriveAnswerItems(segments, new Map([[9, [3, 1]]]))
    expect(ids(items)).toEqual([[3, 1]])
  })

  it('合并组里的片段被部分删除 → 组仍在，只保留活片段', () => {
    const segments = [seg(1, 0, 10), seg(2, 1, 10, 1), seg(3, 2, 10)]
    const items = deriveAnswerItems(segments, new Map([[9, [1, 2, 3]]]))
    expect(ids(items)).toEqual([[1, 3]])
  })

  it('合并组里的片段全被删除 → 整组消失，不占序号', () => {
    const segments = [seg(1, 0, 10, 1), seg(2, 1, 10, 1), seg(3, 2, 10)]
    const map = new Map([
      [9, [1, 2]],
      [10, [3]]
    ])
    const items = deriveAnswerItems(segments, map)
    expect(ids(items)).toEqual([[3]])
    expect(items.map((i) => i.answerNumber)).toEqual([1])
  })

  it('跨页合并组：按首片段所在页排序', () => {
    // page 20 是第 0 页，page 10 是第 1 页
    const pageIndexMap = new Map([[20, 0], [10, 1]])
    const segments = [seg(1, 0, 10), seg(2, 0, 20), seg(3, 1, 20)]
    // 组 q7 = [2(第0页), 1(第1页)] 跨页；散片段 3 在第 0 页
    const items = deriveAnswerItems(segments, new Map([[7, [2, 1]]]), pageIndexMap)
    // q7 首片段是 seg2（第 0 页 order 0），排在 seg3（第 0 页 order 1）之前
    expect(ids(items)).toEqual([[2, 1], [3]])
  })
})

describe('autoPairAnswers', () => {
  it('数量相等：按序一一对应', () => {
    const items = deriveAnswerItems([seg(11, 0, 10), seg(12, 1, 10), seg(13, 2, 10)])
    const pairs = autoPairAnswers([101, 102, 103], items)
    expect(pairs).toEqual([
      { questionId: 101, segmentIds: [11] },
      { questionId: 102, segmentIds: [12] },
      { questionId: 103, segmentIds: [13] }
    ])
  })

  it('合并组参与配对时带上整组片段', () => {
    const items = deriveAnswerItems(
      [seg(11, 0, 10), seg(12, 1, 10), seg(13, 2, 10)],
      new Map([[1, [11, 12]]])
    )
    const pairs = autoPairAnswers([101, 102], items)
    expect(pairs).toEqual([
      { questionId: 101, segmentIds: [11, 12] },
      { questionId: 102, segmentIds: [13] }
    ])
  })

  it('题多于答案：多出的题无答案（空数组）', () => {
    const items = deriveAnswerItems([seg(11, 0, 10)])
    const pairs = autoPairAnswers([101, 102], items)
    expect(pairs).toEqual([
      { questionId: 101, segmentIds: [11] },
      { questionId: 102, segmentIds: [] }
    ])
  })

  it('答案多于题：多出的答案片段不进配对', () => {
    const items = deriveAnswerItems([seg(11, 0, 10), seg(12, 1, 10), seg(13, 2, 10)])
    const pairs = autoPairAnswers([101], items)
    expect(pairs).toEqual([{ questionId: 101, segmentIds: [11] }])
  })

  it('答案为空：所有题都无答案', () => {
    const pairs = autoPairAnswers([101, 102], [])
    expect(pairs).toEqual([
      { questionId: 101, segmentIds: [] },
      { questionId: 102, segmentIds: [] }
    ])
  })

  it('配对顺序与传入的题目顺序一致', () => {
    const items = deriveAnswerItems([seg(11, 0, 10), seg(12, 1, 10)])
    const pairs = autoPairAnswers([202, 201], items)
    expect(pairs.map((p) => p.questionId)).toEqual([202, 201])
    expect(pairs.map((p) => p.segmentIds)).toEqual([[11], [12]])
  })
})
